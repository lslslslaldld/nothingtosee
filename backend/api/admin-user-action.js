import bcrypt from 'bcrypt';
import db from '../db.js';
import { isOwnerEmail } from '../utils/auth-roles.js';
import { getClientIP } from '../utils/client-ip.js';
import { banIp, unbanIp } from '../middleware/ip-ban.js';
import { blockIPKernel } from '../security/xdp-integration.js';
import { requireAdmin } from './admin-users.js';
import { sanitizeUsername, validateUsername } from '../utils/sanitize.js';

const BCRYPT_ROUNDS = 12;

export async function adminUserActionHandler(req, res) {
  if (!requireAdmin(req, res)) return;

  const admin = db.prepare('SELECT is_admin, email FROM users WHERE id = ?').get(req.session.user.id);
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

  const isOwner = isOwnerEmail(admin.email);
  if (admin.is_admin < 1 && !isOwner) return res.status(403).json({ error: 'Admin access required' });

  const { userId, action } = req.body;
  const allowed = ['suspend', 'staff', 'promote_mod', 'delete', 'ban', 'unban', 'promote_admin', 'demote_admin', 'verify_email', 'update_account', 'deactivate', 'reactivate'];
  if (!userId || !allowed.includes(action)) return res.status(400).json({ error: 'Invalid request' });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(userId))) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  if (userId === req.session.user.id) return res.status(400).json({ error: 'Cannot manage yourself' });

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (isOwnerEmail(target.email)) return res.status(403).json({ error: 'Cannot manage the owner.' });

  const roleActions = ['promote_admin', 'demote_admin', 'staff', 'promote_mod'];
  if (roleActions.includes(action) && !isOwner) {
    return res.status(403).json({ error: 'Only the owner can manage staff and admin roles.' });
  }

  if (action === 'staff') {
    db.prepare('UPDATE users SET is_admin = 2 WHERE id = ?').run(userId);
    return res.json({ message: 'User promoted to staff.', is_admin: 2 });
  }
  if (action === 'promote_mod') {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
    return res.json({ message: 'User promoted to mod.', is_admin: 1 });
  }
  if (action === 'promote_admin') {
    db.prepare('UPDATE users SET is_admin = 3 WHERE id = ?').run(userId);
    return res.json({ message: 'User promoted to admin.', is_admin: 3 });
  }
  if (action === 'demote_admin') {
    db.prepare('UPDATE users SET is_admin = 0 WHERE id = ?').run(userId);
    return res.json({ message: 'User demoted.', is_admin: 0 });
  }

  const canModerate = isOwner || admin.is_admin >= 1;
  if (!canModerate) return res.status(403).json({ error: 'Forbidden' });

  if (!isOwner && (admin.is_admin || 0) <= (target.is_admin || 0)) {
    return res.status(403).json({ error: 'You cannot moderate a user at or above your role.' });
  }

  if (action === 'deactivate' || action === 'reactivate') {
    const accountActive = action === 'reactivate' ? 1 : 0;
    db.prepare('UPDATE users SET account_active = ? WHERE id = ?').run(accountActive, userId);
    return res.json({ message: accountActive ? 'Account reactivated.' : 'Account deactivated.', account_active: accountActive });
  }

  if (action === 'update_account') {
    const usernameError = validateUsername(req.body?.username);
    if (usernameError) return res.status(400).json({ error: usernameError });
    const username = sanitizeUsername(req.body.username);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (!isOwner && isOwnerEmail(email)) return res.status(403).json({ error: 'Only the owner can assign the owner email.' });
    if (password && (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))) {
      return res.status(400).json({ error: 'Password must be 8-128 characters and include a letter and a number.' });
    }
    const duplicateEmail = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').get(email, userId);
    if (duplicateEmail) return res.status(409).json({ error: 'That email is already in use.' });
    const duplicateUsername = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?) AND id != ?').get(username, userId);
    if (duplicateUsername) return res.status(409).json({ error: 'That username is already in use.' });
    if (password) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      db.prepare(`UPDATE users SET username = ?, email = ?, password_hash = ?,
        email_verified = CASE WHEN lower(email) != ? THEN 0 ELSE email_verified END, updated_at = ? WHERE id = ?`)
        .run(username, email, passwordHash, email, Date.now(), userId);
    } else {
      db.prepare(`UPDATE users SET username = ?, email = ?,
        email_verified = CASE WHEN lower(email) != ? THEN 0 ELSE email_verified END, updated_at = ? WHERE id = ?`)
        .run(username, email, email, Date.now(), userId);
    }
    return res.json({ message: 'Account updated.' });
  }

  if (action === 'verify_email') {
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
    return res.json({ message: 'Email verified.', email_verified: 1 });
  }
  if (action === 'suspend') {
    db.prepare('UPDATE users SET email_verified = 0 WHERE id = ?').run(userId);
    return res.json({ message: 'User suspended.' });
  }
  if (action === 'ban') {
    const ip = target.ip || getClientIP(req);
    db.prepare('UPDATE users SET banned = 1, email_verified = 0 WHERE id = ?').run(userId);
    if (target.ip) {
      db.prepare('UPDATE users SET banned = 1, email_verified = 0 WHERE ip = ? AND id != ?').run(target.ip, userId);
      banIp(target.ip, req.session.user.id);
      blockIPKernel(target.ip).catch(() => {});
    }
    return res.json({ message: 'User and IP banned.', banned: 1 });
  }
  if (action === 'unban') {
    db.prepare('UPDATE users SET banned = 0 WHERE id = ?').run(userId);
    if (target.ip) {
      db.prepare('UPDATE users SET banned = 0 WHERE ip = ?').run(target.ip);
      unbanIp(target.ip);
    }
    return res.json({ message: 'User unbanned.', banned: 0 });
  }
  if (action === 'delete') {
    if (target.ip) unbanIp(target.ip);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return res.json({ message: 'User deleted.' });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
