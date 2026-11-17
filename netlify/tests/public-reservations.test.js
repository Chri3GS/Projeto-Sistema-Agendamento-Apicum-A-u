const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHandler } = require('../functions/public-reservations');

function request(overrides = {}) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'application/json',
            cookie: 'techagenda_admin=session'
        },
        body: '{}',
        ...overrides
    };
}

test('nega a lista completa a visitantes e contas sem sessão administrativa', async () => {
    let listCalled = false;
    const handler = createHandler(
        () => ({
            db: {},
            store: {
                async listReservations() {
                    listCalled = true;
                    return [];
                }
            }
        }),
        async () => null
    );

    assert.equal((await handler(request())).statusCode, 401);
    assert.equal(listCalled, false);
    assert.equal((await handler(request({
        headers: { ...request().headers, cookie: 'firebase_user=common-user' }
    }))).statusCode, 401);
    assert.equal(listCalled, false);
});

test('retorna a lista completa somente com uma sessão administrativa validada', async () => {
    const reservations = [{
        id: 'reservation-1',
        usuario: 'Ana Silva',
        usuarioEmail: 'ana@example.com',
        motivo: 'Reunião',
        ambiente: 'Biblioteca'
    }];
    const handler = createHandler(
        () => ({
            db: {},
            store: { async listReservations() { return reservations; } }
        }),
        async () => ({ uid: 'uid-admin' })
    );

    const response = await handler(request());

    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), reservations);
});
