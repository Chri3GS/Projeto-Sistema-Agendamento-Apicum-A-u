const INITIAL_ENVIRONMENTS = [
    {
        id: 'biblioteca',
        nome: 'Biblioteca',
        descricao: 'Sala climatizada, iluminação ambiente e capacidade para 15 pessoas.',
        capacidade: 15,
        imagem: 'imagens/biblioteca.jpeg',
        informacoes: ['Sala climatizada', 'Iluminação ambiente', 'Capacidade: 15 pessoas'],
        recursos: ['Internet banda larga', 'Mesas redondas grandes', 'Cadeiras confortáveis', 'Acervo de livros', 'Suporte humano']
    },
    {
        id: 'sala-01',
        nome: 'Sala 01',
        descricao: 'Sala climatizada, iluminação ambiente e capacidade para 30 pessoas.',
        capacidade: 30,
        imagem: 'imagens/sala01.jpeg',
        informacoes: ['Sala climatizada', 'Iluminação ambiente', 'Capacidade: 30 pessoas'],
        recursos: ['Internet banda larga', 'Mesa para docente', 'Cadeiras', 'Data Show', 'Tela de projeção', 'Quadro branco', 'Caixa de som']
    },
    {
        id: 'sala-02',
        nome: 'Sala 02',
        descricao: 'Sala climatizada, iluminação ambiente e capacidade para 30 pessoas.',
        capacidade: 30,
        imagem: 'imagens/sala02.jpeg',
        informacoes: ['Sala climatizada', 'Iluminação ambiente', 'Capacidade: 30 pessoas'],
        recursos: ['Internet banda larga', 'Mesa para docente', 'Cadeiras', 'Data Show', 'Tela de projeção', 'Quadro branco', 'Caixa de som']
    },
    {
        id: 'sala-de-reuniao',
        nome: 'Sala de Reunião',
        descricao: 'Sala climatizada, iluminação ambiente e capacidade para 10 pessoas.',
        capacidade: 10,
        imagem: 'imagens/salareuniao.jpeg',
        informacoes: ['Sala climatizada', 'Iluminação ambiente', 'Capacidade: 10 pessoas'],
        recursos: ['Internet banda larga', 'Mesas grande', 'Cadeiras confortáveis', 'Data Show', 'Tela de projeção', 'Caixa de som']
    },
    {
        id: 'laboratorio-de-informatica',
        nome: 'Laboratório de Informática',
        descricao: 'Sala climatizada, iluminação ambiente e capacidade para 20 pessoas.',
        capacidade: 20,
        imagem: 'imagens/salainformatica.jpeg',
        informacoes: ['Sala climatizada', 'Iluminação ambiente', 'Capacidade: 20 pessoas'],
        recursos: ['Internet banda larga', 'Computadores', 'Mesas', 'Cadeiras', 'Equipamentos multimídia']
    }
].map((environment) => ({
    ...environment,
    nomeNormalizado: environment.nome.toLocaleLowerCase('pt-BR'),
    abertura: '08:00',
    fechamento: '18:00',
    diasDisponiveis: [0, 1, 2, 3, 4, 5, 6],
    ativo: true
}));

class StoreError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

function documentId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
        throw new StoreError(400, 'Identificador inválido.');
    }
    return value;
}

function requiredText(value, label, maxLength) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
        throw new StoreError(400, `${label} é obrigatório e deve ter até ${maxLength} caracteres.`);
    }
    return value.trim();
}

function validateEnvironment(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new StoreError(400, 'Dados do ambiente inválidos.');
    }
    const nome = requiredText(input.nome, 'Nome', 100);
    const descricao = requiredText(input.descricao, 'Descrição', 500);
    const capacidade = Number(input.capacidade);
    if (!Number.isInteger(capacidade) || capacidade < 1 || capacidade > 10000) {
        throw new StoreError(400, 'Capacidade deve ser um número inteiro entre 1 e 10000.');
    }
    const imagem = requiredText(input.imagem, 'Imagem', 1000);
    if (!/^imagens\/[A-Za-z0-9._ -]+$/.test(imagem) &&
        !(imagem.startsWith('https://') && !/[\s"'<>]/.test(imagem))) {
        throw new StoreError(400, 'A imagem deve ser um caminho em imagens/ ou uma URL HTTPS.');
    }
    const abertura = input.abertura;
    const fechamento = input.fechamento;
    if (!validTime(abertura) || !validTime(fechamento) || abertura >= fechamento) {
        throw new StoreError(400, 'Informe horários válidos, com fechamento posterior à abertura.');
    }
    if (!Array.isArray(input.diasDisponiveis) ||
        input.diasDisponiveis.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw new StoreError(400, 'Selecione dias de funcionamento válidos.');
    }
    const list = (value, label) => {
        if (!Array.isArray(value) || value.length > 30 ||
            value.some((entry) => typeof entry !== 'string' || !entry.trim() || entry.length > 160)) {
            throw new StoreError(400, `${label} deve conter até 30 itens de no máximo 160 caracteres.`);
        }
        return value.map((entry) => entry.trim());
    };
    if (typeof input.ativo !== 'boolean') {
        throw new StoreError(400, 'A disponibilidade do ambiente é inválida.');
    }
    return {
        nome,
        descricao,
        capacidade,
        imagem,
        informacoes: list(input.informacoes, 'Informações'),
        recursos: list(input.recursos, 'Recursos'),
        abertura,
        fechamento,
        diasDisponiveis: [...new Set(input.diasDisponiveis)].sort(),
        ativo: input.ativo
    };
}

function validTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function intervalForReservation(reservation) {
    let start = reservation.dataInicio;
    let end = reservation.dataFim;
    if (start && end) {
        const startMatch = String(start).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        const endMatch = String(end).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        if (startMatch && endMatch) {
            return { date: startMatch[1], start: startMatch[2], end: endMatch[2] };
        }
    }
    if (reservation.dataReserva && validTime(reservation.horaInicio) && validTime(reservation.horaFim)) {
        return {
            date: reservation.dataReserva,
            start: reservation.horaInicio,
            end: reservation.horaFim
        };
    }
    const match = String(reservation.data || '').match(
        /(\d{2})\/(\d{2})\/(\d{4})\s+das\s+(\d{2}:\d{2})\s+às\s+(\d{2}:\d{2})/
    );
    if (!match) return null;
    return {
        date: `${match[3]}-${match[2]}-${match[1]}`,
        start: match[4],
        end: match[5]
    };
}

function reservationStatus(reservation, now = Date.now()) {
    if (reservation.status === 'cancelada') return 'cancelada';
    const interval = intervalForReservation(reservation);
    if (!interval) return 'ativa';
    const end = institutionalTime(interval.date, interval.end);
    return Number.isFinite(end) && end <= now ? 'concluida' : 'ativa';
}

function institutionalTime(date, time) {
    const offsetMinutes = Number(process.env.TECHAGENDA_TIMEZONE_OFFSET_MINUTES ?? 180);
    const safeOffset = Number.isInteger(offsetMinutes) && Math.abs(offsetMinutes) <= 840
        ? offsetMinutes
        : 180;
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return Date.UTC(year, month - 1, day, hours, minutes) + safeOffset * 60 * 1000;
}

function serialize(value) {
    if (value && typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
    }
    return value;
}

async function queryReservationsByNames(transaction, reservations, names) {
    const queries = [];
    for (let index = 0; index < names.length; index += 30) {
        queries.push(transaction.get(
            reservations.where('ambiente', 'in', names.slice(index, index + 30))
        ));
    }
    const snapshots = await Promise.all(queries);
    return snapshots.flatMap((snapshot) => snapshot.docs);
}

function createAdminStore({ db, auth, FieldValue }) {
    const environments = db.collection('ambientes');
    const reservations = db.collection('reservas');
    const auditLogs = db.collection('adminAuditoria');
    let seedPromise;

    async function seedExistingEnvironments() {
        if (!seedPromise) {
            seedPromise = Promise.all(INITIAL_ENVIRONMENTS.map(async (environment) => {
                const ref = environments.doc(environment.id);
                await db.runTransaction(async (transaction) => {
                    const snapshot = await transaction.get(ref);
                    if (snapshot.exists) return;
                    const existingEnvironments = await transaction.get(environments);
                    const normalizedName = environment.nome.toLocaleLowerCase('pt-BR');
                    const alreadyRegistered = existingEnvironments.docs.some((doc) => {
                        const existing = doc.data();
                        const existingName = existing.nomeNormalizado ||
                            (typeof existing.nome === 'string'
                                ? existing.nome.toLocaleLowerCase('pt-BR')
                                : '');
                        return existingName === normalizedName;
                    });
                    if (alreadyRegistered) return;
                    transaction.create(ref, {
                        ...environment,
                        criadoEm: FieldValue.serverTimestamp(),
                        atualizadoEm: FieldValue.serverTimestamp(),
                        atualizadoPor: 'migração inicial'
                    });
                });
            })).catch((error) => {
                seedPromise = null;
                throw error;
            });
        }
        return seedPromise;
    }

    async function listEnvironments(includeInactive = false) {
        await seedExistingEnvironments();
        const snapshot = await environments.get();
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...serialize(doc.data()) }));
        return items
            .filter((item) => includeInactive || item.ativo !== false)
            .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));
    }

    async function listPublicEnvironments() {
        const items = await listEnvironments(false);
        const publicFields = [
            'id', 'nome', 'descricao', 'capacidade', 'imagem', 'informacoes',
            'recursos', 'abertura', 'fechamento', 'diasDisponiveis', 'ativo',
            'nomesAnteriores'
        ];
        return items.map((item) => Object.fromEntries(
            publicFields.filter((field) => item[field] !== undefined).map((field) => [field, item[field]])
        ));
    }

    async function getDashboard() {
        const [environmentItems, reservationSnapshot] = await Promise.all([
            listEnvironments(true),
            reservations.get()
        ]);
        const reservationItems = reservationSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...serialize(doc.data())
        }));
        const now = Date.now();
        const reservationsWithStatus = reservationItems.map((item) => ({
            ...item,
            situacao: reservationStatus(item, now)
        }));
        return {
            ambientes: environmentItems,
            reservas: reservationsWithStatus,
            resumo: {
                ambientes: environmentItems.length,
                reservas: reservationsWithStatus.length,
                ativas: reservationsWithStatus.filter((item) => item.situacao === 'ativa').length
            }
        };
    }

    function auditEntry(actor, action, entity, entityId, details) {
        return {
            ator: actor,
            acao: action,
            entidade: entity,
            entidadeId: entityId,
            detalhes: serialize(details),
            criadoEm: FieldValue.serverTimestamp()
        };
    }

    async function saveEnvironment(input, id, actor) {
        const data = validateEnvironment(input);
        const ref = id ? environments.doc(documentId(id)) : environments.doc();
        const now = FieldValue.serverTimestamp();
        const auditRef = auditLogs.doc();
        await db.runTransaction(async (transaction) => {
            const existing = id ? await transaction.get(ref) : null;
            if (id && !existing.exists) throw new StoreError(404, 'Ambiente não encontrado.');
            const currentData = existing ? existing.data() : null;
            const [duplicates, legacyDuplicates] = await Promise.all([
                transaction.get(environments.where('nomeNormalizado', '==', data.nome.toLocaleLowerCase('pt-BR'))),
                transaction.get(environments.where('nome', '==', data.nome))
            ]);
            const matchingIds = new Set([...duplicates.docs, ...legacyDuplicates.docs].map((doc) => doc.id));
            if ([...matchingIds].some((duplicateId) => duplicateId !== ref.id)) {
                throw new StoreError(409, 'Já existe um ambiente com esse nome.');
            }
            const saved = {
                ...data,
                nomesAnteriores: [...new Set([
                    ...(currentData?.nomesAnteriores || []),
                    ...(currentData && currentData.nome !== data.nome ? [currentData.nome] : [])
                ])],
                nomeNormalizado: data.nome.toLocaleLowerCase('pt-BR'),
                atualizadoEm: now,
                atualizadoPor: actor
            };
            if (!id) saved.criadoEm = now;
            transaction.set(ref, saved, { merge: true });
            transaction.create(auditRef, auditEntry(actor, id ? 'ambiente_atualizado' : 'ambiente_criado', 'ambiente', ref.id, {
                anterior: currentData,
                novo: data
            }));
        });
        return { id: ref.id, ...data };
    }

    async function deleteEnvironment(id, actor) {
        const ref = environments.doc(documentId(id));
        const auditRef = auditLogs.doc();
        const reservationsById = reservations.where('ambienteId', '==', id);
        await db.runTransaction(async (transaction) => {
            const [environmentSnapshot, idMatches] = await Promise.all([
                transaction.get(ref),
                transaction.get(reservationsById)
            ]);
            if (!environmentSnapshot.exists) throw new StoreError(404, 'Ambiente não encontrado.');
            const references = new Map();
            idMatches.docs.forEach((doc) => references.set(doc.id, doc.data()));
            const names = [...new Set([
                environmentSnapshot.data().nome,
                ...(environmentSnapshot.data().nomesAnteriores || [])
            ])];
            const nameMatches = await queryReservationsByNames(transaction, reservations, names);
            nameMatches.forEach((doc) => references.set(doc.id, doc.data()));
            const hasActiveReservations = [...references.values()].some((reservation) =>
                reservationStatus(reservation) === 'ativa'
            );
            if (hasActiveReservations) {
                throw new StoreError(409, 'Não é possível excluir um ambiente com reservas ativas. Desative-o ou cancele as reservas primeiro.');
            }
            transaction.delete(ref);
            transaction.create(auditRef, auditEntry(actor, 'ambiente_excluido', 'ambiente', id, environmentSnapshot.data()));
        });
    }

    async function cancelReservation(id, actor) {
        const ref = reservations.doc(documentId(id));
        const auditRef = auditLogs.doc();
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) throw new StoreError(404, 'Reserva não encontrada.');
            const reservation = snapshot.data();
            if (reservation.status === 'cancelada') return;
            transaction.update(ref, {
                status: 'cancelada',
                canceladoEm: FieldValue.serverTimestamp()
            });
            transaction.create(auditRef, auditEntry(actor, 'reserva_cancelada', 'reserva', id, reservation));
        });
    }

    async function deleteReservation(id, actor) {
        const ref = reservations.doc(documentId(id));
        const auditRef = auditLogs.doc();
        await db.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) throw new StoreError(404, 'Reserva não encontrada.');
            transaction.delete(ref);
            transaction.create(auditRef, auditEntry(actor, 'reserva_excluida', 'reserva', id, snapshot.data()));
        });
    }

    async function createReservation(input, idToken) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw new StoreError(400, 'Dados da reserva inválidos.');
        }
        const decoded = await auth.verifyIdToken(idToken);
        const ambienteId = documentId(input.ambienteId);
        const dataReserva = input.dataReserva;
        const horaInicio = input.horaInicio;
        const horaFim = input.horaFim;
        const validDate = typeof dataReserva === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataReserva) &&
            Number.isFinite(new Date(`${dataReserva}T00:00:00Z`).getTime()) &&
            new Date(`${dataReserva}T00:00:00Z`).toISOString().slice(0, 10) === dataReserva;
        if (!validDate ||
            !validTime(horaInicio) || !validTime(horaFim) || horaInicio >= horaFim) {
            throw new StoreError(400, 'Data e horário da reserva inválidos.');
        }
        const motivo = typeof input.motivo === 'string' ? input.motivo.trim().slice(0, 1000) : '';
        const environmentRef = environments.doc(ambienteId);
        const environmentSnapshot = await environmentRef.get();
        if (!environmentSnapshot.exists) throw new StoreError(404, 'Ambiente não encontrado.');
        const environment = environmentSnapshot.data();
        if (!environment.ativo) throw new StoreError(409, 'Este ambiente está temporariamente indisponível.');
        const day = new Date(`${dataReserva}T00:00:00Z`).getUTCDay();
        if (!Array.isArray(environment.diasDisponiveis) || !environment.diasDisponiveis.includes(day) ||
            horaInicio < environment.abertura || horaFim > environment.fechamento) {
            throw new StoreError(400, 'O horário está fora da disponibilidade do ambiente.');
        }
        const now = new Date();
        const start = institutionalTime(dataReserva, horaInicio);
        if (start <= now.getTime() || start > now.getTime() + 60 * 24 * 60 * 60 * 1000) {
            throw new StoreError(400, 'Escolha um horário futuro dentro dos próximos 60 dias.');
        }

        const lockRef = db.collection('agendaLocks').doc(`${ambienteId}_${dataReserva.replace(/-/g, '')}`);
        const byId = reservations.where('ambienteId', '==', ambienteId);
        const reservationRef = reservations.doc();
        await db.runTransaction(async (transaction) => {
            const environmentCurrent = await transaction.get(environmentRef);
            if (!environmentCurrent.exists || !environmentCurrent.data().ativo) {
                throw new StoreError(409, 'Este ambiente está temporariamente indisponível.');
            }
            const currentEnvironment = environmentCurrent.data();
            if (!Array.isArray(currentEnvironment.diasDisponiveis) ||
                !currentEnvironment.diasDisponiveis.includes(day) ||
                horaInicio < currentEnvironment.abertura || horaFim > currentEnvironment.fechamento) {
                throw new StoreError(409, 'A disponibilidade deste ambiente foi alterada. Atualize a página e tente novamente.');
            }
            const environmentNames = [...new Set([
                currentEnvironment.nome,
                ...(currentEnvironment.nomesAnteriores || [])
            ])];
            const [lock, idMatches] = await Promise.all([
                transaction.get(lockRef),
                transaction.get(byId)
            ]);
            const nameMatches = await queryReservationsByNames(transaction, reservations, environmentNames);
            const existing = new Map();
            [...nameMatches, ...idMatches.docs].forEach((doc) => existing.set(doc.id, doc.data()));
            const startMinutes = timeToMinutes(horaInicio);
            const endMinutes = timeToMinutes(horaFim);
            const conflict = [...existing.values()].some((reservation) => {
                if (reservationStatus(reservation) !== 'ativa') return false;
                const interval = intervalForReservation(reservation);
                return interval && interval.date === dataReserva &&
                    startMinutes < timeToMinutes(interval.end) &&
                    endMinutes > timeToMinutes(interval.start);
            });
            if (conflict) throw new StoreError(409, 'Este horário acabou de ser reservado. Escolha outro horário.');
            transaction.set(lockRef, {
                ambienteId,
                dataReserva,
                atualizadoEm: FieldValue.serverTimestamp(),
                revisao: (lock.exists ? Number(lock.data().revisao) || 0 : 0) + 1
            });
            const inicio = `${dataReserva}T${horaInicio}:00`;
            const fim = `${dataReserva}T${horaFim}:00`;
            transaction.create(reservationRef, {
                usuario: decoded.name || decoded.email || 'Usuário',
                usuarioEmail: decoded.email || '',
                usuarioUid: decoded.uid,
                ambienteId,
                ambiente: currentEnvironment.nome,
                motivo: motivo || 'Agendamento de ambiente',
                data: `${formatDate(dataReserva)} das ${horaInicio} às ${horaFim}`,
                dataInicio: inicio,
                dataFim: fim,
                dataReserva,
                horaInicio,
                horaFim,
                dataOrdenacao: new Date(start),
                criadoEm: FieldValue.serverTimestamp(),
                status: 'ativa'
            });
        });
        return { id: reservationRef.id };
    }

    return {
        cancelReservation,
        createReservation,
        deleteEnvironment,
        deleteReservation,
        getDashboard,
        listPublicEnvironments,
        listEnvironments,
        saveEnvironment
    };
}

function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatDate(value) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
}

module.exports = {
    createAdminStore,
    INITIAL_ENVIRONMENTS,
    reservationStatus,
    StoreError,
    validateEnvironment
};
