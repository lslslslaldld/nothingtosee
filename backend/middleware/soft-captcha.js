import { clearGateCookie } from '../cap/store.js';
import { toIPv4, updateIPReputation } from './security.js';
import { markChallengeRequired } from './challenge-risk.js';

export function wantsHtml(req) {
  const accept = String(req.headers?.accept || '');
  return accept.includes('text/html') && !accept.includes('application/json');
}

export function softCaptchaResponse(req, res, shield, reason = 'rate_limit') {
  const ip = toIPv4(null, req);
  updateIPReputation(ip, -1);
  markChallengeRequired(ip);
  try {
    shield?.incrementBlocked?.(ip, reason);
  } catch {}
  try {
    clearGateCookie(res, req);
  } catch {}
  if (wantsHtml(req) && (req.method === 'GET' || req.method === 'HEAD')) {
    return res.redirect(302, '/verify?reason=activity');
  }
  return res.status(403).json({
    error: 'Verification required',
    code: 'CAPTCHA_REQUIRED',
  });
}

export function extremeAbuseResponse(req, res, shield, reason = 'extreme_rate') {
  const ip = toIPv4(null, req);
  updateIPReputation(ip, -25);
  markChallengeRequired(ip, 60 * 60000);
  try {
    shield?.incrementBlocked?.(ip, reason);
  } catch {}
  return res.status(429).json({ error: 'Too many requests' });
}
