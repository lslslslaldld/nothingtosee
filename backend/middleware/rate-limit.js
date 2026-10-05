import { toIPv4, extractToken, verifyToken, updateIPReputation } from './security.js';
import { hasValidGate } from '../cap/store.js';
import { softCaptchaResponse, extremeAbuseResponse } from './soft-captcha.js';
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60000,
  max: 40,
  keyGenerator: req => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -5);
    res.status(429).json({ error: 'Too many authentication attempts. Try again later.' });
  }
});

export const signinLimiter = rateLimit({
  windowMs: 15 * 60000,
  max: 20,
  keyGenerator: req => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -8);
    res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
  },
});

export const signupLimiter = rateLimit({
  windowMs: 3600000,
  max: 6,
  keyGenerator: req => toIPv4(null, req),
  message: 'Too many accounts created from this IP.'
});

export const pfpLimiter = rateLimit({
  windowMs: 3600000,
  max: 8,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  message: 'Too many profile picture uploads.'
});

export const securityActionLimiter = rateLimit({
  windowMs: 15 * 60000,
  max: 16,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    updateIPReputation(toIPv4(null, req), -6);
    res.status(429).json({ error: 'Too many security actions. Try again later.' });
  },
});

export const adminOverviewLimiter = rateLimit({
  windowMs: 60000,
  max: 60,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many overview requests' },
});

export const localStorageLimiter = rateLimit({
  windowMs: 60000,
  max: 24,
  keyGenerator: req => req.session?.user?.id || toIPv4(null, req),
  message: 'Too many saves, slow down.'
});

export const aiConversationsLimiter = rateLimit({
  windowMs: 60_000,
  max: 80,
  keyGenerator: (req) => (req.session?.user?.id ? `u:${req.session.user.id}` : toIPv4(null, req)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI chat requests. Slow down.' },
});

export const musicStreamLimiter = rateLimit({
  windowMs: 60_000,
  max: 4800,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Stream limit reached' },
});

export const musicBrowseLimiter = rateLimit({
  windowMs: 60_000,
  max: 320,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many music browse requests' },
});

export const musicSearchLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many music searches. Slow down.' },
});

export const musicPlayLimiter = rateLimit({
  windowMs: 60_000,
  max: 280,
  keyGenerator: (req) => toIPv4(null, req),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many play requests. Slow down.' },
});

function resolveAuth(req) {
  if (req._pzAuth) return req._pzAuth;
  if (req.session?.user?.id) {
    req._pzAuth = { kind: 'user', id: req.session.user.id };
    return req._pzAuth;
  }
  const token = extractToken(req);
  if (token && verifyToken(token, req)) {
    req._pzAuth = { kind: 'token', id: token.slice(0, 16) };
    return req._pzAuth;
  }
  req._pzAuth = { kind: 'anon', id: toIPv4(null, req) };
  return req._pzAuth;
}

function apiKey(req) {
  const a = resolveAuth(req);
  return `${a.kind}:${a.id}`;
}

function apiSoftMax(req) {
  const a = resolveAuth(req);
  if (a.kind === 'user') return 4800;
  if (a.kind === 'token') return 2400;
  return 900;
}

function apiExtremeMax(req) {
  const a = resolveAuth(req);
  if (a.kind === 'user') return 24000;
  if (a.kind === 'token') return 12000;
  return 4500;
}

const softBuckets = new Map();
let softSweepAt = 0;

function softEntry(key, now) {
  let e = softBuckets.get(key);
  if (!e || now >= e.reset) {
    e = { n: 0, reset: now + 60000, captchaAt: 0 };
    softBuckets.set(key, e);
  }
  return e;
}

function sweepSoft(now) {
  if (now - softSweepAt < 120000) return;
  softSweepAt = now;
  for (const [k, e] of softBuckets) {
    if (now >= e.reset) softBuckets.delete(k);
  }
}

export function createApiLimiter(shield) {
  return (req, res, next) => {
    const now = Date.now();
    sweepSoft(now);
    const key = apiKey(req);
    const e = softEntry(key, now);
    e.n += 1;

    if (e.n > apiExtremeMax(req)) {
      return extremeAbuseResponse(req, res, shield, 'extreme_rate');
    }

    if (e.n > apiSoftMax(req)) {
      if (hasValidGate(req) && e.captchaAt > 0) {
        e.n = Math.floor(apiSoftMax(req) * 0.35);
        e.captchaAt = 0;
        return next();
      }
      e.captchaAt = e.captchaAt || now;
      return softCaptchaResponse(req, res, shield, 'rate_limit');
    }

    return next();
  };
}

export function createAiLimiter(shield) {
  const soft = new Map();
  let sweep = 0;
  return (req, res, next) => {
    const now = Date.now();
    if (now - sweep > 120000) {
      sweep = now;
      for (const [k, e] of soft) if (now >= e.reset) soft.delete(k);
    }
    const key = req.session?.user?.id ? `u:${req.session.user.id}` : toIPv4(null, req);
    let e = soft.get(key);
    if (!e || now >= e.reset) {
      e = { n: 0, reset: now + 60000, captchaAt: 0 };
      soft.set(key, e);
    }
    e.n += 1;
    const softMax = req.session?.user?.id ? 120 : 40;
    const extremeMax = req.session?.user?.id ? 600 : 200;
    if (e.n > extremeMax) return extremeAbuseResponse(req, res, shield, 'ai_extreme');
    if (e.n > softMax) {
      if (hasValidGate(req) && e.captchaAt > 0) {
        e.n = Math.floor(softMax * 0.35);
        e.captchaAt = 0;
        return next();
      }
      e.captchaAt = e.captchaAt || now;
      return softCaptchaResponse(req, res, shield, 'ai_rate_limit');
    }
    return next();
  };
}
