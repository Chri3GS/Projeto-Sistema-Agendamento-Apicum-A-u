const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAdminStore } = require('./admin-store');

test('consulta disponibilidade projetando somente campos de horário e ambiente', async () => {
    let selectedFields;
    let selectedEnvironmentFields;
    const db = {
        collection(name) {
            if (name === 'ambientes') {
                return {
                    select(...fields) {
                        selectedEnvironmentFields = fields;
                        return {
                            async get() {
                                return {
                                    docs: [
                                        { id: 'legacy-library', data: () => ({ nome: 'Biblioteca' }) },
                                        { id: 'custom-room', data: () => ({ nome: 'Espaço personalizado' }) }
                                    ]
                                };
                            }
                        };
                    }
                };
            }
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
    assert.deepEqual(selectedEnvironmentFields, ['nome']);
    assert.deepEqual(availability, {
        reservas: [{
            ambienteId: 'sala-01',
            ambiente: 'Sala 01',
            status: 'ativa',
            dataReserva: '2026-11-20',
            horaInicio: '10:00',
            horaFim: '11:00'
        }],
        limites: {
            biblioteca: 15,
            'laboratorio-de-informatica': 20,
            'sala-01': 1,
            'sala-02': 1,
            'sala-de-reuniao': 1,
            'legacy-library': 15,
            'custom-room': 1
        }
    });
});
