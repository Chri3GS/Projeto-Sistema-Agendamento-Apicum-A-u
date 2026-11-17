const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const { createHandler } = require('../functions/admin-session');

function request(idToken) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'application/json'
        },
        body: JSON.stringify(idToken ? { idToken } : {})
    };
}

function createRuntime() {
    const records = new Map();
    const db = {
        collection(name) {
            assert.equal(name, 'adminSessions');
            return {
                doc(id) {
                    return {
                        async create(data) {
                            records.set(id, data);
                        },
                        async get() {
                            const data = records.get(id);
                            return { exists: Boolean(data), data: () => data };
                        },
                        async delete() {
                            records.delete(id);
                        }
                    };
                }
            };
        }
    };
    const auth = {
        async verifyIdToken(token, checkRevoked) {
            assert.equal(checkRevoked, true);
            if (token === 'expired') {
                throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
            }
            if (token === 'admin-token') {
                return {
                    uid: 'uid-admin',
                    email: 'centrotec.apc@gmail.com',
                    email_verified: true,
                    firebase: { sign_in_provider: 'google.com' }
                };
            }
            if (token === 'spoofed-email-token') {
                return {
                    uid: 'uid-user',
                    email: 'centrotec.apc@gmail.com',
                    email_verified: true,
                    firebase: { sign_in_provider: 'google.com' }
                };
            }
            return {
                uid: 'uid-user',
                email: 'user@example.com',
                email_verified: true,
                firebase: { sign_in_provider: 'google.com' }
            };
        }
    };
    return { runtime: { db, auth }, records };
}

test('cria sessão somente após validar o ID Token e o UID administrativo', async (context) => {
    const previousAdminUid = process.env.ADMIN_UID;
    const previousSecret = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_UID = 'uid-admin';
    process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    context.after(() => {
        if (previousAdminUid === undefined) delete process.env.ADMIN_UID;
        else process.env.ADMIN_UID = previousAdminUid;
        if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
        else process.env.ADMIN_SESSION_SECRET = previousSecret;
    });

    const { runtime, records } = createRuntime();
    const response = await createHandler(() => runtime)(request('admin-token'));

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { authenticated: true });
    assert.match(response.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
    assert.equal(records.size, 1);
    assert.equal([...records.values()][0].uid, 'uid-admin');
});

test('rejeita contas comuns e requisições sem token sem criar sessão', async (context) => {
    const previousAdminUid = process.env.ADMIN_UID;
    const previousSecret = process.env.ADMIN_SESSION_SECRET;
    process.env.ADMIN_UID = 'uid-admin';
    process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    context.after(() => {
        if (previousAdminUid === undefined) delete process.env.ADMIN_UID;
        else process.env.ADMIN_UID = previousAdminUid;
        if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
        else process.env.ADMIN_SESSION_SECRET = previousSecret;
    });

    const { runtime, records } = createRuntime();
    const handler = createHandler(() => runtime);

    const commonAccount = await handler(request('user-token'));
    assert.equal(commonAccount.statusCode, 403);
    assert.match(commonAccount.headers['Set-Cookie'], /Max-Age=0/);

    const emailOnlyMatch = await handler(request('spoofed-email-token'));
    assert.equal(emailOnlyMatch.statusCode, 403);

    const unauthenticated = await handler(request());
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal(records.size, 0);

    const expiredToken = await handler(request('expired'));
    assert.equal(expiredToken.statusCode, 401);
    assert.equal(records.size, 0);
});
