const { HttpsError } = require('firebase-functions/v2/https');

function requireAdmin(request) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Entre com Google para continuar.');
    }
    if (request.auth.token.admin !== true) {
        throw new HttpsError('permission-denied', 'Esta conta não tem permissão administrativa.');
    }
}

module.exports = { requireAdmin };
