const { StoreError } = require('../../functions/admin-store');
const { toPublicReservation } = require('../../functions/public-reservations');
const {
    getRuntime,
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson
} = require('../shared/runtime');

function createHandler(runtimeProvider = getRuntime) {
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
            const { db } = runtimeProvider();
            const snapshot = await db.collection('reservas').get();
            const reservations = snapshot.docs.map((document) =>
                toPublicReservation(document.id, document.data())
            );
            return sendJson(200, reservations);
        } catch (error) {
            if (error instanceof StoreError) {
                return sendJson(error.statusCode, { error: error.message });
            }
            console.error('Falha ao carregar reservas públicas via Netlify:', error);
            return sendJson(503, {
                error: 'A lista de reservas está temporariamente indisponível. Tente novamente mais tarde.'
            });
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
