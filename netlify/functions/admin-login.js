const crypto = require('node:crypto');
const {
    createSessionToken,
    sessionCookie,
    SESSION_TTL_MS,
    verifyPassword
} = require('../shared/admin-security');
const {
    getRuntime,
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson,
    storeErrorResponse
} = require('../shared/runtime');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'POST' });
    }
    if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });
    if (!hasJsonContentType(event)) {
        return sendJson(415, { error: 'Esta operação exige conteúdo JSON.' });
    }

    try {
        const { username, password } = parseJson(event, 4096);
        const configuredUsername = process.env.ADMIN_USERNAME;
        const sessionSecret = process.env.ADMIN_SESSION_SECRET;
        if (!configuredUsername || !process.env.ADMIN_PASSWORD_HASH) {
            throw new Error('ADMIN_USERNAME ou ADMIN_PASSWORD_HASH não foi configurada.');
        }
        const submittedUsername = Buffer.from(typeof username === 'string' ? username : '');
        const expectedUsername = Buffer.from(configuredUsername);
        const usernameMatches = submittedUsername.length === expectedUsername.length &&
            crypto.timingSafeEqual(submittedUsername, expectedUsername);
        const passwordMatches = await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH);
        if (!usernameMatches || !passwordMatches) {
            return sendJson(401, { error: 'Usuário ou senha incorretos.' });
        }

        const { db } = getRuntime();
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + SESSION_TTL_MS;
        const token = createSessionToken(sessionId, expiresAt, sessionSecret);
        await db.collection('adminSessions').doc(sessionId).create({
            username: configuredUsername,
            expiresAt,
            criadoEm: new Date()
        });
        return sendJson(200, { ok: true }, {
            'Set-Cookie': sessionCookie(token, SESSION_TTL_MS)
        });
    } catch (error) {
        return storeErrorResponse(error);
    }
};
