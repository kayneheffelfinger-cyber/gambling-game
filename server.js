const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.PORT) || 8080;
const rootDirectory = __dirname;
const chatFile = path.join(rootDirectory, 'chat-messages.json');
const accountsFile = path.join(rootDirectory, 'accounts.json');
const sessionLifetimeMs = 24 * 60 * 60 * 1000;
const chatRetentionMs = 12 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const resetTokens = new Map();
const sensitiveFiles = new Set(['/accounts.json', '/chat-messages.json']);
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

function send(response, statusCode, body = '', contentType = 'text/plain; charset=utf-8', headers = {}) {
    response.writeHead(statusCode, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        ...headers
    });
    response.end(body);
}

function sendJson(response, statusCode, value, headers) {
    send(response, statusCode, JSON.stringify(value), 'application/json; charset=utf-8', headers);
}

function readJson(request, maxLength = 10000) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', chunk => {
            body += chunk;
            if (body.length > maxLength) {
                reject(new Error('Request too large'));
                request.destroy();
            }
        });
        request.on('end', () => {
            try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); }
        });
        request.on('error', reject);
    });
}

function readMessages() {
    try {
        const messages = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
        if (!Array.isArray(messages)) return [];
        const cutoff = Date.now() - chatRetentionMs;
        return messages.map((message, index) => {
            if (message && typeof message.id === 'string' && message.id) return message;
            const signature = `${message?.timestamp || ''}-${message?.author || ''}-${message?.body || ''}-${index}`;
            return { ...message, id: `legacy-${Buffer.from(signature).toString('hex').slice(0, 32)}` };
        }).filter(message => {
            const timestamp = Date.parse(message.timestamp);
            return !Number.isFinite(timestamp) || timestamp >= cutoff;
        });
    } catch {
        return [];
    }
}

function writeMessages(messages) {
    fs.writeFileSync(chatFile, JSON.stringify(messages, null, 2), { mode: 0o600 });
}

function purgeExpiredMessages() {
    try {
        const messages = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
        if (!Array.isArray(messages)) return;
        const cutoff = Date.now() - chatRetentionMs;
        const remaining = messages.filter(message => {
            const timestamp = Date.parse(message?.timestamp);
            return !Number.isFinite(timestamp) || timestamp >= cutoff;
        });
        if (remaining.length !== messages.length) writeMessages(remaining);
    } catch {}
}

function readAccounts() {
    try {
        const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
        return Array.isArray(accounts) ? accounts : [];
    } catch {
        return [];
    }
}

function writeAccounts(accounts) {
    fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2), { mode: 0o600 });
}

function publicAccount(account) {
    return {
        name: account.name,
        email: account.email,
        tokens: Number.isFinite(Number(account.tokens)) ? Number(account.tokens) : 1000,
        createdAt: account.createdAt,
        termsAcceptedAt: account.termsAcceptedAt || null,
        isAdmin: account.role === 'owner' || account.role === 'moderator',
        role: account.role || (account.isAdmin ? 'moderator' : 'player'),
        mutedUntil: account.mutedUntil || null,
        lastSeenAt: account.lastSeenAt || null
    };
}

function parseCookies(request) {
    return Object.fromEntries((request.headers.cookie || '').split(';').map(part => {
        const index = part.indexOf('=');
        return index < 0 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
    }).filter(pair => pair.length));
}

function secureCookie(token, maxAge = sessionLifetimeMs) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `lj_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(maxAge / 1000)}${secure}`;
}

function getSessionAccount(request) {
    const token = parseCookies(request).lj_session;
    const session = token && sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
        if (token) sessions.delete(token);
        return null;
    }
    const account = readAccounts().find(saved => saved.email === session.email);
    return account || null;
}

function createSession(account) {
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { email: account.email, expiresAt: Date.now() + sessionLifetimeMs });
    return token;
}

function requireRole(request, response, allowedRoles) {
    const account = getSessionAccount(request);
    if (!account) {
        sendJson(response, 401, { error: 'Sign in required' });
        return null;
    }
    const role = account.role || (account.isAdmin ? 'moderator' : 'player');
    if (!allowedRoles.includes(role)) {
        sendJson(response, 403, { error: 'Insufficient permissions' });
        return null;
    }
    return account;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) reject(error);
            else resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
        });
    });
}

async function passwordsMatch(password, account) {
    if (typeof account.passwordHash === 'string') {
        const [algorithm, salt, expected] = account.passwordHash.split('$');
        if (algorithm !== 'scrypt' || !salt || !expected) return false;
        const actual = await hashPassword(password, salt);
        return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(account.passwordHash));
    }
    // Legacy plaintext records are accepted once, then upgraded on successful login.
    return typeof account.password === 'string' &&
        password.length === account.password.length &&
        crypto.timingSafeEqual(Buffer.from(password), Buffer.from(account.password));
}

function requestAddress(request) {
    return request.socket.remoteAddress || 'unknown';
}

function isRateLimited(request) {
    const key = requestAddress(request);
    const now = Date.now();
    const attempts = (loginAttempts.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
    loginAttempts.set(key, attempts);
    return attempts.length >= 8;
}

function recordFailedLogin(request) {
    const key = requestAddress(request);
    const attempts = (loginAttempts.get(key) || []).filter(time => Date.now() - time < 15 * 60 * 1000);
    attempts.push(Date.now());
    loginAttempts.set(key, attempts);
}

function clearFailedLogins(request) {
    loginAttempts.delete(requestAddress(request));
}

async function handleAuthRequest(request, response, pathname) {
    if (pathname === '/api/auth/me') {
        if (request.method !== 'GET') return send(response, 405, 'Method Not Allowed');
        const account = getSessionAccount(request);
        if (!account) return sendJson(response, 401, { error: 'Not signed in' });
        return sendJson(response, 200, publicAccount(account));
    }
    if (pathname === '/api/auth/logout') {
        if (request.method !== 'POST') return send(response, 405, 'Method Not Allowed');
        const token = parseCookies(request).lj_session;
        if (token) sessions.delete(token);
        return send(response, 204, '', 'text/plain; charset=utf-8', { 'Set-Cookie': secureCookie('', 0) });
    }
    if (pathname === '/api/auth/reset-request') {
        if (request.method !== 'POST') return send(response, 405, 'Method Not Allowed');
        try {
            const { email } = await readJson(request, 2000);
            const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
            const account = readAccounts().find(saved => saved.email === normalizedEmail);
            const responseBody = { message: 'If that account exists, a reset code has been generated.' };
            if (account) {
                const token = crypto.randomBytes(24).toString('hex');
                resetTokens.set(token, { email: normalizedEmail, expiresAt: Date.now() + 15 * 60 * 1000 });
                if (process.env.NODE_ENV !== 'production') responseBody.demoResetToken = token;
            }
            return sendJson(response, 200, responseBody);
        } catch {
            return sendJson(response, 400, { error: 'Invalid reset request' });
        }
    }
    if (pathname === '/api/auth/reset') {
        if (request.method !== 'POST') return send(response, 405, 'Method Not Allowed');
        try {
            const { email, token, password } = await readJson(request, 3000);
            const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
            if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 10) {
                return sendJson(response, 400, { error: 'Provide a reset code and a password of at least 10 characters.' });
            }
            const reset = resetTokens.get(token);
            if (!reset || reset.expiresAt < Date.now() || reset.email !== normalizedEmail) {
                if (reset?.expiresAt < Date.now()) resetTokens.delete(token);
                return sendJson(response, 400, { error: 'Invalid or expired reset code.' });
            }
            const accounts = readAccounts();
            const account = accounts.find(saved => saved.email === normalizedEmail);
            if (!account) return sendJson(response, 400, { error: 'Invalid or expired reset code.' });
            account.passwordHash = await hashPassword(password);
            delete account.password;
            writeAccounts(accounts);
            resetTokens.delete(token);
            for (const [sessionToken, session] of sessions) {
                if (session.email === normalizedEmail) sessions.delete(sessionToken);
            }
            return sendJson(response, 200, { message: 'Password reset. You can now sign in.' });
        } catch {
            return sendJson(response, 400, { error: 'Invalid password reset request' });
        }
    }
    if (pathname !== '/api/auth/login' || request.method !== 'POST') return send(response, 405, 'Method Not Allowed');
    if (isRateLimited(request)) return sendJson(response, 429, { error: 'Too many attempts. Try again later.' });
    try {
        const { email, password } = await readJson(request, 2000);
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (!normalizedEmail || typeof password !== 'string') return sendJson(response, 400, { error: 'Invalid credentials' });
        const accounts = readAccounts();
        const account = accounts.find(saved => saved.email === normalizedEmail);
        if (!account || !(await passwordsMatch(password, account))) {
            recordFailedLogin(request);
            return sendJson(response, 401, { error: 'Invalid email or password' });
        }
        if (!account.passwordHash) {
            account.passwordHash = await hashPassword(password);
            delete account.password;
            writeAccounts(accounts);
        }
        clearFailedLogins(request);
        const token = createSession(account);
        return sendJson(response, 200, publicAccount(account), { 'Set-Cookie': secureCookie(token) });
    } catch {
        return sendJson(response, 400, { error: 'Invalid request' });
    }
}

async function handleAccountRequest(request, response) {
    if (request.method === 'GET') {
        const requester = requireRole(request, response, ['owner', 'moderator']);
        if (!requester) return;
        return sendJson(response, 200, readAccounts().map(publicAccount));
    }
    if (request.method === 'POST') {
        try {
            const account = await readJson(request, 3000);
            const name = typeof account.name === 'string' ? account.name.trim().slice(0, 60) : '';
            const email = typeof account.email === 'string' ? account.email.trim().toLowerCase().slice(0, 160) : '';
            const password = typeof account.password === 'string' ? account.password : '';
            if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
                return sendJson(response, 400, { error: 'Use a display name, valid email, and password of at least 10 characters.' });
            }
            const accounts = readAccounts();
            if (accounts.some(saved => saved.email === email)) return sendJson(response, 409, { error: 'Account already exists' });
            const savedAccount = {
                name, email, passwordHash: await hashPassword(password), tokens: 1000,
                createdAt: new Date().toISOString(), termsAcceptedAt: account.termsAcceptedAt || null,
                isAdmin: accounts.length === 0, role: accounts.length === 0 ? 'owner' : 'player', mutedUntil: null
            };
            accounts.push(savedAccount);
            writeAccounts(accounts);
            const token = createSession(savedAccount);
            return sendJson(response, 201, publicAccount(savedAccount), { 'Set-Cookie': secureCookie(token) });
        } catch {
            return sendJson(response, 400, { error: 'Invalid account details' });
        }
    }
    if (request.method !== 'PATCH') return send(response, 405, 'Method Not Allowed');
    const requester = requireRole(request, response, ['owner', 'moderator']);
    if (!requester) return;
    try {
        const changes = await readJson(request, 2000);
        const email = typeof changes.email === 'string' ? changes.email.trim().toLowerCase() : '';
        const accounts = readAccounts();
        const account = accounts.find(saved => saved.email === email);
        if (!account) return sendJson(response, 404, { error: 'Account not found' });
        const requesterRole = requester.role || (requester.isAdmin ? 'moderator' : 'player');
        if (changes.role !== undefined) {
            if (requesterRole !== 'owner' || !['owner', 'moderator', 'player'].includes(changes.role)) {
                return sendJson(response, 403, { error: 'Only an owner can change roles' });
            }
            account.role = changes.role;
            account.isAdmin = changes.role !== 'player';
        }
        if (changes.mutedUntil !== undefined) {
            if (changes.mutedUntil !== null && typeof changes.mutedUntil !== 'string') return sendJson(response, 400, { error: 'Invalid mute time' });
            account.mutedUntil = changes.mutedUntil;
        }
        if (changes.tokens !== undefined) {
            const tokens = Number(changes.tokens);
            if (!Number.isFinite(tokens)) return sendJson(response, 400, { error: 'Invalid token amount' });
            account.tokens = Math.max(0, Math.round(tokens));
        }
        if (changes.role === undefined && changes.mutedUntil === undefined && changes.tokens === undefined) return sendJson(response, 400, { error: 'No valid changes supplied' });
        writeAccounts(accounts);
        return sendJson(response, 200, publicAccount(account));
    } catch {
        return sendJson(response, 400, { error: 'Invalid account update' });
    }
}

async function handlePresenceRequest(request, response) {
    if (request.method !== 'POST') return send(response, 405, 'Method Not Allowed');
    const account = getSessionAccount(request);
    if (!account) return sendJson(response, 401, { error: 'Sign in required' });
    const accounts = readAccounts();
    const savedAccount = accounts.find(saved => saved.email === account.email);
    savedAccount.lastSeenAt = new Date().toISOString();
    writeAccounts(accounts);
    send(response, 204);
}

async function handleChatRequest(request, response) {
    if (request.method === 'GET') return sendJson(response, 200, readMessages());
    const account = getSessionAccount(request);
    if (request.method === 'DELETE') {
        if (!account) return sendJson(response, 401, { error: 'Sign in required' });
        try {
            const { id } = await readJson(request, 2000);
            if (typeof id !== 'string' || !id) return sendJson(response, 400, { error: 'Invalid message id' });
            const messages = readMessages();
            const target = messages.find(message => message.id === id);
            const role = account.role || (account.isAdmin ? 'moderator' : 'player');
            if (!target) return send(response, 404, 'Not Found');
            if (target.authorEmail !== account.email && !['owner', 'moderator'].includes(role)) return sendJson(response, 403, { error: 'Not allowed' });
            writeMessages(messages.filter(message => message.id !== id));
            return send(response, 204);
        } catch {
            return sendJson(response, 400, { error: 'Invalid request' });
        }
    }
    if (request.method !== 'POST') return send(response, 405, 'Method Not Allowed');
    try {
        const message = await readJson(request, 10000);
        if (typeof message.body !== 'string' || typeof message.type !== 'string') return sendJson(response, 400, { error: 'Invalid message' });
        if (account?.mutedUntil && new Date(account.mutedUntil).getTime() > Date.now()) return sendJson(response, 403, { error: 'This account is muted' });
        const savedMessage = {
            id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            author: account?.name || 'Guest',
            authorEmail: account?.email || '',
            body: message.body.trim().slice(0, 240),
            type: message.type.trim().slice(0, 20),
            timestamp: new Date().toISOString()
        };
        if (!savedMessage.body) return sendJson(response, 400, { error: 'Message cannot be empty' });
        writeMessages([...readMessages(), savedMessage].slice(-100));
        return sendJson(response, 201, savedMessage);
    } catch {
        return sendJson(response, 400, { error: 'Invalid request' });
    }
}

function serveStatic(request, response, pathname) {
    if (!['GET', 'HEAD'].includes(request.method)) return send(response, 405, 'Method Not Allowed');
    if (sensitiveFiles.has(pathname)) return send(response, 404, 'Not Found');
    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(rootDirectory, `.${requestedPath}`);
    if (!filePath.startsWith(rootDirectory + path.sep) && filePath !== rootDirectory) return send(response, 403, 'Forbidden');
    fs.readFile(filePath, (error, file) => {
        if (error) return send(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not Found' : 'Server Error');
        send(response, 200, request.method === 'HEAD' ? '' : file, contentTypes[path.extname(filePath)] || 'application/octet-stream');
    });
}

purgeExpiredMessages();
setInterval(purgeExpiredMessages, 60 * 1000).unref();

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (requestUrl.pathname === '/api/chat') return handleChatRequest(request, response);
    if (requestUrl.pathname === '/api/accounts') return handleAccountRequest(request, response);
    if (requestUrl.pathname === '/api/presence') return handlePresenceRequest(request, response);
    if (requestUrl.pathname.startsWith('/api/auth/')) return handleAuthRequest(request, response, requestUrl.pathname);
    return serveStatic(request, response, requestUrl.pathname);
});

setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) if (session.expiresAt < now) sessions.delete(token);
}, 60 * 60 * 1000).unref();

server.on('error', error => {
    if (error.code === 'EADDRINUSE') return console.error(`Port ${port} is already in use.`);
    throw error;
});

server.listen(port, '0.0.0.0', () => console.log(`Lucky Jackpot running at http://localhost:${port}`));
