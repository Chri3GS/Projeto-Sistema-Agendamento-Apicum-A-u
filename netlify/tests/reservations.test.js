const assert = require('node:assert/strict');
const { test } = require('node:test');
const { StoreError } = require('../../functions/admin-store');
const { createHandler } = require('../functions/reservations');

function request(overrides = {}) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'application/json',
            authorization: 'Bearer firebase-id-token'
        },
        body: JSON.stringify({
            ambienteId: 'biblioteca',
            dataReserva: '2026-11-20',
            horaInicio: '10:00',
            horaFim: '11:00',
            motivo: 'Estudo'
        }),
        ...overrides
    };
}

test('cria reserva com token Firebase validado pelo store e retorna o identificador', async () => {
    let receivedInput;
    let receivedToken;
    const handler = createHandler(() => ({
        store: {
            async createReservation(input, token) {
                receivedInput = input;
                receivedToken = token;
                return { id: 'reservation-1' };
            }
        }
    }));

    const response = await handler(request());

    assert.equal(response.statusCode, 201);
    assert.deepEqual(JSON.parse(response.body), { id: 'reservation-1' });
    assert.deepEqual(receivedInput, JSON.parse(request().body));
    assert.equal(receivedToken, 'firebase-id-token');
});

test('rejeita requisições sem token, de outra origem ou sem JSON', async () => {
    const handler = createHandler(() => {
        throw new Error('Runtime não deveria ser inicializado.');
    });

    assert.equal((await handler(request({
        headers: { ...request().headers, authorization: '' }
    }))).statusCode, 401);
    assert.equal((await handler(request({
        headers: { ...request().headers, origin: 'https://outro.example' }
    }))).statusCode, 403);
    assert.equal((await handler(request({
        headers: { ...request().headers, 'content-type': 'text/plain' }
    }))).statusCode, 415);
});

test('expõe conflito e token expirado com status e mensagens apropriados', async () => {
    const conflictHandler = createHandler(() => ({
        store: { async createReservation() { throw new StoreError(409, 'Este horário acabou de ser reservado.'); } }
    }));
    const conflict = await conflictHandler(request());
    assert.equal(conflict.statusCode, 409);
    assert.match(JSON.parse(conflict.body).error, /horário acabou de ser reservado/);

    const authHandler = createHandler(() => ({
        store: { async createReservation() { throw Object.assign(new Error('expired'), { code: 'auth/id-token-expired' }); } }
    }));
    const unauthorized = await authHandler(request());
    assert.equal(unauthorized.statusCode, 401);
    assert.match(JSON.parse(unauthorized.body).error, /Sessão Google inválida ou expirada/);
});

test('retorna mensagem clara quando o serviço de reservas falha', async () => {
    const handler = createHandler(() => ({
        store: { async createReservation() { throw Object.assign(new Error('Firestore indisponível'), { code: 7 }); } }
    }));
    const previousError = console.error;
    console.error = () => {};
    try {
        const response = await handler(request());
        assert.equal(response.statusCode, 503);
        assert.match(JSON.parse(response.body).error, /temporariamente indisponível/);
    } finally {
        console.error = previousError;
    }
});
