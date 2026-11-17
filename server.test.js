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

async function establishAdminSession(baseUrl, idToken = 'google-admin') {
    const response = await fetch(`${baseUrl}/api/admin/session`, {
        method: 'POST',
        headers: {
            Origin: baseUrl,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ idToken })
    });
    return { response, cookie: response.headers.get('set-cookie')?.split(';')[0] };
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
        firebaseStore: { async getDashboard() { return dashboard; } }
    });
    await withServer(server, async (baseUrl) => {
        const commonLogin = await establishAdminSession(baseUrl, 'google-user');
        assert.equal(commonLogin.response.status, 403);
        assert.match(commonLogin.response.headers.get('set-cookie'), /Max-Age=0/);

        const noSession = await fetch(`${baseUrl}/api/admin/dashboard`);
        assert.equal(noSession.status, 401);

        const { response, cookie } = await establishAdminSession(baseUrl);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('set-cookie'), /HttpOnly/);
        assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);

        const panel = await fetch(`${baseUrl}/admin/painel`, {
            headers: { Cookie: cookie }
        });
        assert.equal(panel.status, 200);
        assert.match(await panel.text(), /name="techagenda-backend" content="local"/);

        const protectedDashboard = await fetch(`${baseUrl}/api/admin/dashboard`, {
            headers: { Cookie: cookie }
        });
        assert.equal(protectedDashboard.status, 200);
        assert.deepEqual(await protectedDashboard.json(), dashboard);

        const logout = await fetch(`${baseUrl}/api/admin/logout`, {
            method: 'POST',
            headers: { Origin: baseUrl, Cookie: cookie }
        });
        assert.equal(logout.status, 200);
        assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
        assert.equal((await fetch(`${baseUrl}/api/admin/dashboard`, {
            headers: { Cookie: cookie }
        })).status, 401);
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

    assert.match(html, /Continuar com Google/);
    assert.doesNotMatch(html, /Tipo de usuário|cad-tipo|value="Administrador"/);
    assert.doesNotMatch(script, /selecionarTipoUsuario|claims\.admin/);
    assert.match(script, /iniciarSessaoAdminServidor/);
    assert.match(script, /getIdToken\(\)/);
});

test('lista pública não substitui falhas do Firestore por reservas do cache local', async () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const start = script.indexOf('async function atualizarTabela()');
    const end = script.indexOf('function configurarFiltrosLista()', start);
    assert.ok(start >= 0 && end > start, 'encontrou a atualização da lista pública');

    let message = '';
    const cell = {};
    Object.defineProperty(cell, 'textContent', {
        set(value) {
            message = value;
        }
    });
    const tbody = {
        replaceChildren() {},
        insertRow() {
            return { insertCell: () => cell };
        }
    };
    const browser = {
        document: {
            querySelector: () => tbody,
            getElementById: () => null
        },
        fetch: async (url, options) => {
            assert.equal(url, '/.netlify/functions/public-reservations');
            assert.equal(options.method, 'POST');
            throw new Error('Netlify Function indisponível');
        },
        atualizarResumoLista: (reservations) => assert.deepEqual(Array.from(reservations), []),
        atualizarFiltroAmbientesLista: (reservations) => assert.deepEqual(Array.from(reservations), []),
        console: { error() {} },
        reservas: [{ id: 'cache-antigo' }],
        todasAsReservas: [{ id: 'cache-antigo' }]
    };
    const atualizarTabela = vm.runInNewContext(
        `${script.slice(start, end)}; atualizarTabela;`,
        browser
    );

    await atualizarTabela();

    assert.deepEqual(Array.from(browser.reservas), []);
    assert.deepEqual(Array.from(browser.todasAsReservas), []);
    assert.match(message, /Netlify Function indisponível/);
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

test('identificação pós-login exibe Usuário sem alterar o tipo interno do perfil', () => {
    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const start = script.indexOf('function atualizarInterfaceUsuario()');
    const end = script.indexOf('function abrirInformacao', start);
    assert.ok(start >= 0 && end > start, 'encontrou a atualização do usuário no topo');

    const text = {};
    const icon = {};
    const avatar = { removeAttribute() {} };
    const statusButton = {};
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
