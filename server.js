const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { StoreError, createAdminStore } = require('./admin-store');

const root = __dirname;
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 128 * 1024;
const FIREBASE_PROJECT_ID = 'sistema-agendamento-ct-apc';
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json; charset=utf-8'
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

function initializeFirebaseAdminStore() {
    try {
        const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
        const { FieldValue, getFirestore } = require('firebase-admin/firestore');
        const { getAuth } = require('firebase-admin/auth');
        const serviceAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
        const credential = serviceAccount
            ? cert(JSON.parse(serviceAccount))
            : (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_ADMIN_USE_ADC === 'true'
                ? applicationDefault()
                : null);
        if (!credential) return null;

        const app = getApps().find((existing) => existing.name === 'techagenda-admin') ||
            initializeApp({
                credential,
                projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || FIREBASE_PROJECT_ID
            }, 'techagenda-admin');
        const auth = getAuth(app);
        return {
            auth,
            store: createAdminStore({
                db: getFirestore(app),
                auth,
                FieldValue
            })
        };
    } catch (error) {
        console.error('Firebase Admin não pôde ser inicializado:', error.message);
        return null;
    }
}

function sendJson(response, statusCode, data, extraHeaders = {}) {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        ...extraHeaders
    });
    response.end(JSON.stringify(data));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let bodyBytes = 0;
        let tooLarge = false;
        request.on('data', (chunk) => {
            if (tooLarge) return;
            bodyBytes += chunk.length;
            if (bodyBytes > MAX_JSON_BODY_BYTES) {
                tooLarge = true;
                reject(new StoreError(413, 'O corpo da requisição excede o limite permitido.'));
                request.resume();
                return;
            }
            chunks.push(chunk);
        });
        request.on('end', () => {
            if (tooLarge) return;
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new StoreError(400, 'JSON inválido.'));
            }
        });
        request.on('error', (error) => {
            if (!tooLarge) reject(error);
        });
    });
}

function isSameOrigin(request) {
    const origin = request.headers.origin;
    if (!origin || !request.headers.host) return false;
    try {
        return new URL(origin).host === request.headers.host;
    } catch {
        return false;
    }
}

function sendStoreError(response, error) {
    if (error instanceof StoreError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
    }
    if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired' ||
        error.code === 'auth/invalid-id-token' || error.code === 'auth/id-token-revoked' ||
        error.code === 'auth/user-disabled' || error.code === 'auth/user-not-found') {
        sendJson(response, 401, { error: 'Sessão Google inválida ou expirada.' });
        return;
    }
    console.error('Falha na API do Firestore:', error);
    const unavailable = error.code === 5 || error.code === 7 ||
        error.code === 'app/invalid-credential' || error.code === 'auth/invalid-credential';
    sendJson(response, unavailable ? 503 : 500, {
        error: unavailable
            ? 'A integração segura com o Firestore Admin não está disponível. Configure as credenciais do servidor.'
            : 'Não foi possível concluir a operação no banco de dados.'
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

    const isApplicationFile = [
        'index.html',
        'script.js',
        'style.css',
        'admin.css',
        'manifest.webmanifest',
        'service-worker.js'
    ].includes(relativePath);
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

        if (request.method === 'HEAD') {
            response.writeHead(200, {
                'Cache-Control': relativePath === 'index.html' ? 'no-store' : 'no-cache',
                'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                'X-Content-Type-Options': 'nosniff'
            });
            response.end();
            return;
        }
        if (relativePath === 'index.html') {
            fs.readFile(filePath, 'utf8', (readError, html) => {
                if (readError) {
                    response.writeHead(500).end('Não foi possível carregar o site.');
                    return;
                }
                const backendMarker = 'name="techagenda-backend" content="local"';
                const page = html.replace(
                    /name="techagenda-backend" content="netlify"/,
                    backendMarker
                );
                response.writeHead(200, {
                    'Cache-Control': 'no-store',
                    'Content-Type': 'text/html; charset=utf-8',
                    'X-Content-Type-Options': 'nosniff'
                });
                response.end(page);
            });
            return;
        }
        response.writeHead(200, {
            'Cache-Control': 'no-cache',
            'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff'
        });
        fs.createReadStream(filePath).pipe(response);
    });
}

function createAdminServer({
    firebaseStore = null,
    firebaseAuth = null,
    adminUid = process.env.ADMIN_UID
} = {}) {
    return http.createServer(async (request, response) => {
        let pathname;
        try {
            pathname = new URL(request.url, 'http://localhost').pathname;
        } catch {
            response.writeHead(400).end('Requisição inválida.');
            return;
        }

        if (pathname === '/api/ambientes' && request.method === 'GET') {
            if (!firebaseStore) {
                return sendJson(response, 503, {
                    error: 'O catálogo compartilhado exige credenciais Firebase Admin configuradas no servidor.'
                });
            }
            try {
                return sendJson(response, 200, await firebaseStore.listPublicEnvironments());
            } catch (error) {
                return sendStoreError(response, error);
            }
        }

        if (pathname === '/api/reservation-availability' && request.method === 'POST') {
            if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem da requisição inválida.' });
            if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
                return sendJson(response, 415, { error: 'Esta operação exige conteúdo JSON.' });
            }
            if (!firebaseStore) {
                return sendJson(response, 503, {
                    error: 'A disponibilidade exige credenciais Firebase Admin configuradas no servidor.'
                });
            }
            try {
                await readJson(request);
                return sendJson(response, 200, await firebaseStore.listReservationAvailability());
            } catch (error) {
                return sendStoreError(response, error);
            }
        }

        if (pathname === '/api/reservas' && request.method === 'POST') {
            if (!firebaseStore) {
                return sendJson(response, 503, {
                    error: 'A criação segura de reservas exige credenciais Firebase Admin no servidor.'
                });
            }
            const authorization = request.headers.authorization || '';
            const token = authorization.match(/^Bearer (.+)$/i)?.[1];
            if (!token) return sendJson(response, 401, { error: 'Entre com Google para confirmar a reserva.' });
            if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem da requisição inválida.' });
            try {
                const data = await readJson(request);
                const reservation = await firebaseStore.createReservation(data, token);
                return sendJson(response, 201, reservation);
            } catch (error) {
                return sendStoreError(response, error);
            }
        }

        if (pathname === '/api/user/reservas' && request.method === 'POST') {
            if (!firebaseStore) {
                return sendJson(response, 503, {
                    error: 'O gerenciamento seguro de reservas exige credenciais Firebase Admin no servidor.'
                });
            }
            const authorization = request.headers.authorization || '';
            const token = authorization.match(/^Bearer (.+)$/i)?.[1];
            if (!token) return sendJson(response, 401, { error: 'Entre com sua conta Google para continuar.' });
            if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem da requisição inválida.' });
            if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
                return sendJson(response, 415, { error: 'Esta operação exige conteúdo JSON.' });
            }
            try {
                const data = await readJson(request);
                switch (data.action) {
                    case 'list':
                        return sendJson(response, 200, await firebaseStore.listUserReservations(token));
                    case 'update':
                        return sendJson(response, 200, await firebaseStore.updateUserReservation(
                            data.id,
                            data.data,
                            token
                        ));
                    case 'cancel':
                        return sendJson(response, 200, await firebaseStore.cancelUserReservation(data.id, token));
                    default:
                        return sendJson(response, 404, { error: 'Operação de reserva não encontrada.' });
                }
            } catch (error) {
                return sendStoreError(response, error);
            }
        }

        if (pathname === '/api/admin/session' && request.method === 'POST') {
            if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem da requisição inválida.' });
            if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
                return sendJson(response, 415, { error: 'Esta operação exige conteúdo JSON.' });
            }
            let data;
            try {
                data = await readJson(request);
            } catch (error) {
                return sendStoreError(response, error);
            }
            if (typeof data.idToken !== 'string' || !data.idToken) {
                return sendJson(response, 401, { error: 'Token do Firebase Authentication ausente.' });
            }
            if (typeof data.validateOnly !== 'undefined' && typeof data.validateOnly !== 'boolean') {
                return sendJson(response, 400, { error: 'Opção de validação de sessão inválida.' });
            }
            if (!firebaseAuth || !adminUid) {
                return sendJson(response, 503, {
                    error: 'Configure Firebase Admin e ADMIN_UID no servidor para habilitar a administração.'
                });
            }
            let decodedToken;
            try {
                decodedToken = await firebaseAuth.verifyIdToken(data.idToken, true);
            } catch (error) {
                const previousSession = getSession(request);
                if (previousSession) sessions.delete(previousSession.id);
                const clearCookie = `techagenda_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${
                    request.socket.encrypted || process.env.NODE_ENV === 'production' ? '; Secure' : ''
                }`;
                if (error.code === 'auth/argument-error' || error.code === 'auth/id-token-expired' ||
                    error.code === 'auth/invalid-id-token' || error.code === 'auth/id-token-revoked' ||
                    error.code === 'auth/user-disabled' || error.code === 'auth/user-not-found') {
                    return sendJson(response, 401, { error: 'Sessão Google inválida ou expirada.' }, {
                        'Set-Cookie': clearCookie
                    });
                }
                return sendStoreError(response, error);
            }
            const previousSession = getSession(request);
            if (decodedToken.uid !== adminUid ||
                decodedToken.email !== 'centrotec.apc@gmail.com' ||
                decodedToken.email_verified !== true ||
                decodedToken.firebase?.sign_in_provider !== 'google.com') {
                if (previousSession) sessions.delete(previousSession.id);
                const clearCookie = `techagenda_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${
                    request.socket.encrypted || process.env.NODE_ENV === 'production' ? '; Secure' : ''
                }`;
                return sendJson(response, 403, {
                    error: 'Esta conta Google não tem permissão administrativa.'
                }, { 'Set-Cookie': clearCookie });
            }
            if (data.validateOnly) {
                if (previousSession?.session.uid === decodedToken.uid) {
                    return sendJson(response, 200, { authenticated: true });
                }
                const clearCookie = `techagenda_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${
                    request.socket.encrypted || process.env.NODE_ENV === 'production' ? '; Secure' : ''
                }`;
                return sendJson(response, 401, { authenticated: false }, { 'Set-Cookie': clearCookie });
            }
            if (previousSession?.session.uid === decodedToken.uid) {
                return sendJson(response, 200, { authenticated: true });
            }
            if (previousSession) sessions.delete(previousSession.id);
            const sessionId = crypto.randomBytes(32).toString('hex');
            sessions.set(sessionId, {
                uid: decodedToken.uid,
                expiresAt: Date.now() + SESSION_TTL_MS
            });
            const secureCookie = request.socket.encrypted || process.env.NODE_ENV === 'production'
                ? '; Secure'
                : '';
            return sendJson(response, 200, { authenticated: true }, {
                'Set-Cookie': `techagenda_admin=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secureCookie}`
            });
        }

        if (pathname === '/api/admin/logout' && request.method === 'POST') {
            if (!isSameOrigin(request)) return sendJson(response, 403, { error: 'Origem da requisição inválida.' });
            const currentSession = getSession(request);
            if (currentSession) sessions.delete(currentSession.id);
            const secureCookie = request.socket.encrypted || process.env.NODE_ENV === 'production'
                ? '; Secure'
                : '';
            return sendJson(response, 200, { ok: true }, {
                'Set-Cookie': `techagenda_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`
            });
        }

        if (pathname.startsWith('/api/admin/')) {
            const adminSession = getSession(request);
            if (!adminSession) return sendJson(response, 401, { error: 'Autenticação administrativa obrigatória.' });
            if (!firebaseStore) {
                return sendJson(response, 503, {
                    error: 'Configure credenciais Firebase Admin no servidor para habilitar o gerenciamento compartilhado.'
                });
            }
            const isMutation = !['GET', 'HEAD'].includes(request.method);
            if (isMutation && !isSameOrigin(request)) {
                return sendJson(response, 403, { error: 'Origem da requisição inválida.' });
            }
            if (isMutation && !/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) {
                return sendJson(response, 415, { error: 'Esta operação exige conteúdo JSON.' });
            }
            const actor = adminSession.session.uid;
            try {
                if (pathname === '/api/admin/dashboard' && request.method === 'GET') {
                    return sendJson(response, 200, await firebaseStore.getDashboard());
                }
                if (pathname === '/api/admin/reservas' && request.method === 'GET') {
                    return sendJson(response, 200, await firebaseStore.listReservations());
                }
                const notificationMatch = pathname.match(/^\/api\/admin\/notificacoes\/([^/]+)\/lida$/);
                if (notificationMatch && request.method === 'PATCH') {
                    await firebaseStore.markAdminNotificationRead(
                        decodeURIComponent(notificationMatch[1])
                    );
                    return sendJson(response, 200, { ok: true });
                }
                if (pathname === '/api/admin/ambientes' && request.method === 'POST') {
                    const created = await firebaseStore.saveEnvironment(await readJson(request), null, actor);
                    return sendJson(response, 201, created);
                }
                const environmentMatch = pathname.match(/^\/api\/admin\/ambientes\/([^/]+)$/);
                if (environmentMatch && ['PUT', 'PATCH'].includes(request.method)) {
                    const id = decodeURIComponent(environmentMatch[1]);
                    const updated = await firebaseStore.saveEnvironment(await readJson(request), id, actor);
                    return sendJson(response, 200, updated);
                }
                if (environmentMatch && request.method === 'DELETE') {
                    await firebaseStore.deleteEnvironment(decodeURIComponent(environmentMatch[1]), actor);
                    return sendJson(response, 200, { ok: true });
                }
                const cancelMatch = pathname.match(/^\/api\/admin\/reservas\/([^/]+)\/cancelar$/);
                if (cancelMatch && request.method === 'PATCH') {
                    await firebaseStore.cancelReservation(decodeURIComponent(cancelMatch[1]), actor);
                    return sendJson(response, 200, { ok: true });
                }
                const reservationMatch = pathname.match(/^\/api\/admin\/reservas\/([^/]+)$/);
                if (reservationMatch && request.method === 'DELETE') {
                    await firebaseStore.deleteReservation(decodeURIComponent(reservationMatch[1]), actor);
                    return sendJson(response, 200, { ok: true });
                }
                return sendJson(response, 404, { error: 'Operação administrativa não encontrada.' });
            } catch (error) {
                return sendStoreError(response, error);
            }
        }

        if (pathname === '/admin' && request.method === 'GET') {
            return redirect(response, '/?login=google');
        }

        if (pathname === '/admin/painel' && request.method === 'GET') {
            if (!getSession(request)) return redirect(response, '/?login=google');
            return serveStatic(request, response, '/index.html');
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

    let server;
    try {
        const firebaseAdmin = initializeFirebaseAdminStore();
        if (!firebaseAdmin) {
            console.warn('Firebase Admin não configurado. O site funciona, mas as APIs de gerenciamento ficam indisponíveis.');
        }
        server = createAdminServer({
            firebaseStore: firebaseAdmin?.store,
            firebaseAuth: firebaseAdmin?.auth,
            adminUid: process.env.ADMIN_UID
        });
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || '0.0.0.0';
    server.listen(port, host, () => {
        console.log(`TechAgenda disponível em http://${host}:${port}`);
    });
}

module.exports = { createAdminServer };
