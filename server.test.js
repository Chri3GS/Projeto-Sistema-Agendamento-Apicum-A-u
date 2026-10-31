const assert = require('node:assert/strict');
const crypto = require('node:crypto');
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
    assert.equal(validLogin.headers.get('location'), '/admin/painel');
    const cookie = validLogin.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);

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

    const afterLogout = await fetch(`${baseUrl}/admin/painel`, {
        headers: { Cookie: cookie.split(';')[0] },
        redirect: 'manual'
    });
    assert.equal(afterLogout.status, 303);
});
