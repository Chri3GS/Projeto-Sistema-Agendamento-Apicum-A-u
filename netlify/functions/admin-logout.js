const {
    getAdminSession,
    getRuntime,
    sameOrigin,
    sendJson,
    sessionCookie,
    storeErrorResponse
} = require('../shared/runtime');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'POST' });
    }
    if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });
    try {
        const { db } = getRuntime();
        const session = await getAdminSession(event, db);
        if (session) await session.ref.delete();
        return sendJson(200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    } catch (error) {
        return storeErrorResponse(error);
    }
};
