# TechAgenda

## Executar localmente

O Live Server serve arquivos estáticos em outra origem (normalmente `127.0.0.1:5500`) e não executa as rotas administrativas. Se abrir o site por ele, `/admin` também será solicitado à porta 5500 e falhará. Pare o Live Server e use o servidor Node.js para que a página principal, `/admin` e a sessão compartilhem o mesmo domínio e porta:

1. Instale uma versão LTS do Node.js compatível com `node:test` (Node.js 18 ou superior).
2. Na pasta do projeto, execute `npm run setup:admin` e informe o usuário e a senha administrativa. O comando cria `.env` com o hash scrypt da senha; mantenha esse arquivo fora do Git.
3. Inicie o servidor com `npm start` (no Windows, `npm.cmd start` se a política do PowerShell bloquear scripts).
4. Abra o endereço exibido no terminal (localmente, `http://localhost:3000` com a configuração padrão). O servidor usa `PORT` quando fornecida pela hospedagem; não há porta fixa nos caminhos da aplicação.
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

## Gerenciamento administrativo e Firestore

O painel integrado fica no menu **Administração** somente quando o servidor confirmou a sessão administrativa. O login administrativo permanece no backend. O menu não concede privilégios por si só: todas as rotas `/api/admin/*` verificam o cookie de sessão no servidor e as alterações deixam registro em `adminAuditoria`.

O backend usa Firebase Admin SDK. O arquivo `.env` atual contém apenas as variáveis do login administrativo; credenciais Firebase Admin não estão configuradas neste ambiente. Até configurá-las, o site preserva o catálogo estático atual, mas o painel e as operações compartilhadas respondem com erro explícito e não gravam dados.

Para habilitar:

1. No Google Cloud/Firebase do projeto `sistema-agendamento-ct-apc`, use uma identidade de serviço do servidor com acesso ao Firestore (papel mínimo recomendado: **Cloud Datastore User**). Não use a chave de administrador no navegador.
2. Localmente, configure `GOOGLE_APPLICATION_CREDENTIALS` para apontar a um arquivo JSON de conta de serviço guardado fora do repositório, ou configure `FIREBASE_ADMIN_SERVICE_ACCOUNT` com o JSON como segredo de ambiente. Em hospedagem Google Cloud, pode-se usar a identidade de serviço da aplicação e `FIREBASE_ADMIN_USE_ADC=true`. `FIREBASE_ADMIN_PROJECT_ID` é opcional; por padrão usa o projeto Firebase já existente.
3. Publique as regras de [firestore.rules](./firestore.rules). Reservas continuam legíveis pelo site, mas gravações e mudanças são feitas pelas APIs autenticadas; isso é necessário para o servidor validar o usuário e evitar sobreposição concorrente.
4. Reinicie o Node.js e abra **Administração**. Na primeira leitura, o backend cria apenas documentos ausentes dos cinco ambientes que já estavam definidos no código, com os mesmos nomes, capacidades, informações, recursos e imagens. IDs determinísticos e transações tornam essa inicialização repetível; documentos encontrados não são sobrescritos. Reservas da coleção `reservas` não são migradas, apagadas nem duplicadas.

As reservas novas são validadas pelo Admin SDK com token de usuário Google e transação Firestore, usando um bloqueio por ambiente e data para serializar agendamentos concorrentes. O fuso padrão do Centro Tecnológico é UTC−3; configure `TECHAGENDA_TIMEZONE_OFFSET_MINUTES=180` se precisar explicitá-lo. Os horários de ambientes são persistidos no documento de cada ambiente.

Imagens podem usar um caminho existente dentro de `imagens/` ou uma URL HTTPS. Upload de arquivos não está incluído e não requeremos Storage sem uma decisão/configuração de armazenamento.

## Testes

Execute `npm test` (no Windows, `npm.cmd test`). Os testes verificam login, proteção do painel, sessão no site principal, logout e fluxo administrativo. Para executar operações reais do Firestore, configure credenciais do Admin SDK ou use o Emulator Suite.
