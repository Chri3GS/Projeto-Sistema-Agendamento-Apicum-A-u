const crypto = require('node:crypto');
const fs = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');

const envPath = path.join(__dirname, '.env');

function ask(terminal, question, defaultValue = '') {
    return new Promise((resolve) => {
        terminal.question(question, (answer) => resolve(answer || defaultValue));
    });
}

function askHidden(question) {
    return new Promise((resolve) => {
        process.stdout.write(question);
        readline.emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        let answer = '';

        const finish = () => {
            process.stdin.setRawMode(false);
            process.stdin.removeListener('keypress', onKeypress);
            process.stdout.write('\n');
            resolve(answer);
        };
        const onKeypress = (character, key) => {
            if (key.name === 'return') {
                finish();
            } else if (key.ctrl && key.name === 'c') {
                process.exit(1);
            } else if (key.name === 'backspace') {
                answer = answer.slice(0, -1);
            } else if (character && !key.ctrl && !key.meta) {
                answer += character;
            }
        };

        process.stdin.on('keypress', onKeypress);
    });
}

async function main() {
    let username;
    let password;
    if (process.stdin.isTTY) {
        const terminal = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        username = (await ask(terminal, 'Usuário administrativo [centro123]: ', 'centro123')).trim();
        terminal.close();
        password = await askHidden('Senha administrativa (entrada oculta): ');
    } else {
        process.stdout.write('Usuário administrativo [centro123]: \nSenha administrativa: \n');
        const [usernameInput = '', passwordInput = ''] = fs.readFileSync(0, 'utf8').split(/\r?\n/);
        username = (usernameInput || 'centro123').trim();
        password = passwordInput;
    }

    if (!username || !password || username.length > 100 ||
        /[\r\n=]/.test(username) || Buffer.byteLength(password) > 1024) {
        throw new Error('Informe um usuário válido e uma senha de até 1024 bytes.');
    }

    const salt = crypto.randomBytes(16);
    const hash = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, derivedKey) => {
            if (error) reject(error);
            else resolve(derivedKey);
        });
    });

    const lines = [
        `ADMIN_USERNAME=${username}`,
        `ADMIN_PASSWORD_HASH=scrypt$${salt.toString('hex')}$${hash.toString('hex')}`,
        'PORT=3000',
        ''
    ];
    try {
        fs.writeFileSync(envPath, lines.join('\n'), { mode: 0o600, flag: 'wx' });
    } catch (error) {
        if (error.code === 'EEXIST') {
            throw new Error('.env já existe; preserve o arquivo ou remova-o manualmente para reconfigurar.');
        }
        throw error;
    }
    console.log('Credenciais configuradas em .env (arquivo ignorado pelo Git).');
}

main().catch((error) => {
    console.error(`Não foi possível configurar o administrador: ${error.message}`);
    process.exitCode = 1;
});
