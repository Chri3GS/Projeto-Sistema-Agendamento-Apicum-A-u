const { HttpsError } = require('firebase-functions/v2/https');

function requireAdmin(request) {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Entre com Google para continuar.');
    }
    const adminUid = process.env.ADMIN_UID;
    if (!adminUid) {
        throw new HttpsError('failed-precondition', 'ADMIN_UID não foi configurado no servidor.');
    }
    const token = request.auth.token || {};
    if (request.auth.uid !== adminUid ||
        token.email !== 'centrotec.apc@gmail.com' ||
        token.email_verified !== true ||
        token.firebase?.sign_in_provider !== 'google.com') {
        throw new HttpsError('permission-denied', 'Esta conta não tem permissão administrativa.');
    }
}

module.exports = { requireAdmin };
