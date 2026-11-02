const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { after, before, test } = require('node:test');
const { createAdminServer } = require('./server');

const username = 'centro123';
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync('centro123', salt, 64);
const server = createAdminServer({
    username,
    passwordHash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
});
let baseUrl;

before(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('protege o painel contra acesso direto e permite login apenas com credenciais válidas', async () => {
    const directAccess = await fetch(`${baseUrl}/admin/painel`, { redirect: 'manual' });
    assert.equal(directAccess.status, 303);
    assert.equal(directAccess.headers.get('location'), '/admin');

    const loginPage = await fetch(`${baseUrl}/admin`);
    assert.equal(loginPage.status, 200);
    const loginHtml = await loginPage.text();
    assert.match(loginHtml, /href="\/admin\.css"/);
    assert.match(loginHtml, /src="\/imagens\/logo\.png"/);
    assert.match(loginHtml, /type="password"/);

    const adminStylesheet = await fetch(`${baseUrl}/admin.css`);
    assert.equal(adminStylesheet.status, 200);
    assert.match(adminStylesheet.headers.get('content-type'), /text\/css/);
    assert.match(await adminStylesheet.text(), /\.admin-card/);

    const adminLogo = await fetch(`${baseUrl}/imagens/logo.png`);
    assert.equal(adminLogo.status, 200);
    assert.match(adminLogo.headers.get('content-type'), /image\/png/);

    const mainStylesheet = await fetch(`${baseUrl}/style.css`);
    assert.equal(mainStylesheet.status, 200);
    assert.match(mainStylesheet.headers.get('content-type'), /text\/css/);

    const publicHome = await fetch(`${baseUrl}/`);
    assert.equal(publicHome.status, 200);
    assert.match(await publicHome.text(), /name="techagenda-admin-session" content="false"/);

    const publicEnvironmentApi = await fetch(`${baseUrl}/api/ambientes`);
    assert.equal(publicEnvironmentApi.status, 503);
    assert.match((await publicEnvironmentApi.json()).error, /credenciais Firebase Admin/);

    const unauthenticatedDashboard = await fetch(`${baseUrl}/api/admin/dashboard`);
    assert.equal(unauthenticatedDashboard.status, 401);

    const privateServerFile = await fetch(`${baseUrl}/server.js`);
    assert.equal(privateServerFile.status, 404);

    const invalidLogin = await fetch(`${baseUrl}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password: 'incorreta' }),
        redirect: 'manual'
    });
    assert.equal(invalidLogin.status, 401);
    assert.match(await invalidLogin.text(), /Usuário ou senha incorretos/);
    assert.equal(invalidLogin.headers.get('set-cookie'), null);

    const validLogin = await fetch(`${baseUrl}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password: 'centro123' }),
        redirect: 'manual'
    });
    assert.equal(validLogin.status, 303);
    assert.equal(validLogin.headers.get('location'), '/');
    const cookie = validLogin.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.match(cookie, /Path=\//);

    const authenticatedHome = await fetch(`${baseUrl}/`, {
        headers: { Cookie: cookie.split(';')[0] }
    });
    assert.equal(authenticatedHome.status, 200);
    assert.match(await authenticatedHome.text(), /name="techagenda-admin-session" content="true"/);

    const configuredDashboard = await fetch(`${baseUrl}/api/admin/dashboard`, {
        headers: { Cookie: cookie.split(';')[0] }
    });
    assert.equal(configuredDashboard.status, 503);
    assert.match((await configuredDashboard.json()).error, /Configure credenciais Firebase Admin/);

    const authenticatedAdminRoute = await fetch(`${baseUrl}/admin`, {
        headers: { Cookie: cookie.split(';')[0] },
        redirect: 'manual'
    });
    assert.equal(authenticatedAdminRoute.status, 303);
    assert.equal(authenticatedAdminRoute.headers.get('location'), '/');

    const panel = await fetch(`${baseUrl}/admin/painel`, {
        headers: { Cookie: cookie.split(';')[0] }
    });
    assert.equal(panel.status, 200);
    const panelHtml = await panel.text();
    assert.match(panelHtml, /href="\/admin\.css"/);
    assert.match(panelHtml, /Painel Administrativo/);

    const logout = await fetch(`${baseUrl}/admin/logout`, {
        method: 'POST',
        headers: { Cookie: cookie.split(';')[0] },
        redirect: 'manual'
    });
    assert.equal(logout.status, 303);
    assert.match(logout.headers.get('set-cookie'), /Path=\//);

    const afterLogout = await fetch(`${baseUrl}/admin/painel`, {
        headers: { Cookie: cookie.split(';')[0] },
        redirect: 'manual'
    });
    assert.equal(afterLogout.status, 303);
    const publicHomeAfterLogout = await fetch(`${baseUrl}/`, {
        headers: { Cookie: logout.headers.get('set-cookie').split(';')[0] }
    });
    assert.match(await publicHomeAfterLogout.text(), /name="techagenda-admin-session" content="false"/);
});

test('recusa corpos JSON acima do limite sem executar a operação administrativa', async () => {
    let operationCalled = false;
    const oversizedBodyServer = createAdminServer({
        username,
        passwordHash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`,
        firebaseStore: {
            saveEnvironment() {
                operationCalled = true;
            }
        }
    });
    await new Promise((resolve) => oversizedBodyServer.listen(0, '127.0.0.1', resolve));
    const testUrl = `http://127.0.0.1:${oversizedBodyServer.address().port}`;

    try {
        const login = await fetch(`${testUrl}/admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ username, password: 'centro123' }),
            redirect: 'manual'
        });
        const cookie = login.headers.get('set-cookie').split(';')[0];
        const response = await fetch(`${testUrl}/api/admin/ambientes`, {
            method: 'POST',
            headers: {
                Cookie: cookie,
                'Content-Type': 'application/json',
                Origin: testUrl
            },
            body: 'x'.repeat(128 * 1024 + 1)
        });

        assert.equal(response.status, 413);
        assert.match((await response.json()).error, /excede o limite/);
        assert.equal(operationCalled, false);
    } finally {
        await new Promise((resolve, reject) => oversizedBodyServer.close((error) =>
            error ? reject(error) : resolve()
        ));
    }
});

test('fluxo completo por uma origem: título, login, site autenticado e logout', async () => {
    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Ambientes disponíveis/);

    const script = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
    const start = script.indexOf('function configurarAtalhoAdministrativo()');
    const end = script.indexOf('function showSection', start);
    assert.ok(start >= 0 && end > start, 'encontrou o handler usado pelo título');

    let clickHandler;
    let adminPath;
    let now = 10000;
    class FakeDate extends Date {
        static now() {
            return now;
        }
    }

    const title = {
        textContent: 'Ambientes disponíveis',
        addEventListener(eventName, handler) {
            assert.equal(eventName, 'click');
            clickHandler = handler;
        }
    };
    const browser = {
        document: {
            querySelectorAll(selector) {
                assert.equal(selector, '#home h1');
                return [title];
            }
        },
        window: {
            location: {
                assign(location) {
                    adminPath = new URL(location, baseUrl).pathname;
                }
            }
        },
        Date: FakeDate,
        Array
    };
    vm.runInNewContext(
        `${script.slice(start, end)}; configurarAtalhoAdministrativo();`,
        browser
    );

    clickHandler();
    now += 300;
    clickHandler();
    now += 300;
    clickHandler();
    assert.equal(adminPath, '/admin');

    const loginPage = await fetch(new URL(adminPath, baseUrl));
    assert.equal(loginPage.status, 200);
    assert.match(await loginPage.text(), /Acesso administrativo/);

    const login = await fetch(new URL(adminPath, baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password: 'centro123' }),
        redirect: 'manual'
    });
    assert.equal(login.status, 303);
    assert.equal(login.headers.get('location'), '/');
    const sessionCookie = login.headers.get('set-cookie').split(';')[0];

    const authenticatedHome = await fetch(baseUrl, {
        headers: { Cookie: sessionCookie }
    });
    assert.equal(authenticatedHome.status, 200);
    assert.match(await authenticatedHome.text(), /name="techagenda-admin-session" content="true"/);

    const logout = await fetch(new URL('/admin/logout', baseUrl), {
        method: 'POST',
        headers: { Cookie: sessionCookie },
        redirect: 'manual'
    });
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.get('location'), '/admin');

    const homeAfterLogout = await fetch(baseUrl, {
        headers: { Cookie: logout.headers.get('set-cookie').split(';')[0] }
    });
    assert.equal(homeAfterLogout.status, 200);
    assert.match(await homeAfterLogout.text(), /name="techagenda-admin-session" content="false"/);
});
