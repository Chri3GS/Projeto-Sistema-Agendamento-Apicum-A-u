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

test('retorna a lista completa somente após validar a sessão administrativa', async () => {
    let listCalled = false;
    const handler = createHandler(
        () => ({
            db: {},
            store: {
                async listReservations() {
                    listCalled = true;
                    return [{ id: 'reservation-1', usuario: 'Ana', usuarioEmail: 'ana@example.com' }];
                }
            }
        }),
        async () => ({ uid: 'uid-admin' })
    );

    const deniedHandler = createHandler(
        () => ({
            db: {},
            store: { async listReservations() { listCalled = true; } }
        }),
        async () => null
    );
    const denied = await deniedHandler(request('listReservations'));
    assert.equal(denied.statusCode, 401);
    assert.equal(listCalled, false);

    const response = await handler(request('listReservations'));
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), [
        { id: 'reservation-1', usuario: 'Ana', usuarioEmail: 'ana@example.com' }
    ]);
});

test('somente a sessão administrativa pode ler notificações e marcá-las como lidas', async () => {
    const calls = [];
    const handler = createHandler(
        () => ({
            db: {},
            store: {
                async listAdminNotifications() {
                    calls.push('list');
                    return [{ id: 'notification-1', lida: false }];
                },
                async markAdminNotificationRead(id) {
                    calls.push(`read:${id}`);
                }
            }
        }),
        async () => ({ uid: 'uid-admin' })
    );
    const deniedHandler = createHandler(
        () => ({
            db: {},
            store: {
                async listAdminNotifications() {
                    throw new Error('Não deve executar sem sessão administrativa.');
                }
            }
        }),
        async () => null
    );

    assert.equal((await deniedHandler(request('listAdminNotifications'))).statusCode, 401);
    const listResponse = await handler(request('listAdminNotifications'));
    assert.deepEqual(JSON.parse(listResponse.body), [{ id: 'notification-1', lida: false }]);
    assert.equal((await handler(request('markAdminNotificationRead', {
        id: 'notification-1'
    }))).statusCode, 200);
    assert.deepEqual(calls, ['list', 'read:notification-1']);
});
