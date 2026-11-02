# TechAgenda

## Executar localmente

O Live Server serve arquivos estáticos e não executa as rotas administrativas. Para testar o site e `/admin` no mesmo domínio, use o servidor Node.js:

1. Instale uma versão LTS do Node.js compatível com `node:test` (Node.js 18 ou superior).
2. Na pasta do projeto, execute `npm run setup:admin` e informe o usuário e a senha administrativa. O comando cria `.env` com o hash scrypt da senha; mantenha esse arquivo fora do Git.
3. Inicie o servidor com `npm start` (no Windows, `npm.cmd start` se a política do PowerShell bloquear scripts).
4. Abra `http://localhost:3000`. O servidor usa `PORT` quando fornecida pela hospedagem; não há porta fixa nos caminhos da aplicação.
5. Clique três vezes em “Ambientes disponíveis” para abrir `/admin`. Depois do login, o servidor redireciona para `/` e mantém a sessão administrativa.

O acesso ao painel continua protegido no servidor. A sessão administrativa permite navegar pelo site sem login Google; confirmar reservas continua exigindo uma conta Google autenticada no Firebase.

## Publicar em hospedagem Node.js

- Publique a pasta do projeto com `server.js`, `package.json`, `setup-admin.js`, `index.html`, `script.js`, `style.css`, `admin.css` e `imagens/`.
- Configure o comando de inicialização como `npm start`.
- Configure `ADMIN_USERNAME` e `ADMIN_PASSWORD_HASH` como variáveis de ambiente secretas. Gere os valores localmente executando `npm run setup:admin`; copie os dois valores criados no `.env` para o painel da hospedagem e não publique nem envie o `.env` ao repositório.
- Use a variável `PORT` fornecida pela hospedagem. O servidor escuta em `0.0.0.0` por padrão; `HOST` pode ser definido se o provedor exigir outro endereço.
- Configure `NODE_ENV=production`. Termine HTTPS no provedor ou proxy reverso e force HTTPS para o domínio público. Em produção o cookie administrativo recebe o atributo `Secure`; ele também é `HttpOnly`, `SameSite=Strict`, tem escopo `/` e expira após oito horas.
- A configuração do Firebase já está no cliente. Autorize o domínio publicado no Firebase Authentication e mantenha as regras do Firestore implantadas.

As sessões administrativas são guardadas na memória do processo: reiniciar o servidor invalida as sessões, e múltiplas instâncias não compartilham sessões. Para escalar horizontalmente ou persistir sessões entre reinícios, configure um armazenamento de sessão compartilhado (por exemplo, Redis) antes de habilitar várias instâncias.

## Testes

Execute `npm test` (no Windows, `npm.cmd test`). Os testes verificam login, proteção do painel, sessão no site principal e logout.
