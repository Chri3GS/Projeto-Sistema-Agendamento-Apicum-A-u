const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    INITIAL_ENVIRONMENTS,
    reservationStatus,
    StoreError,
    createAdminStore,
    validateEnvironment
} = require('./admin-store');

const validEnvironment = {
    nome: 'Sala de teste',
    descricao: 'Espaço para atividades.',
    capacidade: 12,
    imagem: 'imagens/sala01.jpeg',
    informacoes: ['Climatizada'],
    recursos: ['Projetor'],
    abertura: '08:00',
    fechamento: '18:00',
    diasDisponiveis: [1, 2, 3, 4, 5],
    ativo: true
};

test('preserva como sementes os cinco ambientes existentes, sem dados inventados', () => {
    assert.deepEqual(INITIAL_ENVIRONMENTS.map(({ nome }) => nome), [
        'Biblioteca',
        'Sala 01',
        'Sala 02',
        'Sala de Reunião',
        'Laboratório de Informática'
    ]);
    assert.ok(INITIAL_ENVIRONMENTS.every((environment) =>
        environment.id && environment.imagem.startsWith('imagens/') && environment.ativo
    ));
});

test('não duplica ambientes existentes com identificador legado ao inicializar o catálogo', async () => {
    const records = new Map([['legacy-sala-01', {
        nome: 'Sala 01',
        capacidade: 30,
        ativo: true
    }]]);
    const environments = {
        doc(id) {
            return { collection: 'ambientes', id };
        },
        async get() {
            return {
                docs: [...records].map(([id, data]) => ({
                    id,
                    data: () => data
                }))
            };
        }
    };
    const db = {
        collection(name) {
            return name === 'ambientes'
                ? environments
                : { doc: (id) => ({ collection: name, id }) };
        },
        runTransaction(operation) {
            return operation({
                async get(target) {
                    if (target === environments) return environments.get();
                    const data = records.get(target.id);
                    return { exists: Boolean(data), data: () => data };
                },
                create(reference, data) {
                    records.set(reference.id, data);
                }
            });
        }
    };
    const store = createAdminStore({
        db,
        auth: {},
        FieldValue: { serverTimestamp: () => 'timestamp' }
    });

    const result = await store.listEnvironments(true);

    assert.equal(result.length, 5);
    assert.equal(records.has('sala-01'), false);
    assert.equal(result.find(({ id }) => id === 'legacy-sala-01').capacidade, 30);
});

test('valida campos, horários, capacidade e origem de imagem dos ambientes', () => {
    assert.equal(validateEnvironment(validEnvironment).capacidade, 12);
    assert.throws(() => validateEnvironment({ ...validEnvironment, capacidade: 0 }), StoreError);
    assert.throws(() => validateEnvironment({ ...validEnvironment, imagem: 'javascript:alert(1)' }), StoreError);
    assert.throws(() => validateEnvironment({ ...validEnvironment, fechamento: '07:00' }), StoreError);
    assert.throws(() => validateEnvironment({ ...validEnvironment, diasDisponiveis: [8] }), StoreError);
});

test('calcula situação de reserva e reconhece cancelamentos', () => {
    const now = Date.UTC(2026, 10, 2, 15, 0);
    assert.equal(reservationStatus({ status: 'cancelada' }, now), 'cancelada');
    assert.equal(reservationStatus({
        dataReserva: '2026-11-02',
        horaInicio: '10:00',
        horaFim: '11:00'
    }, now), 'concluida');
    assert.equal(reservationStatus({
        dataReserva: '2026-11-03',
        horaInicio: '10:00',
        horaFim: '11:00'
    }, now), 'ativa');
});
