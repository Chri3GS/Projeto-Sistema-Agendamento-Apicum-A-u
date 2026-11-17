const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAdminStore } = require('./admin-store');

test('consulta disponibilidade projetando somente campos de horário e ambiente', async () => {
    let selectedFields;
    const db = {
        collection(name) {
            if (name !== 'reservas') return {};
            return {
                select(...fields) {
                    selectedFields = fields;
                    return {
                        async get() {
                            return {
                                docs: [{
                                    data: () => ({
                                        ambienteId: 'sala-01',
                                        ambiente: 'Sala 01',
                                        status: 'ativa',
                                        dataReserva: '2026-11-20',
                                        horaInicio: '10:00',
                                        horaFim: '11:00',
                                        usuario: 'Ana Silva',
                                        usuarioEmail: 'ana@example.com',
                                        usuarioUid: 'private-uid',
                                        motivo: 'Reunião'
                                    })
                                }]
                            };
                        }
                    };
                }
            };
        }
    };
    const store = createAdminStore({ db });
    const availability = await store.listReservationAvailability();

    assert.deepEqual(selectedFields, [
        'ambienteId', 'ambiente', 'status', 'situacao', 'canceladoEm',
        'dataReserva', 'horaInicio', 'horaFim', 'dataInicio', 'dataFim', 'data'
    ]);
    assert.deepEqual(availability, [{
        ambienteId: 'sala-01',
        ambiente: 'Sala 01',
        status: 'ativa',
        dataReserva: '2026-11-20',
        horaInicio: '10:00',
        horaFim: '11:00'
    }]);
});
