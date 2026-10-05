import db from '../db.js';

export function listNotificationsHandler(req, res) {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  const uid = req.session.user.id;
  const rows = db
    .prepare(
      `SELECT n.id, n.kind, n.ref_type, n.ref_id, n.body, n.created_at, n.read,
              u.username as actor_username, u.avatar_url as actor_avatar
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 40`
    )
    .all(uid);

  const unread = db
    .prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0`)
    .get(uid)?.c || 0;

  res.json({
    unread: Number(unread) || 0,
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      refType: r.ref_type,
      refId: r.ref_id,
      body: r.body || '',
      createdAt: r.created_at,
      read: !!r.read,
      actorUsername: r.actor_username || null,
      actorAvatar: r.actor_avatar && String(r.actor_avatar).startsWith('/uploads/avatars/')
        ? r.actor_avatar
        : null,
    })),
  });
}

export function markNotificationsReadHandler(req, res) {
  if (!req.session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  const uid = req.session.user.id;
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.filter((x) => typeof x === 'string' && x.length <= 80).slice(0, 40)
    : null;

  if (ids && ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${placeholders})`
    ).run(uid, ...ids);
  } else {
    db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`).run(uid);
  }

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  db.prepare(`DELETE FROM notifications WHERE user_id = ? AND created_at < ?`).run(uid, cutoff);

  res.json({ ok: true });
}
