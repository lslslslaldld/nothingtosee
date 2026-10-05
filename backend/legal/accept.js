import { hasValidGate } from '../cap/store.js';
import { hasValidLegal, setLegalCookie } from './cookie.js';
import { LEGAL_VERSION } from './version.js';
import { needsCaptchaChallenge } from '../middleware/challenge-risk.js';

export function legalStatusHandler(req, res) {
  const needsCaptcha = needsCaptchaChallenge(req) && !hasValidGate(req);
  res.json({
    version: LEGAL_VERSION,
    gate: hasValidGate(req),
    accepted: hasValidLegal(req),
    needsCaptcha,
    needsReagree: !hasValidLegal(req),
  });
}

export function legalAcceptHandler(req, res) {
  const accepted = req.body?.accepted === true || req.body?.accepted === 'true' || req.body?.accepted === 1;
  if (!accepted) {
    return res.status(400).json({ error: 'You must accept the Terms, Privacy Policy, and DMCA Policy to continue.' });
  }

  const version = typeof req.body?.version === 'string' ? req.body.version.trim() : '';
  if (version && version !== LEGAL_VERSION) {
    return res.status(400).json({ error: 'Legal documents were updated. Refresh the page and accept the latest version.' });
  }

  const legal = setLegalCookie(res, req);
  return res.json({ ok: true, version: LEGAL_VERSION, legal });
}
