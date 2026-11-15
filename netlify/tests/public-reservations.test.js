const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHandler } = require('../functions/public-reservations');

function request(overrides = {}) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'application/json'
        },
        body: '{}',
        ...overrides
    };
}

test('retorna reservas da coleção real com apenas os campos públicos permitidos', async () => {
    let collectionName;
    const handler = createHandler(() => ({
        db: {
            collection(name) {
                collectionName = name;
                return {
                    async get() {
                        return {
                            docs: [{
                                id: 'reservation-1',
                                data: () => ({
                                    usuario: 'Ana Silva',
                                    usuarioEmail: 'ana@example.com',
                                    usuarioUid: 'private-uid',
                                    token: 'private-token',
                                    ambiente: 'Biblioteca',
                                    dataReserva: '2026-11-20',
                                    horaInicio: '10:00',
                                    horaFim: '11:00',
                                    motivo: 'Estudo',
                                    status: 'ativa'
                                })
                            }]
                        };
                    }
                };
            }
        }
    }));

    const response = await handler(request());

    assert.equal(response.statusCode, 200);
    assert.equal(collectionName, 'reservas');
    assert.deepEqual(JSON.parse(response.body), [{
        id: 'reservation-1',
        usuario: 'Ana Silva',
        ambiente: 'Biblioteca',
        status: 'ativa',
        dataReserva: '2026-11-20',
        horaInicio: '10:00',
        horaFim: '11:00',
        motivo: 'Estudo'
    }]);
});

test('rejeita método, origem e conteúdo inválidos antes de consultar o Firestore', async () => {
    const handler = createHandler(() => {
        throw new Error('O Firestore não deveria ser consultado.');
    });

    assert.equal((await handler(request({ httpMethod: 'GET' }))).statusCode, 405);
    assert.equal((await handler(request({
        headers: { ...request().headers, origin: 'https://outro.example' }
    }))).statusCode, 403);
    assert.equal((await handler(request({
        headers: { ...request().headers, 'content-type': 'text/plain' }
    }))).statusCode, 415);
});

test('retorna erro explícito quando o Firestore não está disponível', async () => {
    const handler = createHandler(() => ({
        db: {
            collection() {
                return { get: async () => { throw new Error('Firestore indisponível'); } };
            }
        }
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
