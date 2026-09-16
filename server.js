const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 8080;
const rootDirectory = __dirname;
const chatFile = path.join(rootDirectory, 'chat-messages.json');
const accountsFile = path.join(rootDirectory, 'accounts.json');
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
};

function send(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
    response.writeHead(statusCode, { 'Content-Type': contentType });
    response.end(body);
}

function readMessages() {
    try {
        const messages = JSON.parse(fs.readFileSync(chatFile, 'utf8'));
        return Array.isArray(messages) ? messages.map((message, index) => {
            if (message && typeof message.id === 'string' && message.id) return message;
            const signature = `${message?.timestamp || ''}-${message?.author || ''}-${message?.body || ''}-${index}`;
            const legacyId = `legacy-${Buffer.from(signature).toString('hex').slice(0, 32)}`;
            return { ...message, id: legacyId };
        }) : [];
    } catch (error) {
        return [];
    }
}

function readAccounts() {
    try {
        const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
        return Array.isArray(accounts) ? accounts : [];
    } catch (error) {
        return [];
    }
}

function handlePresenceRequest(request, response) {
    if (request.method !== 'POST') {
        send(response, 405, 'Method Not Allowed');
        return;
    }
    let requestBody = '';
    request.on('data', chunk => {
        requestBody += chunk;
        if (requestBody.length > 2000) request.destroy();
    });
    request.on('end', () => {
        try {
            const { email } = JSON.parse(requestBody);
            const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
            if (!normalizedEmail) {
                send(response, 400, 'Invalid account email');
                return;
            }
            const accounts = readAccounts();
            const account = accounts.find(savedAccount => savedAccount.email === normalizedEmail);
            if (!account) {
                send(response, 404, 'Account not found');
                return;
            }
            account.lastSeenAt = new Date().toISOString();
            fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
            send(response, 204, '');
        } catch (error) {
            send(response, 400, 'Invalid JSON');
        }
    });
}

function handleAccountRequest(request, response) {
    if (request.method === 'GET') {
        send(response, 200, JSON.stringify(readAccounts()), 'application/json; charset=utf-8');
        return;
    }
    if (request.method === 'PATCH') {
        let requestBody = '';
        request.on('data', chunk => { requestBody += chunk; });
        request.on('end', () => {
            try {
                const changes = JSON.parse(requestBody);
                const email = typeof changes.email === 'string' ? changes.email.trim().toLowerCase() : '';
                const hasTokenUpdate = changes.tokens !== undefined;
                if (!email || (!['owner', 'moderator', 'player'].includes(changes.role) && typeof changes.isAdmin !== 'boolean' && changes.mutedUntil === undefined && !hasTokenUpdate)) {
                    send(response, 400, 'Invalid account update');
                    return;
                }
                const accounts = readAccounts();
                const account = accounts.find(savedAccount => savedAccount.email === email);
                if (!account) {
                    send(response, 404, 'Account not found');
                    return;
                }
                if (['owner', 'moderator', 'player'].includes(changes.role)) {
                    account.role = changes.role;
                    account.isAdmin = changes.role !== 'player';
                } else if (typeof changes.isAdmin === 'boolean') {
                    account.isAdmin = changes.isAdmin;
                    account.role = changes.isAdmin ? 'moderator' : 'player';
                }
                if (changes.mutedUntil === null || typeof changes.mutedUntil === 'string') account.mutedUntil = changes.mutedUntil;
                if (hasTokenUpdate) {
                    const nextTokenBalance = Number(changes.tokens);
                    if (!Number.isFinite(nextTokenBalance)) {
                        send(response, 400, 'Invalid token amount');
                        return;
                    }
                    account.tokens = Math.max(0, Math.round(nextTokenBalance));
                }
                fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
                send(response, 200, JSON.stringify(account), 'application/json; charset=utf-8');
            } catch (error) {
                send(response, 400, 'Invalid JSON');
            }
        });
        return;
    }
    if (request.method !== 'POST') {
        send(response, 405, 'Method Not Allowed');
        return;
    }
    let requestBody = '';
    request.on('data', chunk => { requestBody += chunk; });
    request.on('end', () => {
        try {
            const account = JSON.parse(requestBody);
            if (typeof account.name !== 'string' || typeof account.email !== 'string' || typeof account.password !== 'string') {
                send(response, 400, 'Invalid account');
                return;
            }
            const accounts = readAccounts();
            if (accounts.some(savedAccount => savedAccount.email === account.email.trim().toLowerCase())) {
                send(response, 409, 'Account already exists');
                return;
            }
            const savedAccount = {
                name: account.name.trim().slice(0, 60),
                email: account.email.trim().toLowerCase().slice(0, 160),
                password: account.password,
                tokens: 1000,
                createdAt: account.createdAt || new Date().toISOString(),
                termsAcceptedAt: account.termsAcceptedAt || null,
                isAdmin: accounts.length === 0,
                role: accounts.length === 0 ? 'owner' : 'player',
                mutedUntil: null
            };
            accounts.push(savedAccount);
            fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
            send(response, 201, JSON.stringify(savedAccount), 'application/json; charset=utf-8');
        } catch (error) {
            send(response, 400, 'Invalid JSON');
        }
    });
}

function handleChatRequest(request, response) {
    if (request.method === 'GET') {
        send(response, 200, JSON.stringify(readMessages()), 'application/json; charset=utf-8');
        return;
    }

    if (request.method !== 'POST') {
        if (request.method === 'DELETE') {
            let requestBody = '';
            request.on('data', chunk => { requestBody += chunk; });
            request.on('end', () => {
                try {
                    const { id } = JSON.parse(requestBody);
                    if (typeof id !== 'string' || !id) {
                        send(response, 400, 'Invalid message id');
                        return;
                    }
                    const messages = readMessages();
                    const remainingMessages = messages.filter(message => message.id !== id);
                    fs.writeFileSync(chatFile, JSON.stringify(remainingMessages, null, 2));
                    send(response, remainingMessages.length === messages.length ? 404 : 204, '');
                } catch (error) {
                    send(response, 400, 'Invalid JSON');
                }
            });
            return;
        }
        send(response, 405, 'Method Not Allowed');
        return;
    }

    let requestBody = '';
    request.on('data', chunk => {
        requestBody += chunk;
        if (requestBody.length > 10000) request.destroy();
    });
    request.on('end', () => {
        try {
            const message = JSON.parse(requestBody);
            if (typeof message.author !== 'string' || typeof message.body !== 'string' || typeof message.type !== 'string') {
                send(response, 400, 'Invalid message');
                return;
            }
            const authorEmail = typeof message.authorEmail === 'string' ? message.authorEmail.trim().toLowerCase() : '';
            const authorAccount = readAccounts().find(account => account.email === authorEmail);
            if (authorAccount?.mutedUntil && new Date(authorAccount.mutedUntil).getTime() > Date.now()) {
                send(response, 403, 'This account is muted');
                return;
            }
            const savedMessage = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                author: message.author.trim().slice(0, 60) || 'Guest',
                authorEmail,
                body: message.body.trim().slice(0, 240),
                type: message.type.trim().slice(0, 20),
                timestamp: new Date().toISOString()
            };
            if (!savedMessage.body) {
                send(response, 400, 'Message cannot be empty');
                return;
            }
            const messages = [...readMessages(), savedMessage].slice(-100);
            fs.writeFileSync(chatFile, JSON.stringify(messages, null, 2));
            send(response, 201, JSON.stringify(savedMessage), 'application/json; charset=utf-8');
        } catch (error) {
            send(response, 400, 'Invalid JSON');
        }
    });
    return;
}

function serveStatic(request, response, pathname) {
    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(rootDirectory, `.${requestedPath}`);
    if (!filePath.startsWith(rootDirectory)) {
        send(response, 403, 'Forbidden');
        return;
    }
    fs.readFile(filePath, (error, file) => {
        if (error) {
            send(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not Found' : 'Server Error');
            return;
        }
        send(response, 200, file, contentTypes[path.extname(filePath)] || 'application/octet-stream');
    });
}

const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (requestUrl.pathname === '/api/chat') {
        handleChatRequest(request, response);
        return;
    }
    if (requestUrl.pathname === '/api/accounts') {
        handleAccountRequest(request, response);
        return;
    }
    if (requestUrl.pathname === '/api/presence') {
        handlePresenceRequest(request, response);
        return;
    }
    serveStatic(request, response, requestUrl.pathname);
});

server.on('error', error => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. If Lucky Jackpot is already running, open the existing server instead.`);
        return;
    }
    throw error;
});

server.listen(port, '0.0.0.0', () => {
    console.log(`Lucky Jackpot running at http://localhost:${port}`);
});
