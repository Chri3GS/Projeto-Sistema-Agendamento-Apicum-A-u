const assert = require('node:assert/strict');
const { test } = require('node:test');
const { requireAdmin } = require('./authz');

test('exige usuário autenticado e claim administrativa booleana', () => {
    assert.throws(() => requireAdmin({ auth: null }), { code: 'unauthenticated' });
    assert.throws(() => requireAdmin({ auth: { token: { admin: 'true' } } }), {
        code: 'permission-denied'
    });
    assert.throws(() => requireAdmin({ auth: { token: {} } }), { code: 'permission-denied' });
    assert.doesNotThrow(() => requireAdmin({ auth: { uid: 'uid-admin', token: { admin: true } } }));
});
