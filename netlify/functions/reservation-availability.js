const { StoreError } = require('../../functions/admin-store');
const {
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson,
    storeErrorResponse
} = require('../shared/runtime');

function createHandler(runtimeProvider) {
    return async (event) => {
        if (event.httpMethod !== 'POST') {
            return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'POST' });
        }
        if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });
        if (!hasJsonContentType(event)) {
            return sendJson(415, { error: 'Esta operação exige conteúdo JSON.' });
        }

        try {
            parseJson(event);
            const { store } = runtimeProvider();
            return sendJson(200, await store.listReservationAvailability());
        } catch (error) {
            if (error instanceof StoreError) {
                return sendJson(error.statusCode, { error: error.message });
            }
            return storeErrorResponse(error);
        }
    };
}

exports.handler = createHandler(require('../shared/runtime').getRuntime);
exports.createHandler = createHandler;
