const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const root = __dirname;
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png'
};

function loadEnv() {
    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath)) return;

    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^([A-Z_]+)=(.*)$/);
        if (match && process.env[match[1]] === undefined) {
            process.env[match[1]] = match[2];
        }
    }
}

function parsePasswordHash(value) {
    const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(value || '');
    if (!match) {
        throw new Error('ADMIN_PASSWORD_HASH ausente ou inválido. Execute npm run setup:admin.');
    }
    return { salt: Buffer.from(match[1], 'hex'), hash: Buffer.from(match[2], 'hex') };
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length &&
        crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getSession(request) {
    const cookie = request.headers.cookie || '';
    const match = cookie.match(/(?:^|;\s*)techagenda_admin=([a-f0-9]{64})/);
    if (!match) return null;

    const session = sessions.get(match[1]);
    if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(match[1]);
        return null;
    }
    return { id: match[1], session };
}

function sendHtml(response, statusCode, html, headers = {}) {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'same-origin',
        ...headers
    });
    response.end(html);
}

function loginPage(errorMessage = '') {
    const error = errorMessage
        ? `<p class="error" role="alert">${errorMessage}</p>`
        : '';
    return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="same-origin">
  <title>Login administrativo | TechAgenda</title>
  <link rel="stylesheet" href="/admin.css">
</head>
<body>
  <main class="admin-card">
    <div class="brand"><img src="/imagens/logo.png" alt="TechAgenda"></div>
    <h1>Acesso administrativo</h1>
    <p class="subtitle">Entre com suas credenciais para acessar o painel.</p>
    <form method="post" action="/admin">
      <div class="field">
        <label for="username">Usuário</label>
        <input id="username" name="username" type="text" autocomplete="username" required autofocus>
      </div>
      <div class="field">
        <label for="password">Senha</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
      </div>
      ${error}
      <button class="submit" type="submit">Entrar</button>
    </form>
  </main>
</body>
</html>`;
}

function panelPage() {
    return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel Administrativo | TechAgenda</title>
  <link rel="stylesheet" href="/admin.css">
</head>
<body>
  <main class="admin-card panel-card">
    <div class="brand"><img src="/imagens/logo.png" alt="TechAgenda"></div>
    <h1>Painel Administrativo</h1>
    <form method="post" action="/admin/logout">
      <button class="logout" type="submit">Sair</button>
    </form>
  </main>
</body>
</html>`;
}

function readForm(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', (chunk) => {
            body += chunk;
            if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
                reject(new Error('Corpo da requisição excede o limite.'));
                request.destroy();
            }
        });
        request.on('end', () => resolve(new URLSearchParams(body)));
        request.on('error', reject);
    });
}

function redirect(response, location, headers = {}) {
    response.writeHead(303, { Location: location, 'Cache-Control': 'no-store', ...headers });
    response.end();
}

function serveStatic(request, response, pathname) {
    let relativePath;
    try {
        relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).slice(1);
    } catch {
        response.writeHead(400).end('Requisição inválida.');
        return;
    }

    const isApplicationFile = ['index.html', 'script.js', 'style.css', 'admin.css'].includes(relativePath);
    const isImageFile = /^imagens[/\\][^/\\]+$/.test(relativePath);
    if (!isApplicationFile && !isImageFile) {
        response.writeHead(404).end('Não encontrado.');
        return;
    }

    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(400).end('Requisição inválida.');
        return;
    }

    fs.stat(filePath, (error, stat) => {
        if (error || !stat.isFile()) {
            response.writeHead(404).end('Não encontrado.');
            return;
        }

        response.writeHead(200, {
            'Cache-Control': 'no-cache',
            'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff'
        });
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        fs.createReadStream(filePath).pipe(response);
    });
}

function createAdminServer({ username, passwordHash }) {
    const credentials = parsePasswordHash(passwordHash);

    return http.createServer(async (request, response) => {
        let pathname;
        try {
            pathname = new URL(request.url, 'http://localhost').pathname;
        } catch {
            response.writeHead(400).end('Requisição inválida.');
            return;
        }

        if (pathname === '/admin' && request.method === 'GET') {
            if (getSession(request)) return redirect(response, '/admin/painel');
            return sendHtml(response, 200, loginPage());
        }

        if (pathname === '/admin' && request.method === 'POST') {
            let form;
            try {
                form = await readForm(request);
            } catch (error) {
                if (error.message === 'Corpo da requisição excede o limite.') {
                    return response.writeHead(413).end('Requisição muito grande.');
                }
                console.error('Falha ao ler formulário administrativo:', error);
                return response.writeHead(400).end('Requisição inválida.');
            }

            const submittedUsername = form.get('username') || '';
            const submittedPassword = form.get('password') || '';
            let submittedHash;
            try {
                submittedHash = await scrypt(submittedPassword, credentials.salt, 64);
            } catch (error) {
                console.error('Falha ao validar credenciais administrativas:', error);
                return response.writeHead(500).end('Não foi possível validar o acesso.');
            }

            if (!safeEqual(submittedUsername, username) ||
                !crypto.timingSafeEqual(submittedHash, credentials.hash)) {
                return sendHtml(response, 401, loginPage('Usuário ou senha incorretos.'));
            }

            const sessionId = crypto.randomBytes(32).toString('hex');
            sessions.set(sessionId, { expiresAt: Date.now() + SESSION_TTL_MS });
            const secureCookie = request.socket.encrypted || process.env.NODE_ENV === 'production'
                ? '; Secure'
                : '';
            return redirect(response, '/admin/painel', {
                'Set-Cookie': `techagenda_admin=${sessionId}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${SESSION_TTL_MS / 1000}${secureCookie}`
            });
        }

        if (pathname === '/admin/painel' && request.method === 'GET') {
            if (!getSession(request)) return redirect(response, '/admin');
            return sendHtml(response, 200, panelPage());
        }

        if (pathname === '/admin/logout' && request.method === 'POST') {
            const currentSession = getSession(request);
            if (currentSession) sessions.delete(currentSession.id);
            const secureCookie = request.socket.encrypted || process.env.NODE_ENV === 'production'
                ? '; Secure'
                : '';
            return redirect(response, '/admin', {
                'Set-Cookie': `techagenda_admin=; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=0${secureCookie}`
            });
        }

        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
            response.writeHead(404).end('Não encontrado.');
            return;
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.writeHead(405, { Allow: 'GET, HEAD' }).end('Método não permitido.');
            return;
        }
        serveStatic(request, response, pathname);
    });
}

if (require.main === module) {
    loadEnv();
    const username = process.env.ADMIN_USERNAME;
    if (!username) {
        console.error('ADMIN_USERNAME ausente. Execute npm run setup:admin.');
        process.exit(1);
    }

    let server;
    try {
        server = createAdminServer({
            username,
            passwordHash: process.env.ADMIN_PASSWORD_HASH
        });
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || '127.0.0.1';
    server.listen(port, host, () => {
        console.log(`TechAgenda disponível em http://${host}:${port}`);
        console.log(`Login administrativo: http://${host}:${port}/admin`);
    });
}

module.exports = { createAdminServer };
