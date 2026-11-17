const { getApp, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { requireAdmin } = require('./authz');
const { createAdminStore, StoreError } = require('./admin-store');

const app = getApps().length ? getApp() : initializeApp();
const store = createAdminStore({
    db: getFirestore(app),
    auth: getAuth(app),
    FieldValue
});

function callableError(error) {
    if (!(error instanceof StoreError)) return error;
    const codes = {
        400: 'invalid-argument',
        401: 'unauthenticated',
        404: 'not-found',
        409: 'failed-precondition'
    };
    return new HttpsError(codes[error.statusCode] || 'internal', error.message);
}

exports.createReservation = onCall(async (request) => {
    try {
        if (!request.auth) {
            throw new HttpsError('unauthenticated', 'Entre com Google para confirmar a reserva.');
        }
        const authorization = request.rawRequest.get('authorization') || '';
        const token = authorization.match(/^Bearer (.+)$/i)?.[1];
        if (!token) {
            throw new HttpsError('unauthenticated', 'Não foi possível validar sua sessão Google.');
        }
        return await store.createReservation(request.data, token);
    } catch (error) {
        throw callableError(error);
    }
});

exports.adminDashboard = onCall(async (request) => {
    requireAdmin(request);
    try {
        return await store.getDashboard();
    } catch (error) {
        throw callableError(error);
    }
});

async function getAdminReservations(request) {
    requireAdmin(request);
    try {
        return await store.listReservations();
    } catch (error) {
        throw callableError(error);
    }
}

exports.adminReservations = onCall(getAdminReservations);
exports.publicReservations = onCall(getAdminReservations);

exports.saveEnvironment = onCall(async (request) => {
    requireAdmin(request);
    try {
        const { data, id = null } = request.data || {};
        return await store.saveEnvironment(data, id, request.auth.uid);
    } catch (error) {
        throw callableError(error);
    }
});

exports.deleteEnvironment = onCall(async (request) => {
    requireAdmin(request);
    try {
        const { id } = request.data || {};
        await store.deleteEnvironment(id, request.auth.uid);
        return { ok: true };
    } catch (error) {
        throw callableError(error);
    }
});

exports.cancelReservation = onCall(async (request) => {
    requireAdmin(request);
    try {
        const { id } = request.data || {};
        await store.cancelReservation(id, request.auth.uid);
        return { ok: true };
    } catch (error) {
        throw callableError(error);
    }
});

exports.deleteReservation = onCall(async (request) => {
    requireAdmin(request);
    try {
        const { id } = request.data || {};
        await store.deleteReservation(id, request.auth.uid);
        return { ok: true };
    } catch (error) {
        throw callableError(error);
    }
});
