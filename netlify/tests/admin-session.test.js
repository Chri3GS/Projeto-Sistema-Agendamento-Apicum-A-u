const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { createSessionToken } = require('../shared/admin-security');
const { getAdminSession, getConfiguredProjectId } = require('../shared/runtime');

test('Netlify Admin SDK usa o projeto Firebase do site e rejeita override divergente', (context) => {
    const previousProjectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    context.after(() => {
        if (previousProjectId === undefined) delete process.env.FIREBASE_ADMIN_PROJECT_ID;
        else process.env.FIREBASE_ADMIN_PROJECT_ID = previousProjectId;
    });

    delete process.env.FIREBASE_ADMIN_PROJECT_ID;
    assert.equal(getConfiguredProjectId(), 'sistema-agendamento-ct-apc');
    process.env.FIREBASE_ADMIN_PROJECT_ID = 'sistema-agendamento-ct-apc';
    assert.equal(getConfiguredProjectId(), 'sistema-agendamento-ct-apc');
    process.env.FIREBASE_ADMIN_PROJECT_ID = 'outro-projeto';
    assert.throws(getConfiguredProjectId, /deve ser "sistema-agendamento-ct-apc"/);
});

test('requires a valid signature and a matching active Firestore session for every request', async (context) => {
    const previousSecret = process.env.ADMIN_SESSION_SECRET;
    const previousAdminUid = process.env.ADMIN_UID;
    const uid = 'authorized-uid';
    const secret = crypto.randomBytes(32).toString('hex');
    process.env.ADMIN_UID = uid;
    process.env.ADMIN_SESSION_SECRET = secret;
    context.after(() => {
        if (previousAdminUid === undefined) delete process.env.ADMIN_UID;
        else process.env.ADMIN_UID = previousAdminUid;
        if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
        else process.env.ADMIN_SESSION_SECRET = previousSecret;
    });

    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60_000;
    const token = createSessionToken(sessionId, expiresAt, secret);
    const sessionDocument = {
        exists: true,
        data: () => ({ uid, expiresAt })
    };
    const db = {
        collection(name) {
            assert.equal(name, 'adminSessions');
            return {
                doc(id) {
                    assert.equal(id, sessionId);
                    return { get: async () => sessionDocument };
                }
            };
        }
    };
    const event = { headers: { cookie: `other=value; techagenda_admin=${token}` } };

    const verified = await getAdminSession(event, db);
    assert.equal(verified.sessionId, sessionId);
    assert.equal(verified.uid, uid);
    assert.equal(await getAdminSession({
        headers: { cookie: `techagenda_admin=${token[0] === 'a' ? 'b' : 'a'}${token.slice(1)}` }
    }, db), null);
});
