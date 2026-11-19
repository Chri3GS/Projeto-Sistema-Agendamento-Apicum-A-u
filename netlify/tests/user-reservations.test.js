const assert = require('node:assert/strict');
const { test } = require('node:test');
const { StoreError } = require('../../functions/admin-store');
const { createHandler } = require('../functions/user-reservations');

function request(action, data = {}, overrides = {}) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'application/json',
            authorization: 'Bearer firebase-id-token',
            ...overrides.headers
        },
        body: JSON.stringify({ action, ...data }),
        ...overrides,
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'application/json',
            authorization: 'Bearer firebase-id-token',
            ...overrides.headers
        }
    };
}

test('encaminha token validado pelo store às operações da conta', async () => {
    const calls = [];
    const store = {
        async listUserReservations(token) {
            calls.push(['list', token]);
            return [{ id: 'reservation-1' }];
        },
        async updateUserReservation(id, data, token) {
            calls.push(['update', id, data, token]);
            return { ok: true };
        },
        async cancelUserReservation(id, token) {
            calls.push(['cancel', id, token]);
            return { ok: true };
        }
    };
    const handler = createHandler(() => ({ store }));

    assert.equal((await handler(request('list'))).statusCode, 200);
    assert.equal((await handler(request('update', {
        id: 'reservation-1',
        data: { dataReserva: '2026-11-25', horaInicio: '10:00', horaFim: '11:00' }
    }))).statusCode, 200);
    assert.equal((await handler(request('cancel', { id: 'reservation-1' }))).statusCode, 200);
    assert.deepEqual(calls, [
        ['list', 'firebase-id-token'],
        ['update', 'reservation-1', {
            dataReserva: '2026-11-25',
            horaInicio: '10:00',
            horaFim: '11:00'
        }, 'firebase-id-token'],
        ['cancel', 'reservation-1', 'firebase-id-token']
    ]);
});

test('rejeita origem, método, corpo e token inválidos antes de acessar o store', async () => {
    const handler = createHandler(() => {
        throw new Error('Runtime não deveria ser inicializado.');
    });

    assert.equal((await handler(request('list', {}, { httpMethod: 'GET' }))).statusCode, 405);
    assert.equal((await handler(request('list', {}, {
        headers: { origin: 'https://outro.example' }
    }))).statusCode, 403);
    assert.equal((await handler(request('list', {}, {
        headers: { 'content-type': 'text/plain' }
    }))).statusCode, 415);
    assert.equal((await handler(request('list', {}, {
        headers: { authorization: '' }
    }))).statusCode, 401);
});

test('devolve conflitos e token expirado com status apropriados', async () => {
    const conflictHandler = createHandler(() => ({
        store: {
            async updateUserReservation() {
                throw new StoreError(409, 'O horário não está disponível.');
            }
        }
    }));
    const conflict = await conflictHandler(request('update', { id: 'reservation-1', data: {} }));
    assert.equal(conflict.statusCode, 409);

    const authHandler = createHandler(() => ({
        store: {
            async listUserReservations() {
                throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
            }
        }
    }));
    assert.equal((await authHandler(request('list'))).statusCode, 401);
});
