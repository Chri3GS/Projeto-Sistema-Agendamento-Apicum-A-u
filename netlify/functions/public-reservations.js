const {
    getAdminSession,
    getRuntime,
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson,
    storeErrorResponse
} = require('../shared/runtime');

function createHandler(runtimeProvider = getRuntime, adminSessionProvider = getAdminSession) {
    return async (event) => {
        if (event.httpMethod !== 'POST') {
            return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'POST' });
        }
        if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });
        if (!hasJsonContentType(event)) {
            return sendJson(415, { error: 'Esta operação exige conteúdo JSON.' });
        }

        try {
            const { db, store } = runtimeProvider();
            const session = await adminSessionProvider(event, db);
            if (!session) return sendJson(401, { error: 'Sessão administrativa inválida ou expirada.' });
            parseJson(event);
            return sendJson(200, await store.listReservations());
        } catch (error) {
            return storeErrorResponse(error);
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
