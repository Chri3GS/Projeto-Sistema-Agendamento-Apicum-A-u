const assert = require('node:assert/strict');
const { test } = require('node:test');
const { requireAdmin } = require('./authz');

test('exige Google e UID administrativo configurado no servidor', (context) => {
    const previousAdminUid = process.env.ADMIN_UID;
    delete process.env.ADMIN_UID;
    assert.throws(() => requireAdmin({
        auth: { uid: 'uid-admin', token: {} }
    }), { code: 'failed-precondition' });
    process.env.ADMIN_UID = 'uid-admin';
    context.after(() => {
        if (previousAdminUid === undefined) delete process.env.ADMIN_UID;
        else process.env.ADMIN_UID = previousAdminUid;
    });

    const googleToken = {
        email: 'centrotec.apc@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' }
    };
    assert.throws(() => requireAdmin({ auth: null }), { code: 'unauthenticated' });
    assert.throws(() => requireAdmin({
        auth: { uid: 'uid-user', token: googleToken }
    }), { code: 'permission-denied' });
    assert.throws(() => requireAdmin({
        auth: { uid: 'uid-admin', token: { ...googleToken, admin: true, email_verified: false } }
    }), { code: 'permission-denied' });
    assert.doesNotThrow(() => requireAdmin({ auth: { uid: 'uid-admin', token: googleToken } }));
});
