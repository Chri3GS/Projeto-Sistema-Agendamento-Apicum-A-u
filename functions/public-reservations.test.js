const assert = require('node:assert/strict');
const { test } = require('node:test');
const { toPublicReservation } = require('./public-reservations');

test('publica somente os campos exibidos na lista, sem email ou UID', () => {
    const result = toPublicReservation('reservation-1', {
        usuario: 'Ana Silva',
        usuarioEmail: 'ana@example.com',
        usuarioUid: 'private-uid',
        ambiente: 'Biblioteca',
        dataReserva: '2026-11-20',
        motivo: 'Estudo',
        status: 'ativa'
    });

    assert.deepEqual(result, {
        id: 'reservation-1',
        usuario: 'Ana Silva',
        ambiente: 'Biblioteca',
        status: 'ativa',
        dataReserva: '2026-11-20',
        motivo: 'Estudo'
    });
    assert.equal(toPublicReservation('reservation-2', {
        usuario: 'ana@example.com',
        usuarioEmail: 'ana@example.com'
    }).usuario, 'Usuário');
});
