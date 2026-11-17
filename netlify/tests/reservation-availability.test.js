const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHandler } = require('../functions/reservation-availability');

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

test('disponibiliza somente dados mínimos de horários, sem identificadores pessoais', async () => {
    let data;
    const handler = createHandler(() => ({
        store: {
            async listReservationAvailability() {
                return [{
                    ambienteId: 'sala-01',
                    ambiente: 'Sala 01',
                    status: 'ativa',
                    dataReserva: '2026-11-20',
                    horaInicio: '10:00',
                    horaFim: '11:00'
                }];
            }
        }
    }));

    const response = await handler(request());
    data = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(data, [{
        ambienteId: 'sala-01',
        ambiente: 'Sala 01',
        status: 'ativa',
        dataReserva: '2026-11-20',
        horaInicio: '10:00',
        horaFim: '11:00'
    }]);
    assert.doesNotMatch(response.body, /usuario|email|uid|motivo|responsável/i);
});

test('valida método, origem e formato antes de consultar reservas', async () => {
    const handler = createHandler(() => {
        throw new Error('O store não deveria ser consultado.');
    });

    assert.equal((await handler(request({ httpMethod: 'GET' }))).statusCode, 405);
    assert.equal((await handler(request({
        headers: { ...request().headers, origin: 'https://attacker.example' }
    }))).statusCode, 403);
    assert.equal((await handler(request({
        headers: { ...request().headers, 'content-type': 'text/plain' }
    }))).statusCode, 415);
});
