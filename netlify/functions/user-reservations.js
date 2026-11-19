const {
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

function createHandler(runtimeProvider = getRuntime) {
    return async (event) => {
        if (event.httpMethod !== 'POST') {
            return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'POST' });
        }
        if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });
        if (!hasJsonContentType(event)) {
            return sendJson(415, { error: 'Esta operação exige conteúdo JSON.' });
        }
        const token = (event.headers?.authorization || '').match(/^Bearer (.+)$/i)?.[1];
        if (!token) return sendJson(401, { error: 'Entre com sua conta Google para continuar.' });

        try {
            const request = parseJson(event);
            const { store } = runtimeProvider();
            switch (request.action) {
                case 'list':
                    return sendJson(200, await store.listUserReservations(token));
                case 'update':
                    return sendJson(200, await store.updateUserReservation(
                        request.id,
                        request.data,
                        token
                    ));
                case 'cancel':
                    return sendJson(200, await store.cancelUserReservation(request.id, token));
                default:
                    return sendJson(404, { error: 'Operação de reserva não encontrada.' });
            }
        } catch (error) {
            if (INVALID_TOKEN_CODES.has(error.code)) {
                return sendJson(401, { error: 'Sessão Google inválida ou expirada. Entre novamente.' });
            }
            return storeErrorResponse(error);
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
