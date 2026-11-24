# TechAgenda

## Login e acesso administrativo

Todos entram pelo botão **Continuar com Google** no site. Não há seleção de perfil nem login administrativo por usuário e senha. O Firebase Authentication mantém a sessão Google; contas comuns usam o TechAgenda normalmente.

O painel administrativo é protegido em duas camadas:

1. Depois do login, o navegador envia o Firebase ID Token à Function `admin-session`.
2. A Function valida o token com Firebase Admin, exige o provedor Google, e-mail verificado `centrotec.apc@gmail.com` e o UID configurado em `ADMIN_UID`. A autorização nunca usa um e-mail informado pelo navegador.
3. Só então o servidor cria uma sessão aleatória, assinada e armazenada em `adminSessions`, entregue por cookie `HttpOnly`, `Secure` e `SameSite=Strict`.
4. As operações de gerenciamento, consultas administrativas e upload de imagens verificam a sessão no servidor. A saída revoga o registro da sessão e limpa o cookie; a saída do Firebase também encerra a sessão administrativa.

Configure `ADMIN_UID` com o UID da conta `centrotec.apc@gmail.com` exibido em **Firebase Console → Authentication → Users**. Não use o e-mail como substituto do UID e não coloque esse valor em código client-side. Funções administrativas Firebase remanescentes também exigem esse UID no ambiente do servidor; custom claims não concedem mais acesso.

### Netlify

Em **Project configuration → Environment variables**, configure estas variáveis para as Functions. Restrinja seu escopo às Functions quando disponível:

- `ADMIN_UID`: UID da conta Google administrativa autorizada.
- `ADMIN_SESSION_SECRET`: segredo aleatório de pelo menos 32 bytes. Gere localmente com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- `FIREBASE_ADMIN_SERVICE_ACCOUNT`: JSON da conta de serviço Firebase como variável secreta. Não salve esse JSON no repositório.
- `FIREBASE_ADMIN_PROJECT_ID`: opcional; se configurado, deve ser `sistema-agendamento-ct-apc`.

A conta de serviço precisa acessar o Firestore para validar sessões e operar o painel. Mantenha Google habilitado em **Firebase Authentication → Sign-in method** e autorize os domínios Netlify e personalizado em **Authorized domains**. Não é necessário configurar `ADMIN_USERNAME`, senha administrativa ou custom claim.

Se as Firebase Callable Functions administrativas do diretório `functions/` também estiverem implantadas e forem usadas, configure `ADMIN_UID` no ambiente dessas Functions (por exemplo, em `.env.sistema-agendamento-ct-apc`) e atualize-as para esta versão. Sem essa configuração, elas negam o acesso; o painel Netlify usa as Netlify Functions.

As rotas `/admin` e `/admin/painel` não autenticam por conhecer a URL: `/admin` abre o login Google comum; o painel e suas APIs exigem autorização de servidor. O build do site pode ser validado com:

```sh
npm test
npm run build:netlify
```

Não faça deploy até configurar e validar as variáveis no Netlify.

## Dados e operações

As reservas existentes permanecem na coleção `reservas`; não faça importação nem exclusão. As regras do Firestore continuam negando leitura e gravação direta do navegador para `reservas`, `ambientes`, sessões e auditoria. Reservas são criadas por Function com validação do ID Token. Operações administrativas confiáveis usam Firebase Admin no servidor. O painel mantém listagem, filtros, reservas, gerenciamento de ambientes, imagens em Netlify Blobs e consultas existentes ao Firestore.

Os limites de reservas simultâneas são mantidos em `functions/reservation-limits.js`: Biblioteca (15), Laboratório de Informática (20) e demais ambientes (1, incluindo as salas padrão). A alteração deve ser feita somente nessa configuração; ambientes personalizados sem limite explícito ficam limitados a uma reserva simultânea. A disponibilidade pública retorna apenas ambiente, situação e intervalo das reservas, além desses limites, sem dados pessoais.

### Minhas Reservas e notificações

Usuários Google autenticados consultam, alteram e cancelam suas próprias reservas pela Function `user-reservations`. O backend valida o ID Token, usa o UID validado para filtrar e conferir a propriedade e aplica alterações em transação; disponibilidade, capacidade, horário de almoço e conflitos são revalidados no servidor. As notificações são gravadas em `adminNotifications` na mesma transação e ficam disponíveis apenas ao painel administrativo autenticado. As regras do Firestore continuam negando o acesso direto do cliente às reservas e notificações.

Na página **Minhas Reservas**, as reservas são organizadas nas guias Agendadas, Canceladas e Concluídas conforme a situação retornada pelo servidor; períodos encerrados são identificados pelo horário de término, sem alterar os registros no Firestore.

Reservas antigas sem `usuarioUid` não são atribuídas a nenhuma conta e não aparecem em **Minhas Reservas**; continuam na Lista administrativa. Não há migração automática nem nova variável de ambiente necessária para esta funcionalidade.

Fotos JPG, PNG e WebP de até 4 MB são validadas no servidor. As imagens dos ambientes e os dados atuais do Firestore não são removidos por esta alteração.

### Migração para Vercel

A migração está isolada na branch `migration/vercel`. A configuração usa o mesmo projeto Firebase (`sistema-agendamento-ct-apc`) e as mesmas coleções; não importa, recria nem apaga documentos. As Functions Vercel em `api/` adaptam as validações já usadas pelas Netlify Functions. As rotas antigas `/.netlify/functions/*` também são reescritas para `/api/*`, mantendo clientes e referências existentes.

Para publicar manualmente:

1. Importe esta branch no Vercel como projeto **Other** (site estático com Node.js Functions), defina Root Directory como `Projeto-Sistema-Agendamento-Apicum-A-u`, Build Command `npm run build:vercel`, Output Directory `dist` e Node.js `22.x` (runtime mínimo `22.12.0`). Confirme **22.x** em **Project Settings → Build and Deployment → Node.js Version** e faça um novo deploy. A Vercel aplica patches automaticamente, mas o patch exato pode diferir entre o build e as Functions; `engines.node` também restringe ambos à série compatível.
2. Crie um Vercel Blob Store **Public** e conecte-o ao projeto nos ambientes de Production e Preview. Prefira a autenticação OIDC automática da Vercel; se escolher um token de leitura/gravação, mantenha `BLOB_READ_WRITE_TOKEN` somente como variável secreta do backend. O backend só permite uploads com sessão administrativa e valida MIME, assinatura e limite de 4 MB. A URL pública retornada é a mesma classe de acesso das imagens existentes, que já eram servidas publicamente.
3. Configure em **Environment Variables** para Production (e Preview se desejado): `ADMIN_UID`, `ADMIN_SESSION_SECRET`, `FIREBASE_ADMIN_SERVICE_ACCOUNT` e `NETLIFY_SITE_URL`. `FIREBASE_ADMIN_PROJECT_ID` é opcional e, se definido, deve ser `sistema-agendamento-ct-apc`. `NETLIFY_SITE_URL` deve ser apenas a origem HTTPS do site Netlify que continuará ativo, por exemplo `https://seu-site.netlify.app`; ela é usada somente para ler imagens antigas.
4. Configure os mesmos privilégios Firestore já usados pela conta de serviço. Não crie outro projeto Firebase, não altere regras/coleções nem use variáveis Firebase no frontend. Faça um deploy Preview manual e valide login, reserva, Minhas Reservas, painel, imagens antigas e novo upload antes de mudar DNS/domínio.
5. No Firebase Authentication, mantenha o provedor Google ativo e acrescente os hostnames exatos usados em Production, Preview e domínio personalizado em **Authorized domains**. Não use curingas. Mantenha os domínios Netlify autorizados enquanto a versão anterior for usada.

As imagens históricas no Netlify Blobs não são copiadas nem removidas nesta migração. As referências já gravadas no Firestore continuam válidas: Vercel encaminha as leituras de `/.netlify/functions/environment-images?key=...` para o site Netlify configurado. Portanto, mantenha o site e o endpoint Netlify ativos enquanto houver essas referências. Novos uploads são gravados no Vercel Blob e salvam a URL pública retornada no documento do ambiente. A retirada definitiva do Netlify exige um projeto separado para copiar/validar os blobs antigos e atualizar apenas as referências correspondentes; não faça isso antes de backup e validação.

A branch não contém segredos e não executa deploy. Nunca cole o JSON de serviço, segredo de sessão ou token do Blob no código, em arquivos versionados ou em variáveis `VITE_`/client-side.

## Execução local

`npm start` executa o servidor local. Para testar funcionalidades que acessam o Firestore, configure localmente `ADMIN_UID` e as credenciais Firebase Admin (por `FIREBASE_ADMIN_SERVICE_ACCOUNT` ou Application Default Credentials). O servidor local usa o mesmo fluxo: ID Token Google validado no servidor antes da criação da sessão.
