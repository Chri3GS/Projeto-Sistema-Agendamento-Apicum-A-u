const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

async function main() {
    const [uid, action = 'grant'] = process.argv.slice(2);
    if (!uid || !['grant', 'revoke'].includes(action)) {
        throw new Error('Uso: node set-admin-claim.js <UID> [grant|revoke]');
    }

    const app = getApps()[0] || initializeApp({
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || 'sistema-agendamento-ct-apc'
    });
    const auth = getAuth(app);
    const user = await auth.getUser(uid);
    const claims = { ...(user.customClaims || {}) };
    if (action === 'grant') claims.admin = true;
    else delete claims.admin;

    await auth.setCustomUserClaims(uid, claims);
    console.log(`Permissão administrativa ${action === 'grant' ? 'concedida a' : 'removida de'} ${uid}.`);
    console.log('O usuário precisa renovar o token ou entrar novamente para a alteração valer.');
}

main().catch((error) => {
    console.error(`Não foi possível atualizar a permissão: ${error.message}`);
    process.exitCode = 1;
});
