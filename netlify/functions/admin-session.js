const crypto = require('node:crypto');
const {
    createSessionToken,
    sessionCookie,
    SESSION_TTL_MS
} = require('../shared/admin-security');
const {
    getAdminSession,
    getRuntime,
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson,
    storeErrorResponse
} = require('../shared/runtime');

const INVALID_TOKEN_CODES = new Set([
    'auth/argument-error',
    'auth/id-token-expired',
    'auth/invalid-id-token',
    'auth/id-token-revoked',
    'auth/user-disabled',
    'auth/user-not-found'
]);

function clearSessionCookie() {
    return { 'Set-Cookie': sessionCookie('', 0) };
}

function createHandler(runtimeProvider = getRuntime) {
    return async (event) => {
        if (event.httpMethod === 'GET') {
            try {
                const { db } = runtimeProvider();
                const session = await getAdminSession(event, db);
                return session
                    ? sendJson(200, { authenticated: true })
                    : sendJson(401, { authenticated: false });
            } catch (error) {
                return storeErrorResponse(error);
            }
        }

        if (event.httpMethod !== 'POST') {
            return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'GET, POST' });
        }
        if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });
        if (!hasJsonContentType(event)) {
            return sendJson(415, { error: 'Esta operação exige conteúdo JSON.' });
        }

        let runtime;
        try {
            const { idToken } = parseJson(event, 16 * 1024);
            if (typeof idToken !== 'string' || !idToken) {
                return sendJson(401, { error: 'Token do Firebase Authentication ausente.' }, clearSessionCookie());
            }
            runtime = runtimeProvider();
            const previousSession = await getAdminSession(event, runtime.db);
            if (previousSession) await previousSession.ref.delete();

            const adminUid = process.env.ADMIN_UID;
            if (!adminUid) {
                throw new Error('ADMIN_UID não foi configurado no ambiente Netlify.');
            }
            let decodedToken;
            try {
                decodedToken = await runtime.auth.verifyIdToken(idToken, true);
            } catch (error) {
                if (INVALID_TOKEN_CODES.has(error.code)) {
                    return sendJson(401, { error: 'Token do Firebase Authentication inválido ou expirado.' }, clearSessionCookie());
                }
                throw error;
            }
            const isAuthorizedGoogleAccount =
                decodedToken.uid === adminUid &&
                decodedToken.email === 'centrotec.apc@gmail.com' &&
                decodedToken.email_verified === true &&
                decodedToken.firebase?.sign_in_provider === 'google.com';
            if (!isAuthorizedGoogleAccount) {
                return sendJson(403, { error: 'Esta conta Google não tem permissão administrativa.' }, clearSessionCookie());
            }

            const sessionId = crypto.randomBytes(32).toString('hex');
            const expiresAt = Date.now() + SESSION_TTL_MS;
            const token = createSessionToken(sessionId, expiresAt, process.env.ADMIN_SESSION_SECRET);
            await runtime.db.collection('adminSessions').doc(sessionId).create({
                uid: decodedToken.uid,
                expiresAt,
                criadoEm: new Date()
            });
            return sendJson(200, { authenticated: true }, {
                'Set-Cookie': sessionCookie(token, SESSION_TTL_MS)
            });
        } catch (error) {
            const response = storeErrorResponse(error);
            response.headers['Set-Cookie'] = sessionCookie('', 0);
            return response;
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
