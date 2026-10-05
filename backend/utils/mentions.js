import { randomUUID } from 'crypto';
import db from '../db.js';

const MENTION_RE = /@([A-Za-z][A-Za-z0-9_]{2,31})/g;
const MAX_MENTIONS = 8;

export function extractMentionHandles(...parts) {
  const found = new Set();
  for (const part of parts) {
    if (!part || typeof part !== 'string') continue;
    MENTION_RE.lastIndex = 0;
    let m;
    while ((m = MENTION_RE.exec(part)) && found.size < MAX_MENTIONS) {
      found.add(m[1].toLowerCase());
    }
    if (found.size >= MAX_MENTIONS) break;
  }
  return [...found];
}

export function createMentionNotifications({
  actorId,
  text,
  title,
  refType,
  refId,
  preview,
}) {
  if (!actorId || !refType || !refId) return 0;
  const handles = extractMentionHandles(title, text);
  if (!handles.length) return 0;

  const placeholders = handles.map(() => '?').join(',');
  const users = db
    .prepare(`SELECT id, username FROM users WHERE lower(username) IN (${placeholders})`)
    .all(...handles);
  if (!users.length) return 0;

  const now = Date.now();
  const body = String(preview || text || title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  const insert = db.prepare(
    `INSERT INTO notifications (id, user_id, kind, actor_id, ref_type, ref_id, body, created_at, read)
     VALUES (?, ?, 'mention', ?, ?, ?, ?, ?, 0)`
  );

  let n = 0;
  const tx = db.transaction(() => {
    for (const u of users) {
      if (!u?.id || u.id === actorId) continue;
      insert.run(randomUUID(), u.id, actorId, refType, refId, body, now);
      n += 1;
    }
  });
  tx();
  return n;
}

export function parseTargetIps(raw) {
  if (Array.isArray(raw)) {
    return normalizeIpList(raw.map((x) => String(x)));
  }
  if (typeof raw !== 'string') return [];
  return normalizeIpList(raw.split(/[\s,;]+/));
}

function normalizeIpList(parts) {
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const ip = String(part || '').trim();
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) continue;
    const octets = ip.split('.').map(Number);
    if (octets.some((o) => o > 255)) continue;
    if (seen.has(ip)) continue;
    seen.add(ip);
    out.push(ip);
    if (out.length >= 32) break;
  }
  return out;
}

export function serializeTargetIps(ips) {
  const list = Array.isArray(ips) ? ips : [];
  if (!list.length) return null;
  return JSON.stringify(list);
}

export function parseStoredTargetIps(raw) {
  if (!raw) return [];
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeIpList(parsed);
  } catch {}
  return parseTargetIps(raw);
}

export function ipInTargetList(clientIp, stored) {
  const list = parseStoredTargetIps(stored);
  if (!list.length) return false;
  return list.includes(String(clientIp || ''));
}
