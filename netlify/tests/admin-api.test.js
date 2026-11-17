const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHandler } = require('../functions/admin-api');

function request(action, data = {}) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'application/json',
            cookie: 'techagenda_admin=session'
        },
        body: JSON.stringify({ action, ...data })
    };
}

test('nenhuma operação administrativa é executada sem sessão autorizada', async () => {
    let operationCalled = false;
    const handler = createHandler(
        () => ({
            db: {},
            store: {
                async getDashboard() {
                    operationCalled = true;
                }
            }
        }),
        async () => null
    );

    const response = await handler(request('dashboard'));

    assert.equal(response.statusCode, 401);
    assert.equal(operationCalled, false);
});

test('usa o UID validado da sessão como ator nas operações administrativas', async () => {
    let actor;
    const handler = createHandler(
        () => ({
            db: {},
            store: {
                async saveEnvironment(data, id, uid) {
                    actor = uid;
                    return { id, data };
                }
            }
        }),
        async () => ({ uid: 'uid-admin' })
    );

    const response = await handler(request('saveEnvironment', {
        id: 'sala-1',
        data: { nome: 'Sala de teste' }
    }));

    assert.equal(response.statusCode, 200);
    assert.equal(actor, 'uid-admin');
});
