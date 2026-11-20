const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { createAdminServer } = require('./server');

const adminToken = {
    uid: 'uid-admin',
    email: 'centrotec.apc@gmail.com',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' }
};

function createAuth() {
    return {
        async verifyIdToken(token, checkRevoked) {
            assert.equal(checkRevoked, true);
            if (token === 'google-admin') return adminToken;
            if (token === 'google-user') {
                return {
                    uid: 'uid-user',
                    email: 'user@example.com',
                    email_verified: true,
                    firebase: { sign_in_provider: 'google.com' }
                };
            }
            throw Object.assign(new Error('invalid token'), { code: 'auth/invalid-id-token' });
        }
    };
}

async function withServer(server, operation) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
        await operation(baseUrl);
    } finally {
        await new Promise((resolve, reject) => server.close((error) =>
            error ? reject(error) : resolve()
        ));
    }
}

async function establishAdminSession(baseUrl, idToken = 'google-admin', cookie) {
    const response = await fetch(`${baseUrl}/api/admin/session`, {
        method: 'POST',
        headers: {
            Origin: baseUrl,
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: JSON.stringify({ idToken })
    });
    return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

async function validateAdminSession(baseUrl, idToken, cookie) {
    return fetch(`${baseUrl}/api/admin/session`, {
        method: 'POST',
        headers: {
            Origin: baseUrl,
            'Content-Type': 'application/json',
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: JSON.stringify({ idToken, validateOnly: true })
    });
}

test('protege URLs administrativas e remove o login por usuário e senha', async () => {
    const server = createAdminServer();
    await withServer(server, async (baseUrl) => {
        const directPanel = await fetch(`${baseUrl}/admin/painel`, { redirect: 'manual' });
        assert.equal(directPanel.status, 303);
        assert.equal(directPanel.headers.get('location'), '/?login=google');

        const adminPath = await fetch(`${baseUrl}/admin`, { redirect: 'manual' });
        assert.equal(adminPath.status, 303);
        assert.equal(adminPath.headers.get('location'), '/?login=google');
        assert.equal((await fetch(`${baseUrl}/admin`, {
            method: 'POST',
            redirect: 'manual'
        })).status, 404);

        const home = await fetch(baseUrl);
        const html = await home.text();
        assert.equal(home.status, 200);
        assert.match(html, /name="techagenda-backend" content="local"/);
        assert.match(html, /Carregando painel administrativo\.\.\./);
        assert.doesNotMatch(html, /Tipo de usuário|cad-tipo|Administrador<\/option>/);
        assert.match(html, /Continuar com Google/);

        assert.equal((await fetch(`${baseUrl}/api/admin/dashboard`)).status, 401);
        const noToken = await fetch(`${baseUrl}/api/admin/session`, {
            method: 'POST',
            headers: { Origin: baseUrl, 'Content-Type': 'application/json' },
            body: '{}'
        });
        assert.equal(noToken.status, 401);

        const styles = await fetch(`${baseUrl}/admin.css`);
        assert.equal(styles.status, 200);
        assert.match(styles.headers.get('content-type'), /text\/css/);
        assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
    });
});

test('somente o ID Token Google do UID autorizado cria sessão e libera o painel', async () => {
    const dashboard = {
        ambientes: [],
        reservas: [],
        resumo: { ambientes: 0, reservas: 0, ativas: 0 }
    };
    const server = createAdminServer({
        adminUid: 'uid-admin',
        firebaseAuth: createAuth(),
        firebaseStore: {
            async getDashboard() { return dashboard; },
            async listReservations() { return [{ id: 'reservation-1', usuario: 'Ana' }]; }
        }
    });
    await withServer(server, async (baseUrl) => {
        const commonLogin = await establishAdminSession(baseUrl, 'google-user');
        assert.equal(commonLogin.response.status, 403);
        assert.match(commonLogin.response.headers.get('set-cookie'), /Max-Age=0/);
        assert.equal((await fetch(`${baseUrl}/api/admin/reservas`, {
            headers: { Cookie: commonLogin.cookie || '' }
        })).status, 401);

        assert.equal((await validateAdminSession(baseUrl, 'google-admin')).status, 401);
        assert.equal((await validateAdminSession(baseUrl, 'google-user')).status, 403);
        const noSession = await fetch(`${baseUrl}/api/admin/dashboard`);
        assert.equal(noSession.status, 401);
        assert.equal((await fetch(`${baseUrl}/api/admin/reservas`)).status, 401);

        const { response, cookie } = await establishAdminSession(baseUrl);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie'), /HttpOnly/);
        assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
        assert.equal((await validateAdminSession(baseUrl, 'google-admin', cookie)).status, 200);

        const revalidation = await establishAdminSession(baseUrl, 'google-admin', cookie);
        assert.equal(revalidation.response.status, 200);
        assert.equal(revalidation.response.headers.get('set-cookie'), null);
        assert.equal(revalidation.cookie, undefined);

        const panel = await fetch(`${baseUrl}/admin/painel`, {
            headers: { Cookie: cookie }
        });
        assert.equal(panel.status, 200);
        const panelHtml = await panel.text();
        assert.match(panelHtml, /name="techagenda-backend" content="local"/);
        assert.match(panelHtml, /Carregando painel administrativo\.\.\./);

        const protectedDashboard = await fetch(`${baseUrl}/api/admin/dashboard`, {
            headers: { Cookie: cookie }
        });
        assert.equal(protectedDashboard.status, 200);
        assert.deepEqual(await protectedDashboard.json(), dashboard);
        const protectedReservations = await fetch(`${baseUrl}/api/admin/reservas`, {
            headers: { Cookie: cookie }
        });
        assert.equal(protectedReservations.status, 200);
        assert.deepEqual(await protectedReservations.json(), [
            { id: 'reservation-1', usuario: 'Ana' }
        ]);

        const logout = await fetch(`${baseUrl}/api/admin/logout`, {
            method: 'POST',
            headers: { Origin: baseUrl, Cookie: cookie }
        });
        assert.equal(logout.status, 200);
        assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
        assert.equal((await fetch(`${baseUrl}/api/admin/dashboard`, {
            headers: { Cookie: cookie }
        })).status, 401);
        assert.equal((await validateAdminSession(baseUrl, 'google-admin', cookie)).status, 401);
        assert.equal((await fetch(`${baseUrl}/admin/painel`, {
            headers: { Cookie: cookie },
            redirect: 'manual'
        })).status, 303);
    });
});

test('recusa corpos JSON acima do limite antes de executar a operação administrativa', async () => {
    let operationCalled = false;
    const server = createAdminServer({
        adminUid: 'uid-admin',
        firebaseAuth: createAuth(),
        firebaseStore: {
            async saveEnvironment() {
                operationCalled = true;
            }
        }
    });
    await withServer(server, async (baseUrl) => {
        const { response, cookie } = await establishAdminSession(baseUrl);
        assert.equal(response.status, 200);
        const oversized = await fetch(`${baseUrl}/api/admin/ambientes`, {
            method: 'POST',
            headers: {
                Cookie: cookie,
                Origin: baseUrl,
                'Content-Type': 'application/json'
            },
            body: 'x'.repeat(128 * 1024 + 1)
        });
        assert.equal(oversized.status, 413);
        assert.match((await oversized.json()).error, /excede o limite/);
        assert.equal(operationCalled, false);
    });
});

test('a tela de login não oferece seleção do tipo de usuário', () => {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const styles = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

    assert.match(html, /Continuar com Google/);
    assert.match(html, /id="menu-lista" hidden/);
    assert.match(html, /id="btn-confirmacao-lista"[^>]*hidden/);
    assert.match(html, /Carregando painel administrativo\.\.\./);
    assert.match(html, /admin-panel-pending/);
    assert.doesNotMatch(html, /Tipo de usuário|cad-tipo|value="Administrador"/);
    assert.doesNotMatch(script, /selecionarTipoUsuario|claims\.admin/);
    assert.match(script, /iniciarSessaoAdminServidor/);
    assert.match(script, /getIdToken\(\)/);
    assert.match(script, /history\.replaceState\(null, '', '\/admin\/painel'\)/);
    assert.match(styles, /html\.admin-panel-pending \.admin-panel-loading/);
    assert.match(script, /sectionId === 'lista' && !temAcessoAdministrativo\(\)/);
});

test('a lista de reservas exige acesso administrativo', async () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const start = script.indexOf('async function atualizarTabela()');
    const end = script.indexOf('function configurarFiltrosLista()', start);
    assert.ok(start >= 0 && end > start, 'encontrou a atualização administrativa da lista');
    assert.match(script.slice(start, end), /if \(!temAcessoAdministrativo\(\)\)/);
    assert.match(script.slice(start, end), /apiNetlifyAdmin\('listReservations'\)/);
    assert.match(script.slice(start, end), /\/api\/admin\/reservas/);
    assert.doesNotMatch(script, /public-reservations/);
    const atualizarTabela = vm.runInNewContext(
        `${script.slice(start, end)}; atualizarTabela;`,
        {
            temAcessoAdministrativo: () => false,
            atualizarVisibilidadeMenuAdmin() {},
            showSection() {},
            document: {
                querySelector(selector) {
                    if (selector === '.nav-links li') return null;
                    throw new Error('A consulta protegida não deve ser acessada.');
                }
            }
        }
    );

    await atualizarTabela();
});

test('parser de reservas entende o formato de data usado pelo backend', () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const start = script.indexOf('function extrairIntervaloReserva(res)');
    const end = script.indexOf('// Verifica se um determinado período', start);
    assert.ok(start >= 0 && end > start, 'encontrou o parser dos intervalos');
    const extrairIntervaloReserva = vm.runInNewContext(
        `${script.slice(start, end)}; extrairIntervaloReserva;`
    );

    const interval = extrairIntervaloReserva({
        data: '20/11/2026 das 08:00 às 09:00'
    });

    assert.equal(interval.dataStr, '2026-11-20');
    assert.equal(interval.horaInicio, '08:00');
    assert.equal(interval.horaFim, '09:00');
});

test('os seletores personalizados aceitam datas e minutos livres sem abrir mão dos limites', () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const dateStart = script.indexOf('function normalizarDataReserva(value)');
    const timeStart = script.indexOf('function normalizarHoraReserva(value)', dateStart);
    const limitsStart = script.indexOf('function limitesHoraReserva(input)', timeStart);
    const readDateStart = script.indexOf('function lerDataReserva()', limitsStart);
    assert.ok(dateStart >= 0 && timeStart > dateStart && limitsStart > timeStart);
    assert.ok(readDateStart > limitsStart, 'encontrou a leitura dos limites');

    const helpers = vm.runInNewContext(
        `${script.slice(dateStart, timeStart)}\n${script.slice(timeStart, limitsStart)}\n${script.slice(limitsStart, readDateStart)}; ({ normalizarDataReserva, normalizarHoraReserva, limitesHoraReserva });`
    );

    assert.equal(helpers.normalizarDataReserva('20/11/2026'), '2026-11-20');
    assert.equal(helpers.normalizarDataReserva('20112026'), '2026-11-20');
    assert.equal(helpers.normalizarDataReserva('31/02/2026'), '');
    assert.equal(helpers.normalizarHoraReserva('14:37'), '14:37');
    assert.equal(helpers.normalizarHoraReserva('1437'), '14:37');
    assert.equal(helpers.normalizarHoraReserva('24:00'), '');
    assert.equal(helpers.limitesHoraReserva({ id: 'hora-inicio' }).max, '17:30');
    assert.equal(helpers.limitesHoraReserva({ id: 'hora-fim' }).min, '08:30');
});

test('a grade mostra somente manhã e tarde e não oferece o horário de almoço', () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const start = script.indexOf('function carregarGradeHorarios()');
    const end = script.indexOf('// Ao clicar em um slot livre', start);
    const normalizeStart = script.indexOf('function normalizarDataReserva(value)');
    const normalizeEnd = script.indexOf('function normalizarHoraReserva(value)', normalizeStart);
    const readDateStart = script.indexOf('function lerDataReserva()', normalizeEnd);
    const readDateEnd = script.indexOf('function criarBotaoSeletor', readDateStart);
    assert.ok(start >= 0 && end > start, 'encontrou a renderização da grade');
    assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart, 'encontrou a normalização da data');
    assert.ok(readDateStart >= 0 && readDateEnd > readDateStart, 'encontrou a leitura da data');

    const elements = {
        'container-grade-turnos': { scrollTop: 0, innerHTML: '' },
        'data-reserva': { value: '2026-11-20' },
        'select-ambiente': { value: 'Biblioteca' },
        'texto-data-selecionada': {},
        'titulo-grade-disponibilidade': {},
        'hora-inicio': { value: '' },
        'hora-fim': { value: '' }
    };
    const render = vm.runInNewContext(
        `${script.slice(normalizeStart, normalizeEnd)}\n${script.slice(readDateStart, readDateEnd)}\n${script.slice(start, end)}; carregarGradeHorarios;`,
        {
            document: { getElementById: (id) => elements[id] || null },
            ambientesCadastrados: [{
                id: 'biblioteca',
                nome: 'Biblioteca',
                ativo: true,
                diasDisponiveis: [5],
                abertura: '08:00',
                fechamento: '18:00'
            }],
            Date,
            getHojeFormatado: () => '2026-11-17',
            formatarDataBR: (date) => date,
            horaEmMinutos: (time) => {
                const [hours, minutes] = time.split(':').map(Number);
                return hours * 60 + minutes;
            },
            minutosEmHora: (minutes) =>
                `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
            disponibilidadeCarregada: true,
            limitesAgendamentos: { biblioteca: 15 },
            contarReservasSobrepostas: () => 3,
            verificarConflito: () => null
        }
    );

    render();

    const html = elements['container-grade-turnos'].innerHTML;
    assert.equal((html.match(/class="bloco-turno"/g) || []).length, 2);
    assert.match(html, /Turno da Manhã/);
    assert.match(html, /Turno da Tarde/);
    assert.doesNotMatch(html, /Intervalo \/ Transição/);
    assert.doesNotMatch(html, /data-inicio="12:00"[^>]*data-fim="13:00"/);
    assert.match(html, /12 de 15 vagas disponíveis/);
    assert.match(script, /if \(reservaCruzaIntervaloAlmoco\(horaInicio, horaFim\)\)/);
});

test('identificação pós-login exibe Usuário sem alterar o tipo interno do perfil', () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const start = script.indexOf('function atualizarInterfaceUsuario()');
    const end = script.indexOf('function abrirInformacao', start);
    assert.ok(start >= 0 && end > start, 'encontrou a atualização do usuário no topo');

    const text = {};
    const icon = {};
    const avatar = { removeAttribute() {} };
    const statusButton = { style: {} };
    const browser = {
        window: { innerWidth: 1024 },
        document: {
            getElementById(id) {
                return {
                    'texto-usuario-topo': text,
                    'icone-login-topo': icon,
                    'avatar-usuario-topo': avatar,
                    'btn-status-usuario': statusButton
                }[id] || null;
            }
        },
        isNetlifyAdminPanelRoute: () => false,
        usuarioLogado: {
            nome: 'Ana Silva',
            tipo: 'Aluno',
            fotoURL: ''
        }
    };
    const atualizarInterfaceUsuario = vm.runInNewContext(
        `${script.slice(start, end)}; atualizarInterfaceUsuario;`,
        browser
    );

    atualizarInterfaceUsuario();

    assert.equal(text.innerText, 'Ana (Usuário) | Sair');
    assert.equal(browser.usuarioLogado.tipo, 'Aluno');
});

test('sincroniza logout Google, revoga sessão administrativa e restaura botão Entrar', async () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const getFunction = (name, nextName) => {
        const start = script.indexOf(`function ${name}(`);
        const syncDeclaration = nextName === 'apiNetlifyAdmin'
            ? `async function ${nextName}(`
            : `function ${nextName}(`;
        const end = script.indexOf(syncDeclaration, start);
        assert.ok(start >= 0 && end > start, `encontrou ${name}`);
        return script.slice(start, end);
    };
    const getAsyncFunction = (name, nextName) => {
        const start = script.indexOf(`async function ${name}(`);
        const end = script.indexOf(`function ${nextName}(`, start);
        assert.ok(start >= 0 && end > start, `encontrou ${name}`);
        return script.slice(start, end);
    };
    const statusButton = { style: { display: 'none' } };
    const label = {};
    const icon = {};
    const avatar = { removeAttribute(name) { this.removedAttribute = name; } };
    const adminMenu = {};
    const order = [];
    const dialogs = [];
    const browser = {
        window: {
            innerWidth: 1024,
            techAgendaFirebaseAdmin: false,
            techAgendaNetlifyAdminSession: true,
            techAgendaAdminSession: false,
            techAgendaBackend: 'netlify',
            location: {
                pathname: '/admin/painel',
                replace(destination) {
                    this.destination = destination;
                    this.pathname = '/';
                }
            },
            firebaseAuth: { currentUser: { uid: 'uid-admin' } },
            firebaseAuthApi: {
                async signOut(auth) {
                    order.push('google-signout');
                    auth.currentUser = null;
                }
            }
        },
        document: {
            getElementById(id) {
                return {
                    'texto-usuario-topo': label,
                    'icone-login-topo': icon,
                    'avatar-usuario-topo': avatar,
                    'btn-status-usuario': statusButton,
                    'menu-admin': adminMenu
                }[id] || null;
            }
        },
        usuarioLogado: {
            uid: 'uid-admin',
            nome: 'Administradora',
            tipo: 'Aluno',
            fotoURL: 'https://example.test/avatar.png'
        },
        async encerrarSessaoAdminServidor() {
            order.push('server-session-revoked');
        },
        async mostrarDialogoTechAgenda(options) {
            dialogs.push(options);
            return true;
        },
        atualizarVisibilidadeMenuAdmin(visible) {
            adminMenu.hidden = !visible;
        },
        alert(message) {
            throw new Error(message);
        },
        console
    };
    const source = [
        getFunction('isAdminRoute', 'isNetlifyAdminPanelRoute'),
        getFunction('isNetlifyAdminPanelRoute', 'temAcessoAdministrativo'),
        getAsyncFunction('sairDaConta', 'atualizarInterfaceUsuario'),
        getFunction('sincronizarEstadoAutenticacao', 'apiNetlifyAdmin'),
        getFunction('atualizarInterfaceUsuario', 'abrirInformacao'),
        'sairDaConta;'
    ].join('\n');
    const logout = vm.runInNewContext(source, browser);

    await logout();

    assert.deepEqual(order, ['server-session-revoked', 'google-signout']);
    assert.equal(dialogs.length, 1);
    assert.equal(dialogs[0].titulo, 'Encerrar sessão?');
    assert.equal(dialogs[0].textoConfirmar, 'Sim, sair');
    assert.equal(dialogs[0].cancelavel, true);
    assert.equal(browser.usuarioLogado, null);
    assert.equal(browser.window.techAgendaNetlifyAdminSession, false);
    assert.equal(browser.window.techAgendaAdminSession, false);
    assert.equal(browser.window.techAgendaFirebaseAdmin, false);
    assert.equal(adminMenu.hidden, true);
    assert.equal(label.innerText, 'Entrar');
    assert.equal(statusButton.hidden, false);
    assert.equal(statusButton.style.display, '');
    assert.equal(icon.hidden, false);
    assert.equal(avatar.hidden, true);
    assert.equal(browser.window.location.destination, '/?login=google');
});
