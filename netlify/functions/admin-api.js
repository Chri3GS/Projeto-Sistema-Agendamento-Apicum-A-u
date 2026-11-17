const {
    getAdminSession,
    getRuntime,
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson,
    storeErrorResponse
} = require('../shared/runtime');

function createHandler(
    runtimeProvider = getRuntime,
    adminSessionProvider = getAdminSession
) {
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

            const request = parseJson(event);
            switch (request.action) {
                case 'dashboard':
                    return sendJson(200, await store.getDashboard());
                case 'listReservations':
                    return sendJson(200, await store.listReservations());
                case 'saveEnvironment':
                    return sendJson(200, await store.saveEnvironment(
                        request.data,
                        request.id || null,
                        session.uid
                    ));
                case 'deleteEnvironment':
                    await store.deleteEnvironment(request.id, session.uid);
                    return sendJson(200, { ok: true });
                case 'cancelReservation':
                    await store.cancelReservation(request.id, session.uid);
                    return sendJson(200, { ok: true });
                case 'deleteReservation':
                    await store.deleteReservation(request.id, session.uid);
                    return sendJson(200, { ok: true });
                default:
                    return sendJson(404, { error: 'Operação administrativa não encontrada.' });
            }
        } catch (error) {
            return storeErrorResponse(error);
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
