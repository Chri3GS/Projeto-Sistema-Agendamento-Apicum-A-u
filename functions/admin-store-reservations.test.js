const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAdminStore, StoreError } = require('./admin-store');
const { reservationLimitFor } = require('./reservation-limits');

function createFirestoreFixture(seedReservations = []) {
    const data = new Map([
        ['ambientes', new Map([
            ['biblioteca', {
                nome: 'Biblioteca',
                ativo: true,
                abertura: '08:00',
                fechamento: '18:00',
                diasDisponiveis: [0, 1, 2, 3, 4, 5, 6]
            }],
            ['laboratorio-de-informatica', {
                nome: 'Laboratório de Informática',
                ativo: true,
                abertura: '08:00',
                fechamento: '18:00',
                diasDisponiveis: [0, 1, 2, 3, 4, 5, 6]
            }],
            ['sala-01', {
                nome: 'Sala 01',
                ativo: true,
                abertura: '08:00',
                fechamento: '18:00',
                diasDisponiveis: [0, 1, 2, 3, 4, 5, 6]
            }]
        ])],
        ['reservas', new Map()],
        ['agendaLocks', new Map()],
        ['adminAuditoria', new Map()]
    ]);
    let revision = 0;
    let generatedId = 0;

    function snapshot(id, value) {
        return {
            id,
            exists: value !== undefined,
            data: () => value === undefined ? undefined : { ...value }
        };
    }

    function matches(value, filters) {
        return filters.every(({ field, operator, expected }) => {
            if (operator === '==') return value[field] === expected;
            if (operator === 'in') return expected.includes(value[field]);
            throw new Error(`Unsupported query operator: ${operator}`);
        });
    }

    class Query {
        constructor(collectionName, filters = [], fields = null) {
            this.collectionName = collectionName;
            this.filters = filters;
            this.fields = fields;
        }

        where(field, operator, expected) {
            return new Query(this.collectionName, [
                ...this.filters,
                { field, operator, expected }
            ], this.fields);
        }

        select(...fields) {
            return new Query(this.collectionName, this.filters, fields);
        }

        async get() {
            const collection = data.get(this.collectionName);
            const docs = [...collection.entries()]
                .filter(([, value]) => matches(value, this.filters))
                .map(([id, value]) => snapshot(id, project(value, this.fields)));
            return { docs };
        }
    }

    function project(value, fields) {
        if (!fields) return { ...value };
        return Object.fromEntries(fields
            .filter((field) => value[field] !== undefined)
            .map((field) => [field, value[field]]));
    }

    class DocumentReference {
        constructor(collectionName, id) {
            this.collectionName = collectionName;
            this.id = id;
        }

        async get() {
            return snapshot(this.id, data.get(this.collectionName).get(this.id));
        }
    }

    const db = {
        collection(name) {
            if (!data.has(name)) data.set(name, new Map());
            const collection = new Query(name);
            collection.doc = (id) => new DocumentReference(name, id || `generated-${++generatedId}`);
            return collection;
        },

        async runTransaction(callback) {
            for (let attempt = 0; attempt < 10; attempt += 1) {
                const initialRevision = revision;
                const writes = [];
                const transaction = {
                    async get(target) {
                        if (target instanceof DocumentReference) return target.get();
                        return target.get();
                    },
                    create(ref, value) {
                        writes.push({ type: 'create', ref, value });
                    },
                    set(ref, value) {
                        writes.push({ type: 'set', ref, value });
                    },
                    update(ref, value) {
                        writes.push({ type: 'update', ref, value });
                    },
                    delete(ref) {
                        writes.push({ type: 'delete', ref });
                    }
                };
                const result = await callback(transaction);
                if (revision !== initialRevision) continue;
                for (const write of writes) {
                    const collection = data.get(write.ref.collectionName);
                    if (write.type === 'create' && collection.has(write.ref.id)) {
                        throw new Error('Document already exists.');
                    }
                    if (write.type === 'delete') {
                        collection.delete(write.ref.id);
                    } else {
                        const value = write.type === 'update'
                            ? { ...collection.get(write.ref.id), ...write.value }
                            : write.value;
                        collection.set(write.ref.id, { ...value });
                    }
                }
                revision += 1;
                return result;
            }
            throw new Error('Transaction retry limit exceeded.');
        }
    };

    seedReservations.forEach((reservation, index) => {
        data.get('reservas').set(`seed-${index}`, { ...reservation });
    });

    const store = createAdminStore({
        db,
        auth: {
            async verifyIdToken(token) {
                return {
                    uid: token,
                    name: token,
                    firebase: {
                        sign_in_provider: token === 'not-google' ? 'password' : 'google.com'
                    }
                };
            }
        },
        FieldValue: { serverTimestamp: () => new Date() }
    });
    return { data, store };
}

function bookingDate(daysFromNow = 7) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function booking(uid, overrides = {}) {
    return {
        ambienteId: 'biblioteca',
        dataReserva: bookingDate(),
        horaInicio: '09:00',
        horaFim: '10:00',
        motivo: 'Estudo',
        ...overrides
    };
}

function existingReservation(uid, overrides = {}) {
    return {
        usuarioUid: uid,
        ambienteId: 'biblioteca',
        ambiente: 'Biblioteca',
        dataReserva: bookingDate(),
        horaInicio: '09:00',
        horaFim: '10:00',
        status: 'ativa',
        ...overrides
    };
}

test('resolve limites por nome legado e mantém limite padrão em IDs desconhecidos', () => {
    assert.equal(reservationLimitFor('legacy-library', 'Biblioteca'), 15);
    assert.equal(reservationLimitFor('legacy-lab', 'Laboratório de Informática'), 20);
    assert.equal(reservationLimitFor('custom-environment', 'Outro ambiente'), 1);
    assert.equal(reservationLimitFor('toString', 'Outro ambiente'), 1);
});

async function create(store, uid, input = booking(uid)) {
    return store.createReservation(input, uid);
}

test('permite reservas simultâneas até o limite central configurado', async () => {
    const { store, data } = createFirestoreFixture();

    for (let index = 0; index < 15; index += 1) {
        await create(store, `visitor-${index}`);
    }

    assert.equal(data.get('reservas').size, 15);
    await assert.rejects(create(store, 'visitor-15', {
        ...booking('visitor-15'),
        limite: 1000
    }), (error) => error instanceof StoreError && error.statusCode === 409);
    assert.equal(data.get('reservas').size, 15);
});

test('permite até 20 reservas simultâneas no Laboratório de Informática', async () => {
    const { store, data } = createFirestoreFixture();

    for (let index = 0; index < 20; index += 1) {
        await create(store, `lab-user-${index}`, booking(`lab-user-${index}`, {
            ambienteId: 'laboratorio-de-informatica'
        }));
    }

    await assert.rejects(create(store, 'lab-user-20', booking('lab-user-20', {
        ambienteId: 'laboratorio-de-informatica'
    })), (error) => error instanceof StoreError && error.statusCode === 409);
    assert.equal(data.get('reservas').size, 20);
});

test('conta sobreposições parciais ao verificar o limite', async () => {
    const initial = Array.from({ length: 14 }, (_, index) =>
        existingReservation(`existing-${index}`, { horaInicio: '09:30', horaFim: '10:30' })
    );
    const { store, data } = createFirestoreFixture(initial);

    await create(store, 'new-14', booking('new-14'));
    await assert.rejects(create(store, 'new-15', booking('new-15')), (error) =>
        error instanceof StoreError && error.statusCode === 409
    );
    assert.equal(data.get('reservas').size, 15);
});

test('bloqueia sobreposição parcial em sala de capacidade unitária', async () => {
    const { store } = createFirestoreFixture([
        existingReservation('other-user', {
            ambienteId: 'sala-01',
            ambiente: 'Sala 01',
            horaInicio: '09:30',
            horaFim: '10:30'
        })
    ]);

    await assert.rejects(create(store, 'new-user', booking('new-user', {
        ambienteId: 'sala-01',
        horaInicio: '10:00',
        horaFim: '11:00'
    })), (error) => error instanceof StoreError && error.statusCode === 409);
});

test('impede sobreposição do mesmo UID entre ambientes, mas permite horários consecutivos', async () => {
    const { store } = createFirestoreFixture();

    await create(store, 'same-user', booking('same-user', { horaInicio: '08:00', horaFim: '10:00' }));
    await assert.rejects(create(store, 'same-user', booking('same-user', {
        ambienteId: 'laboratorio-de-informatica',
        horaInicio: '09:00',
        horaFim: '11:00'
    })), (error) => error instanceof StoreError && error.statusCode === 409);

    await create(store, 'same-user', booking('same-user', {
        ambienteId: 'laboratorio-de-informatica',
        horaInicio: '10:00',
        horaFim: '11:00'
    }));
});

test('reservas canceladas não ocupam vagas', async () => {
    const { store, data } = createFirestoreFixture([
        existingReservation('cancelled-user', {
            ambienteId: 'sala-01',
            ambiente: 'Sala 01',
            status: 'cancelada'
        })
    ]);

    await create(store, 'new-user', booking('new-user', { ambienteId: 'sala-01' }));
    assert.equal(data.get('reservas').size, 2);
});

test('transações simultâneas não ultrapassam o limite', async () => {
    const existing = Array.from({ length: 14 }, (_, index) =>
        existingReservation(`existing-${index}`)
    );
    const { store, data } = createFirestoreFixture(existing);

    const results = await Promise.allSettled([
        create(store, 'parallel-a'),
        create(store, 'parallel-b')
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    const failure = results.find((result) => result.status === 'rejected');
    assert.ok(failure.reason instanceof StoreError);
    assert.equal(data.get('reservas').size, 15);
});

test('bloqueia horários no almoço e fora das janelas de funcionamento', async () => {
    const { store } = createFirestoreFixture();

    for (const [horaInicio, horaFim] of [
        ['11:00', '13:00'],
        ['12:00', '13:00'],
        ['18:00', '19:00']
    ]) {
        await assert.rejects(create(store, `lunch-${horaInicio}`, booking(`lunch-${horaInicio}`, {
            horaInicio,
            horaFim
        })), (error) => error instanceof StoreError && error.statusCode === 400);
    }
});

test('lista somente reservas do UID autenticado e não associa reservas legadas sem UID', async () => {
    const { store } = createFirestoreFixture([
        existingReservation('owner-a'),
        existingReservation('owner-b', { horaInicio: '10:00', horaFim: '11:00' }),
        { ambiente: 'Biblioteca', data: '25/11/2026 das 11:00 às 12:00', status: 'ativa' }
    ]);

    const ownReservations = await store.listUserReservations('owner-a');

    assert.equal(ownReservations.length, 1);
    assert.equal(ownReservations[0].motivo, '');
    assert.equal(ownReservations[0].id, 'seed-0');
    assert.equal(Object.hasOwn(ownReservations[0], 'usuarioUid'), false);
});

test('nega acesso a reserva de outro UID e exige provedor Google', async () => {
    const { store } = createFirestoreFixture([
        existingReservation('owner-b')
    ]);

    await assert.rejects(
        store.updateUserReservation('seed-0', {
            dataReserva: bookingDate(8),
            horaInicio: '10:00',
            horaFim: '11:00'
        }, 'owner-a'),
        (error) => error instanceof StoreError && error.statusCode === 404
    );
    await assert.rejects(
        store.listUserReservations('not-google'),
        (error) => error instanceof StoreError && error.statusCode === 403
    );
});

test('altera a reserva existente, registra dados anteriores e notifica o administrador', async () => {
    const { store, data } = createFirestoreFixture([
        existingReservation('owner-a', { usuario: 'Ana', motivo: 'Reunião' })
    ]);
    const newDate = bookingDate(8);

    await store.updateUserReservation('seed-0', {
        dataReserva: newDate,
        horaInicio: '14:00',
        horaFim: '15:00'
    }, 'owner-a');

    const reservation = data.get('reservas').get('seed-0');
    assert.equal(data.get('reservas').size, 1);
    assert.equal(reservation.dataReserva, newDate);
    assert.equal(reservation.horaInicio, '14:00');
    assert.equal(reservation.motivo, 'Reunião');
    const notifications = await store.listAdminNotifications();
    assert.equal(notifications.length, 1);
    assert.deepEqual(notifications[0].anterior, {
        date: bookingDate(),
        start: '09:00',
        end: '10:00'
    });
    assert.deepEqual(notifications[0].novo, {
        dataReserva: newDate,
        horaInicio: '14:00',
        horaFim: '15:00'
    });
    assert.equal(notifications[0].responsavel, 'Ana');
});

test('preserva a reserva quando há indisponibilidade, conflito do mesmo usuário ou almoço', async () => {
    const { store, data } = createFirestoreFixture([
        existingReservation('owner-a', {
            ambienteId: 'sala-01',
            ambiente: 'Sala 01'
        }),
        existingReservation('owner-b', {
            ambienteId: 'sala-01',
            ambiente: 'Sala 01',
            dataReserva: bookingDate(8),
            horaInicio: '10:00',
            horaFim: '11:00'
        }),
        existingReservation('owner-a', {
            ambienteId: 'biblioteca',
            dataReserva: bookingDate(8),
            horaInicio: '14:00',
            horaFim: '15:00'
        })
    ]);
    const original = { ...data.get('reservas').get('seed-0') };

    for (const change of [
        { dataReserva: bookingDate(8), horaInicio: '10:30', horaFim: '11:30' },
        { dataReserva: bookingDate(8), horaInicio: '14:30', horaFim: '15:30' },
        { dataReserva: bookingDate(9), horaInicio: '12:00', horaFim: '13:00' }
    ]) {
        await assert.rejects(
            store.updateUserReservation('seed-0', change, 'owner-a'),
            (error) => error instanceof StoreError && error.statusCode >= 400
        );
        assert.deepEqual(data.get('reservas').get('seed-0'), original);
    }
});

test('cancela sem excluir o documento, libera a vaga e cria notificação lida pelo administrador', async () => {
    const { store, data } = createFirestoreFixture([
        existingReservation('owner-a', {
            ambienteId: 'sala-01',
            ambiente: 'Sala 01',
            usuario: 'Ana'
        })
    ]);

    await store.cancelUserReservation('seed-0', 'owner-a');
    assert.equal(data.get('reservas').size, 1);
    assert.equal(data.get('reservas').get('seed-0').status, 'cancelada');
    await create(store, 'owner-b', booking('owner-b', {
        ambienteId: 'sala-01',
        horaInicio: '09:00',
        horaFim: '10:00'
    }));
    assert.equal(data.get('reservas').size, 2);

    const [notification] = await store.listAdminNotifications();
    assert.equal(notification.tipo, 'reserva_cancelada');
    assert.equal(notification.responsavel, 'Ana');
    assert.equal(notification.lida, false);
    await store.markAdminNotificationRead(notification.id);
    assert.equal((await store.listAdminNotifications())[0].lida, true);
});

test('impede cancelar reservas alheias, canceladas ou encerradas', async () => {
    const { store } = createFirestoreFixture([
        existingReservation('owner-a'),
        existingReservation('owner-b', { status: 'cancelada' }),
        existingReservation('owner-c', { dataReserva: bookingDate(-1) })
    ]);

    await assert.rejects(
        store.cancelUserReservation('seed-0', 'owner-b'),
        (error) => error instanceof StoreError && error.statusCode === 404
    );
    await assert.rejects(
        store.cancelUserReservation('seed-1', 'owner-b'),
        (error) => error instanceof StoreError && error.statusCode === 409
    );
    await assert.rejects(
        store.cancelUserReservation('seed-2', 'owner-c'),
        (error) => error instanceof StoreError && error.statusCode === 409
    );
});

test('transações simultâneas de alteração não excedem a capacidade do ambiente', async () => {
    const { store } = createFirestoreFixture([
        existingReservation('owner-a', {
            ambienteId: 'sala-01',
            ambiente: 'Sala 01',
            horaInicio: '08:00',
            horaFim: '09:00'
        }),
        existingReservation('owner-b', {
            ambienteId: 'sala-01',
            ambiente: 'Sala 01',
            horaInicio: '10:00',
            horaFim: '11:00'
        })
    ]);
    const target = {
        dataReserva: bookingDate(8),
        horaInicio: '14:00',
        horaFim: '15:00'
    };

    const results = await Promise.allSettled([
        store.updateUserReservation('seed-0', target, 'owner-a'),
        store.updateUserReservation('seed-1', target, 'owner-b')
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});
