import { toIPv4, getIPReputationScore, systemState, isSocialPreviewBot, isSearchEngineBot, isTrustedRequest } from './security.js';

const challengeUntil = new Map();
let sweepAt = 0;

function ipToInt(ip) {
  const p = String(ip).split('.');
  if (p.length !== 4) return -1;
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const o = Number(p[i]);
    if (!Number.isInteger(o) || o < 0 || o > 255) return -1;
    n = (n << 8) + o;
  }
  return n >>> 0;
}

function cidrToRange(cidr) {
  const [base, bitsRaw] = String(cidr).split('/');
  const bits = Number(bitsRaw);
  const ip = ipToInt(base);
  if (ip < 0 || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const start = (ip & mask) >>> 0;
  const end = (start | (~mask >>> 0)) >>> 0;
  return [start, end];
}

const DC_CIDRS = [
  '3.0.0.0/8', '13.0.0.0/8', '15.0.0.0/8', '18.0.0.0/8', '34.0.0.0/8', '35.0.0.0/8',
  '44.0.0.0/8', '52.0.0.0/8', '54.0.0.0/8', '99.77.0.0/16', '99.78.0.0/16', '99.79.0.0/16',
  '100.20.0.0/14', '100.24.0.0/13', '108.128.0.0/11', '174.129.0.0/16', '176.32.0.0/16',
  '184.72.0.0/15', '204.246.0.0/16', '205.251.0.0/16', '207.171.0.0/16',
  '8.34.208.0/20', '8.35.192.0/20', '23.236.48.0/20', '23.251.128.0/19', '34.64.0.0/11',
  '34.96.0.0/12', '34.112.0.0/12', '34.128.0.0/12', '35.184.0.0/13', '35.192.0.0/12',
  '35.208.0.0/12', '35.224.0.0/12', '35.240.0.0/13', '104.154.0.0/15', '104.196.0.0/14',
  '107.167.160.0/19', '107.178.192.0/18', '108.59.80.0/20', '108.170.192.0/18',
  '130.211.0.0/16', '142.250.0.0/15', '146.148.0.0/17', '162.216.148.0/22', '162.222.176.0/21',
  '173.194.0.0/16', '209.85.128.0/17', '216.58.192.0/19', '216.239.32.0/19',
  '13.64.0.0/11', '20.0.0.0/8', '40.64.0.0/10', '40.74.0.0/15', '40.76.0.0/14',
  '40.80.0.0/12', '40.96.0.0/12', '40.112.0.0/13', '40.120.0.0/14', '40.124.0.0/16',
  '52.224.0.0/11', '64.4.0.0/18', '65.52.0.0/14', '70.37.0.0/17', '104.40.0.0/13',
  '104.208.0.0/13', '131.253.0.0/16', '134.170.0.0/16', '137.116.0.0/16', '137.135.0.0/16',
  '138.91.0.0/16', '157.54.0.0/15', '157.56.0.0/14', '168.61.0.0/16', '168.62.0.0/15',
  '191.232.0.0/13', '199.30.16.0/20', '207.46.0.0/16', '209.240.192.0/19',
  '45.55.0.0/16', '64.225.0.0/16', '64.227.0.0/16', '67.205.128.0/18', '68.183.0.0/16',
  '104.131.0.0/16', '104.236.0.0/16', '107.170.0.0/16', '138.68.0.0/16', '138.197.0.0/16',
  '139.59.0.0/16', '142.93.0.0/16', '143.110.0.0/16', '143.198.0.0/16', '157.230.0.0/16',
  '159.65.0.0/16', '159.89.0.0/16', '159.203.0.0/16', '161.35.0.0/16', '162.243.0.0/16',
  '163.47.0.0/16', '164.90.0.0/16', '165.22.0.0/16', '165.227.0.0/16', '167.71.0.0/16',
  '167.99.0.0/16', '167.172.0.0/16', '174.138.0.0/16', '178.128.0.0/16', '188.166.0.0/16',
  '192.241.0.0/16', '198.199.0.0/16', '198.211.0.0/16', '204.48.0.0/16', '206.189.0.0/16',
  '207.154.0.0/16', '209.97.0.0/16',
  '45.33.0.0/16', '45.56.0.0/16', '45.79.0.0/16', '50.116.0.0/16', '66.175.208.0/20',
  '66.228.0.0/16', '69.164.192.0/18', '72.14.176.0/20', '74.207.224.0/19', '96.126.96.0/19',
  '97.107.128.0/20', '139.144.0.0/16', '172.104.0.0/15', '172.232.0.0/13', '173.230.128.0/19',
  '173.255.192.0/18', '192.46.208.0/20', '192.81.128.0/19', '192.155.80.0/20', '198.58.96.0/19',
  '45.32.0.0/12', '45.63.0.0/16', '45.76.0.0/15', '45.77.0.0/16', '66.42.0.0/16',
  '108.61.0.0/16', '136.244.0.0/16', '140.82.0.0/16', '144.202.0.0/16', '149.28.0.0/16',
  '155.138.0.0/16', '207.148.0.0/16', '208.167.0.0/16', '216.128.0.0/16', '217.69.0.0/16',
  '129.146.0.0/16', '129.148.0.0/16', '129.159.0.0/16', '130.61.0.0/16', '132.145.0.0/16',
  '132.226.0.0/16', '134.70.0.0/16', '138.1.0.0/16', '140.91.0.0/16', '140.238.0.0/16',
  '143.47.0.0/16', '144.24.0.0/16', '150.136.0.0/16', '152.67.0.0/16', '152.70.0.0/16',
  '155.248.0.0/16', '158.101.0.0/16', '160.1.0.0/16', '168.138.0.0/16', '192.9.0.0/16',
  '192.18.0.0/16', '192.29.0.0/16', '193.122.0.0/15', '193.124.0.0/16',
  '5.9.0.0/16', '5.75.0.0/16', '23.88.0.0/15', '37.27.0.0/16', '49.12.0.0/15',
  '65.108.0.0/15', '78.46.0.0/15', '88.99.0.0/16', '91.107.0.0/16', '94.130.0.0/15',
  '95.216.0.0/15', '116.202.0.0/15', '116.203.0.0/16', '128.140.0.0/16', '135.181.0.0/16',
  '136.243.0.0/16', '138.201.0.0/16', '142.132.0.0/16', '144.76.0.0/16', '148.251.0.0/16',
  '157.90.0.0/16', '159.69.0.0/16', '162.55.0.0/16', '167.233.0.0/16', '167.235.0.0/16',
  '168.119.0.0/16', '176.9.0.0/16', '178.63.0.0/16', '188.34.0.0/15', '188.40.0.0/15',
  '195.201.0.0/16', '213.133.96.0/19', '213.239.192.0/18',
  '5.39.0.0/17', '5.135.0.0/16', '5.196.0.0/16', '37.59.0.0/16', '37.187.0.0/16',
  '46.105.0.0/16', '51.38.0.0/16', '51.68.0.0/16', '51.75.0.0/16', '51.77.0.0/16',
  '51.79.0.0/16', '51.83.0.0/16', '51.89.0.0/16', '51.91.0.0/16', '51.178.0.0/16',
  '51.195.0.0/16', '51.210.0.0/16', '51.254.0.0/15', '54.36.0.0/15', '54.38.0.0/16',
  '91.121.0.0/16', '91.134.0.0/16', '92.222.0.0/16', '94.23.0.0/16', '137.74.0.0/16',
  '139.99.0.0/16', '142.44.0.0/16', '144.217.0.0/16', '145.239.0.0/16', '146.59.0.0/16',
  '147.135.0.0/16', '149.56.0.0/16', '151.80.0.0/16', '158.69.0.0/16', '164.132.0.0/16',
  '167.114.0.0/16', '176.31.0.0/16', '178.32.0.0/15', '188.165.0.0/16', '193.70.0.0/16',
  '198.27.64.0/18', '198.50.128.0/17', '213.32.0.0/16', '213.186.32.0/19', '217.182.0.0/16',
  '47.74.0.0/15', '47.76.0.0/14', '47.80.0.0/13', '47.88.0.0/14', '47.92.0.0/14',
  '47.96.0.0/12', '47.112.0.0/12', '47.240.0.0/13', '47.250.0.0/15', '47.252.0.0/15',
  '106.11.0.0/16', '106.14.0.0/15', '116.62.0.0/15', '118.31.0.0/16', '120.26.0.0/15',
  '120.55.0.0/16', '121.40.0.0/14', '121.196.0.0/14', '139.196.0.0/14', '139.224.0.0/16',
  '182.92.0.0/16',
  '2.56.0.0/14', '5.180.0.0/16', '5.252.0.0/16', '31.220.0.0/16', '45.8.0.0/13',
  '45.67.0.0/16', '45.81.0.0/16', '45.88.0.0/14', '45.94.0.0/16', '45.128.0.0/15',
  '45.132.0.0/14', '45.137.0.0/16', '45.142.0.0/15', '45.153.0.0/16', '62.72.0.0/16',
  '77.237.0.0/16', '80.85.0.0/16', '91.92.0.0/16', '91.201.0.0/16', '94.156.0.0/16',
  '141.11.0.0/16', '141.98.0.0/16', '166.0.0.0/16', '185.104.0.0/16', '185.158.0.0/16',
  '185.172.0.0/16', '185.213.0.0/16', '185.216.0.0/16', '185.224.0.0/16', '185.229.0.0/16',
  '193.29.0.0/16', '193.37.0.0/16', '194.55.0.0/16', '194.113.0.0/16', '195.133.0.0/16',
];

const DC_RANGES = (() => {
  const raw = DC_CIDRS.map(cidrToRange).filter(Boolean).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [start, end] of raw) {
    const last = merged[merged.length - 1];
    if (!last || start > last[1] + 1) merged.push([start, end]);
    else if (end > last[1]) last[1] = end;
  }
  return merged;
})();

function inDcRanges(ipInt) {
  let lo = 0;
  let hi = DC_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end] = DC_RANGES[mid];
    if (ipInt < start) hi = mid - 1;
    else if (ipInt > end) lo = mid + 1;
    else return true;
  }
  return false;
}

export function isDatacenterIp(ip) {
  const n = ipToInt(ip);
  if (n < 0) return false;
  if (n === 0x7f000001) return false;
  return inDcRanges(n);
}

const AUTOMATION_UA =
  /headless|phantomjs|selenium|webdriver|puppeteer|playwright|scrapy|httpclient|python-requests|go-http-client|java\/|libwww|wget\/|curl\/|axios\/|node-fetch|okhttp|postman|insomnia|httpie|aiohttp|mechanize|python-urllib|libcurl|curl-adapter|restsharp|http.rb|faraday|dispatch\/|undici|got\b|superagent|needle\/|request\/|python-httpx|aiohttp|cloudscraper|scrapy|crawl|spider|bot\b|slurp|fetcher|monitor|scan/i;

function isWebsocketAuthPath(req) {
  const p = String(req.path || req.url || '').split('?')[0];
  return (
    p === '/api/websocket/normal' ||
    p === '/api/websocket/normal/' ||
    p === '/api/websocket/tor' ||
    p === '/api/websocket/tor/' ||
    p === '/websocket/normal' ||
    p === '/websocket/normal/' ||
    p === '/websocket/tor' ||
    p === '/websocket/tor/'
  );
}

export function isUnusualBrowser(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || ua.length < 12 || ua.length > 512) return true;
  if (isSocialPreviewBot(ua) || isSearchEngineBot(ua)) return false;
  if (AUTOMATION_UA.test(ua)) return true;
  if (/^[A-Z][a-z]+\/[\d.]+$/i.test(ua) && !/Mozilla|Chrome|Safari|Firefox|Edg|OPR|CriOS|FxiOS/i.test(ua)) return true;
  if (String(req.headers.upgrade || '').toLowerCase() === 'websocket') return false;
  if (req.headers['sec-websocket-key']) return false;
  if (req.headers['x-original-uri']) return false;
  if (isWebsocketAuthPath(req)) return false;
  const al = req.headers['accept-language'];
  if (!al || (typeof al === 'string' && al.trim().length < 2)) return true;
  const accept = String(req.headers.accept || '');
  if (!accept) return true;
  return false;
}

function sweep(now) {
  if (now - sweepAt < 60000) return;
  sweepAt = now;
  for (const [ip, until] of challengeUntil) {
    if (now >= until) challengeUntil.delete(ip);
  }
}

export function markChallengeRequired(ip, ms = 30 * 60000) {
  if (!ip) return;
  const now = Date.now();
  sweep(now);
  const prev = challengeUntil.get(ip) || 0;
  challengeUntil.set(ip, Math.max(prev, now + ms));
}

export function clearChallengeRequired(ip) {
  if (!ip) return;
  challengeUntil.delete(ip);
}

export function isChallengeMarked(ip) {
  const now = Date.now();
  sweep(now);
  const until = challengeUntil.get(ip);
  if (!until) return false;
  if (now >= until) {
    challengeUntil.delete(ip);
    return false;
  }
  return true;
}

export function needsCaptchaChallenge(req) {
  const ip = toIPv4(null, req);
  if (isChallengeMarked(ip)) return true;
  if (getIPReputationScore(ip) <= -12) return true;
  if (isDatacenterIp(ip)) return true;
  if (isUnusualBrowser(req)) return true;
  if ((systemState.state === 'ATTACK' || systemState.cpuHigh) && !isTrustedRequest(req)) return true;
  return false;
}
