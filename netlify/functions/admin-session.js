const { getAdminSession, getRuntime, sendJson, storeErrorResponse } = require('../shared/runtime');

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'GET' });
    }
    try {
        const { db } = getRuntime();
        const session = await getAdminSession(event, db);
        return session
            ? sendJson(200, { authenticated: true })
            : sendJson(401, { authenticated: false });
    } catch (error) {
        return storeErrorResponse(error);
    }
};
