const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { createAdminStore, StoreError } = require('../../functions/admin-store');
const { sessionCookie, verifySessionToken } = require('./admin-security');

const FIREBASE_PROJECT_ID = 'sistema-agendamento-ct-apc';
const MAX_JSON_BODY_BYTES = 128 * 1024;
let runtime;

function getRuntime() {
    if (runtime) return runtime;
    const encodedAccount = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
    if (!encodedAccount) {
        throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT não foi configurada no ambiente Netlify.');
    }
    const serviceAccount = JSON.parse(encodedAccount);
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ||
        serviceAccount.project_id || FIREBASE_PROJECT_ID;
    const app = getApps().find((item) => item.name === 'techagenda-netlify-admin') ||
        initializeApp({
            credential: cert(serviceAccount),
            projectId
        }, 'techagenda-netlify-admin');
    const db = getFirestore(app);
    runtime = {
        auth: getAuth(app),
        db,
        store: createAdminStore({ db, auth: getAuth(app), FieldValue })
    };
    return runtime;
}

function sendJson(statusCode, data, extraHeaders = {}) {
    return {
        statusCode,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
            ...extraHeaders
        },
        body: JSON.stringify(data)
    };
}

function parseJson(event, maxBytes = MAX_JSON_BODY_BYTES) {
    const body = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf8')
        : (event.body || '');
    if (Buffer.byteLength(body) > maxBytes) {
        throw new StoreError(413, 'O corpo da requisição excede o limite permitido.');
    }
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('JSON deve ser um objeto.');
        }
        return parsed;
    } catch {
        throw new StoreError(400, 'Corpo JSON inválido.');
    }
}

function hasJsonContentType(event) {
    return /^application\/json(?:\s*;|$)/i.test(event.headers?.['content-type'] || '');
}

function sameOrigin(event) {
    const origin = event.headers?.origin;
    const host = event.headers?.['x-forwarded-host'] || event.headers?.host;
    if (!origin || !host) return false;
    try {
        const url = new URL(origin);
        const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
        return url.host.toLowerCase() === host.toLowerCase() &&
            (url.protocol === 'https:' || isLocal);
    } catch {
        return false;
    }
}

async function getAdminSession(event, db) {
    const cookie = event.headers?.cookie || '';
    const match = cookie.match(/(?:^|;\s*)techagenda_admin=([^;]+)/);
    if (!match) return null;
    const secret = process.env.ADMIN_SESSION_SECRET;
    const token = verifySessionToken(match[1], secret);
    if (!token) return null;
    const sessionRef = db.collection('adminSessions').doc(token.sessionId);
    const sessionSnapshot = await sessionRef.get();
    if (!sessionSnapshot.exists) return null;
    const session = sessionSnapshot.data();
    if (session.username !== process.env.ADMIN_USERNAME ||
        session.expiresAt !== token.expiresAt ||
        session.expiresAt <= Date.now()) return null;
    return { ...token, username: session.username, ref: sessionRef };
}

function storeErrorResponse(error) {
    if (error instanceof StoreError) {
        return sendJson(error.statusCode, { error: error.message });
    }
    console.error('Falha em operação administrativa Netlify:', error);
    return sendJson(500, { error: 'Não foi possível concluir a operação administrativa.' });
}

module.exports = {
    getAdminSession,
    getRuntime,
    hasJsonContentType,
    parseJson,
    sameOrigin,
    sendJson,
    sessionCookie,
    storeErrorResponse
};
