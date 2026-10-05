import { createHash, randomBytes, randomUUID } from 'crypto';
import db from '../db.js';
import { requireAdmin } from './admin-users.js';

export function listInviteCodesHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const invites = db.prepare(`
    SELECT id, code_hint, created_at, expires_at, max_uses, use_count, revoked_at
    FROM signup_invite_codes ORDER BY created_at DESC LIMIT 200
  `).all();
  res.json({ invites });
}

export function createInviteCodeHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const durationMs = Number(req.body?.durationMs);
  const maxUses = Number(req.body?.maxUses);
  const allowedDurations = new Set([60 * 60 * 1000, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000, 30 * 24 * 60 * 60 * 1000]);
  if (!allowedDurations.has(durationMs) || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000) {
    return res.status(400).json({ error: 'Choose a valid duration and a use limit from 1 to 10,000.' });
  }

  const code = randomBytes(16).toString('hex').toUpperCase();
  const now = Date.now();
  db.prepare(`
    INSERT INTO signup_invite_codes (id, code_hash, code_hint, created_by, created_at, expires_at, max_uses)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    createHash('sha256').update(code).digest('hex'),
    code.slice(-6),
    req.session.user.id,
    now,
    now + durationMs,
    maxUses,
  );
  res.status(201).json({ code, expiresAt: now + durationMs, maxUses });
}

export function revokeInviteCodeHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || '');
  const result = db.prepare(`
    UPDATE signup_invite_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
  `).run(Date.now(), id);
  if (!result.changes) return res.status(404).json({ error: 'Invitation code not found or already revoked.' });
  res.json({ message: 'Invitation code revoked.' });
}