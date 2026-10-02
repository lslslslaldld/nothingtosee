const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = process.env.POLARIS_DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'polaris.json');
const PBKDF2 = promisify(crypto.pbkdf2);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map();
let signupQueue = Promise.resolve();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

fs.mkdirSync(DATA_DIR, { recursive: true });
let data = loadData();
saveData();

function loadData() {
  let loaded;
  try {
    loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    loaded = { users: [], invites: [], domains: {} };
  }
  if (!loaded || typeof loaded !== 'object') loaded = {};
  loaded.users = Array.isArray(loaded.users) ? loaded.users : [];
  loaded.invites = Array.isArray(loaded.invites) ? loaded.invites : [];
  loaded.domains = loaded.domains && typeof loaded.domains === 'object' ? loaded.domains : {};
  loaded.users.forEach((user) => {
    if (!user.username) user.username = String(user.email || '').split('@')[0] || 'member';
    user.username = String(user.username).trim();
    delete user.email;
  });
  loaded.invites.forEach((invite) => {
    if (Array.isArray(invite.uses)) invite.uses.forEach((use) => delete use.email);
  });
  return loaded;
}

function saveData() {
  const tempFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tempFile, DATA_FILE);
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, locked: !!user.locked, createdAt: user.createdAt };
}

function sendJSON(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function cookieValue(req, key) {
  const cookies = (req.headers.cookie || '').split(';');
  const entry = cookies.map((item) => item.trim()).find((item) => item.startsWith(`${key}=`));
  return entry ? decodeURIComponent(entry.slice(key.length + 1)) : '';
}

function authenticatedUser(req) {
  const token = cookieValue(req, 'polaris_session');
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = data.users.find((entry) => entry.id === session.userId);
  return user && !user.locked ? user : null;
}

function clearUserSessions(userId, keepToken = '') {
  for (const [token, session] of sessions) {
    if (session.userId === userId && token !== keepToken) sessions.delete(token);
  }
}

function requireUser(req, res) {
  const user = authenticatedUser(req);
  if (!user) sendJSON(res, 401, { error: 'Sign in to continue.' });
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    sendJSON(res, 403, { error: 'Administrator access is required.' });
    return null;
  }
  return user;
}

function setSession(res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `polaris_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
}

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = await PBKDF2(password, salt, 210000, 32, 'sha256');
  return { salt, passwordHash: hash.toString('hex') };
}

async function seedAdmin() {
  if (data.users.length) return;
  const username = (process.env.POLARIS_ADMIN_USERNAME || 'admin').trim();
  const generatedPassword = crypto.randomBytes(18).toString('base64url');
  const password = process.env.POLARIS_ADMIN_PASSWORD || generatedPassword;
  const credentials = await hashPassword(password);
  data.users.push({
    id: crypto.randomUUID(),
    username,
    ...credentials,
    role: 'admin',
    locked: false,
    createdAt: new Date().toISOString()
  });
  saveData();
  if (!process.env.POLARIS_ADMIN_PASSWORD) {
    console.log(`Initial Polaris admin username: ${username}`);
    console.log(`Initial Polaris password (shown only once): ${generatedPassword}`);
    console.log('Set POLARIS_ADMIN_PASSWORD before first start to choose your own password.');
  }
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 40) {
    return 'Username must be between 2 and 40 characters.';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return 'Password must be between 8 and 200 characters.';
  }
  return '';
}

function inviteIsUsable(invite) {
  const uses = Array.isArray(invite.uses) ? invite.uses : [];
  return !invite.revoked && (!invite.expiresAt || Date.parse(invite.expiresAt) > Date.now()) && uses.length < invite.maxUses;
}

async function handleAPI(req, res, url) {
  const route = url.pathname;

  if (route === '/api/health' && req.method === 'GET') {
    sendJSON(res, 200, { ok: true, service: 'polaris', time: new Date().toISOString() });
    return;
  }

  if (route === '/api/session' && req.method === 'GET') {
    sendJSON(res, 200, { user: authenticatedUser(req) ? publicUser(authenticatedUser(req)) : null });
    return;
  }

  if (route === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const username = String(body.username || '').trim().toLowerCase();
    const user = data.users.find((entry) => entry.username.toLowerCase() === username);
    if (!user || user.locked) {
      sendJSON(res, 401, { error: 'Username or password is incorrect, or this account is locked.' });
      return;
    }
    const candidate = await hashPassword(String(body.password || ''), user.salt);
    const expected = Buffer.from(user.passwordHash, 'hex');
    const actual = Buffer.from(candidate.passwordHash, 'hex');
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      sendJSON(res, 401, { error: 'Username or password is incorrect, or this account is locked.' });
      return;
    }
    setSession(res, user);
    sendJSON(res, 200, { user: publicUser(user) });
    return;
  }

  if (route === '/api/auth/signup' && req.method === 'POST') {
    const body = await readBody(req);
    const operation = signupQueue.then(async () => {
      const username = String(body.username || '').trim();
      const password = body.password;
      const validationError = validateCredentials(username, password);
      if (validationError) return sendJSON(res, 400, { error: validationError });
      if (data.users.some((entry) => entry.username.toLowerCase() === username.toLowerCase())) {
        return sendJSON(res, 409, { error: 'That username is already in use.' });
      }
      const invite = data.invites.find((entry) => entry.code === String(body.inviteCode || '').trim());
      if (!invite || !inviteIsUsable(invite)) {
        return sendJSON(res, 400, { error: 'That invite code is invalid, expired, revoked, or out of uses.' });
      }
      const credentials = await hashPassword(password);
      const user = {
        id: crypto.randomUUID(),
        username,
        ...credentials,
        role: 'member',
        locked: false,
        createdAt: new Date().toISOString()
      };
      invite.uses = Array.isArray(invite.uses) ? invite.uses : [];
      invite.uses.push({ userId: user.id, username, usedAt: new Date().toISOString() });
      data.users.push(user);
      saveData();
      setSession(res, user);
      sendJSON(res, 201, { user: publicUser(user) });
    });
    signupQueue = operation.catch(() => {});
    await operation;
    return;
  }

  if (route === '/api/auth/logout' && req.method === 'POST') {
    sessions.delete(cookieValue(req, 'polaris_session'));
    res.setHeader('Set-Cookie', 'polaris_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (route.startsWith('/api/') && !requireUser(req, res)) return;

  if (route === '/api/accounts' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, { accounts: data.users.map(publicUser) });
    return;
  }

  if (route.startsWith('/api/accounts/') && req.method === 'PATCH') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const id = decodeURIComponent(route.slice('/api/accounts/'.length));
    const account = data.users.find((entry) => entry.id === id);
    if (!account) return sendJSON(res, 404, { error: 'Account not found.' });
    const body = await readBody(req);
    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (username.length < 2 || username.length > 40) return sendJSON(res, 400, { error: 'Username must be between 2 and 40 characters.' });
      if (data.users.some((entry) => entry.id !== id && entry.username.toLowerCase() === username.toLowerCase())) {
        return sendJSON(res, 409, { error: 'That username is already in use.' });
      }
      account.username = username;
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) return sendJSON(res, 400, { error: 'Password must be between 8 and 200 characters.' });
      Object.assign(account, await hashPassword(body.password));
      clearUserSessions(account.id, account.id === admin.id ? cookieValue(req, 'polaris_session') : '');
    }
    if (body.locked !== undefined) {
      if (typeof body.locked !== 'boolean') return sendJSON(res, 400, { error: 'Locked status must be true or false.' });
      if (id === admin.id && body.locked) return sendJSON(res, 400, { error: 'You cannot lock your own account.' });
      account.locked = body.locked;
      if (body.locked) clearUserSessions(account.id);
    }
    saveData();
    sendJSON(res, 200, { account: publicUser(account) });
    return;
  }

  if (route.startsWith('/api/accounts/') && req.method === 'DELETE') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const id = decodeURIComponent(route.slice('/api/accounts/'.length));
    const account = data.users.find((entry) => entry.id === id);
    if (!account) return sendJSON(res, 404, { error: 'Account not found.' });
    if (id === admin.id) return sendJSON(res, 400, { error: 'You cannot delete your own account.' });
    if (account.role === 'admin' && data.users.filter((entry) => entry.role === 'admin' && !entry.locked).length <= 1) {
      return sendJSON(res, 400, { error: 'The last active administrator cannot be deleted.' });
    }
    data.users = data.users.filter((entry) => entry.id !== id);
    clearUserSessions(id);
    saveData();
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (route === '/api/profile' && req.method === 'PATCH') {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (username.length < 2 || username.length > 40) return sendJSON(res, 400, { error: 'Username must be between 2 and 40 characters.' });
      if (data.users.some((entry) => entry.id !== user.id && entry.username.toLowerCase() === username.toLowerCase())) {
        return sendJSON(res, 409, { error: 'That username is already in use.' });
      }
      user.username = username;
    }
    if (body.password !== undefined) {
      if (typeof body.currentPassword !== 'string' || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) {
        return sendJSON(res, 400, { error: 'Enter your current password and a new password of at least 8 characters.' });
      }
      const current = await hashPassword(body.currentPassword, user.salt);
      if (current.passwordHash !== user.passwordHash) return sendJSON(res, 400, { error: 'Current password is incorrect.' });
      Object.assign(user, await hashPassword(body.password));
      clearUserSessions(user.id, cookieValue(req, 'polaris_session'));
    }
    saveData();
    sendJSON(res, 200, { user: publicUser(user) });
    return;
  }

  if (route === '/api/invites' && req.method === 'GET') {
    if (!requireAdmin(req, res)) return;
    sendJSON(res, 200, { invites: data.invites.map((invite) => ({
      id: invite.id,
      code: invite.code,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      uses: invite.uses || [],
      revoked: !!invite.revoked
    })) });
    return;
  }

  if (route === '/api/invites' && req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const maxUses = Number(body.maxUses);
    const expiresInHours = body.expiresInHours === null ? null : Number(body.expiresInHours);
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000) return sendJSON(res, 400, { error: 'Maximum uses must be from 1 to 10,000.' });
    if (expiresInHours !== null && (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 87600)) {
      return sendJSON(res, 400, { error: 'Expiry must be 1 to 87,600 hours, or no expiry.' });
    }
    const invite = {
      id: crypto.randomUUID(),
      code: crypto.randomBytes(9).toString('base64url'),
      createdAt: new Date().toISOString(),
      expiresAt: expiresInHours === null ? null : new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
      maxUses,
      uses: [],
      revoked: false
    };
    data.invites.push(invite);
    saveData();
    sendJSON(res, 201, { invite });
    return;
  }

  if (route.startsWith('/api/invites/') && req.method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const id = decodeURIComponent(route.slice('/api/invites/'.length));
    const invite = data.invites.find((entry) => entry.id === id);
    if (!invite) return sendJSON(res, 404, { error: 'Invite not found.' });
    invite.revoked = true;
    saveData();
    sendJSON(res, 200, { ok: true });
    return;
  }

  if (route === '/api/settings/domains' && req.method === 'GET') {
    sendJSON(res, 200, { domains: data.domains });
    return;
  }

  if (route === '/api/settings/domains' && req.method === 'PUT') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    if (!body.domains || typeof body.domains !== 'object' || Array.isArray(body.domains)) return sendJSON(res, 400, { error: 'Domain settings must be an object.' });
    data.domains = body.domains;
    saveData();
    sendJSON(res, 200, { domains: data.domains });
    return;
  }

  if (route.startsWith('/api/')) sendJSON(res, 404, { error: 'API route not found.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleAPI(req, res, url);
      return;
    }

    let requestPath;
    try {
      requestPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    } catch {
      res.writeHead(400);
      res.end('Invalid URL');
      return;
    }
    const fullPath = path.resolve(ROOT, `.${requestPath}`);
    if (fullPath !== ROOT && !fullPath.startsWith(`${ROOT}${path.sep}`)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const privateSegments = new Set(['data', 'node_modules', '.git', '.vscode']);
    const segments = requestPath.split('/').filter(Boolean);
    const privateFiles = new Set(['server.js', 'package.json', 'package-lock.json', '.env']);
    if (segments.some((segment) => privateSegments.has(segment) || segment.startsWith('.')) || privateFiles.has(segments.at(-1))) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    fs.stat(fullPath, (err, stats) => {
      if (err || !stats.isFile()) {
        fs.readFile(path.join(ROOT, 'index.html'), (readErr, html) => {
          if (readErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Failed to read index.html');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
        });
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
  } catch (error) {
    if (url.pathname.startsWith('/api/')) {
      sendJSON(res, 400, { error: error.message || 'Request failed.' });
    } else {
      res.writeHead(500);
      res.end('Internal server error');
    }
  }
});

seedAdmin().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Polaris running at http://localhost:${PORT}`);
  });
}).catch((error) => {
  console.error('Failed to initialize Polaris:', error);
  process.exitCode = 1;
});
