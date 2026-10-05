import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { toIPv4, extractToken, verifyToken, updateIPReputation } from '../middleware/security.js';
import { extremeAbuseResponse } from '../middleware/soft-captcha.js';
import { toMochiBackendPath } from '../mochi-path.js';

const router = Router();

const softBuckets = new Map();
let softSweepAt = 0;

function mochiKey(req) {
  if (req.session?.user?.id) return `user:${req.session.user.id}`;
  const token = extractToken(req);
  if (verifyToken(token, req)) return `token:${token.slice(0, 16)}`;
  return toIPv4(null, req);
}

function mochiSoftMax(req) {
  if (req.session?.user?.id) return 18000;
  const token = extractToken(req);
  if (verifyToken(token, req)) return 12000;
  return 2800;
}

function mochiExtremeMax(req) {
  if (req.session?.user?.id) return 90000;
  const token = extractToken(req);
  if (verifyToken(token, req)) return 60000;
  return 14000;
}

function mochiGuard(req, res, next) {
  const ref = req.headers['referer'] || '';
  if (
    ref.includes('/f/g/') ||
    ref.includes('/n/m/') ||
    ref.includes('/!!/') ||
    ref.includes('/!cover!/') ||
    ref.includes('/f/c/')
  ) {
    return next();
  }
  const now = Date.now();
  if (now - softSweepAt > 120000) {
    softSweepAt = now;
    for (const [k, e] of softBuckets) if (now >= e.reset) softBuckets.delete(k);
  }
  const key = mochiKey(req);
  let e = softBuckets.get(key);
  if (!e || now >= e.reset) {
    e = { n: 0, reset: now + 60000 };
    softBuckets.set(key, e);
  }
  e.n += 1;
  if (e.n > mochiExtremeMax(req)) {
    return extremeAbuseResponse(req, res, null, 'mochi_extreme');
  }
  if (e.n > mochiSoftMax(req)) {
    updateIPReputation(toIPv4(null, req), -1);
    return res.status(429).json({ error: 'Too many proxy requests' });
  }
  return next();
}

const mochiProxy = createProxyMiddleware({
  target: 'http://127.0.0.1:3005',
  changeOrigin: false,
  ws: false,
  pathRewrite: (path) => toMochiBackendPath(path),
  on: {
    error: (err, req, res) => {
      if (res && 'status' in res) {
        res.status(502).send('Proxy unavailable');
      }
    },
  },
});

router.use('/f/c/', mochiGuard, mochiProxy);
router.use('/!cover!/', mochiGuard, mochiProxy);
router.use('/f/g/', mochiGuard, mochiProxy);
router.use('/n/m/', mochiGuard, mochiProxy);
router.use('/!!/', mochiGuard, mochiProxy);

export default router;
export { mochiProxy };
