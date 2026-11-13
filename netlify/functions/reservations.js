const { StoreError } = require('../../functions/admin-store');
const {
    getRuntime,
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson
} = require('../shared/runtime');

const INVALID_TOKEN_CODES = new Set([
    'auth/argument-error',
    'auth/id-token-expired',
    'auth/invalid-id-token',
    'auth/id-token-revoked'
]);

function reservationErrorResponse(error) {
    if (error instanceof StoreError) {
        return sendJson(error.statusCode, { error: error.message });
    }
    if (INVALID_TOKEN_CODES.has(error.code)) {
        return sendJson(401, { error: 'Sessão Google inválida ou expirada. Entre novamente.' });
    }

    console.error('Falha ao criar reserva via Netlify:', error);
    const unavailable = error.code === 5 || error.code === 7 ||
        error.code === 'app/invalid-credential' || error.code === 'auth/invalid-credential';
    return sendJson(unavailable ? 503 : 500, {
        error: unavailable
            ? 'O serviço de reservas está temporariamente indisponível. Tente novamente mais tarde.'
            : 'Não foi possível confirmar a reserva. Tente novamente.'
    });
}

function createHandler(runtimeProvider = getRuntime) {
    return async (event) => {
        if (event.httpMethod !== 'POST') {
            return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'POST' });
        }
        if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });
        if (!hasJsonContentType(event)) {
            return sendJson(415, { error: 'Esta operação exige conteúdo JSON.' });
        }

        const authorization = event.headers?.authorization || '';
        const token = authorization.match(/^Bearer (.+)$/i)?.[1];
        if (!token) {
            return sendJson(401, { error: 'Entre com sua conta Google para confirmar a reserva.' });
        }

        try {
            const input = parseJson(event);
            const { store } = runtimeProvider();
            const reservation = await store.createReservation(input, token);
            return sendJson(201, reservation);
        } catch (error) {
            return reservationErrorResponse(error);
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
