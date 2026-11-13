# TechAgenda

## Publicação no Netlify

O acesso administrativo no Netlify usa usuário e senha, sem exigir login Google:

1. Três cliques em **Ambientes disponíveis** abrem `/admin`.
2. O formulário envia as credenciais por HTTPS a uma Netlify Function.
3. Após o login, o navegador recebe um cookie `HttpOnly`, `Secure` e `SameSite=Strict`, válido por oito horas.
4. A sessão também é registrada em `adminSessions` no Firestore. A função confere assinatura, expiração e registro em todas as operações; sair revoga a sessão no servidor.

O login Google dos usuários comuns permanece no site principal e continua sendo exigido para criar reservas. As senhas e chaves privadas não são incluídas no HTML/JavaScript nem armazenadas no `localStorage`.

### Variáveis de ambiente do Netlify

No painel do site, abra **Project configuration → Environment variables** e configure as variáveis para as Functions. Marque como secretas as credenciais e restrinja o escopo às Functions quando a interface oferecer essa opção:

- `ADMIN_USERNAME`: usuário administrativo escolhido por você.
- `ADMIN_PASSWORD_HASH`: hash no formato `scrypt$...`, nunca a senha em texto puro.
- `ADMIN_SESSION_SECRET`: segredo aleatório de pelo menos 32 bytes. Gere localmente, por exemplo, com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
- `FIREBASE_ADMIN_SERVICE_ACCOUNT`: JSON compacto da conta de serviço Firebase, como variável secreta. Essa credencial fica somente no ambiente da função e precisa de acesso ao Firestore.
- `FIREBASE_ADMIN_PROJECT_ID`: opcional; por padrão é `sistema-agendamento-ct-apc`.

Crie uma conta de serviço no projeto Firebase com permissão mínima de leitura/gravação no Firestore (por exemplo, **Cloud Datastore User**) e copie seu JSON diretamente para a variável secreta do Netlify; não o salve no repositório. Para gerar o hash localmente, execute `npm run setup:admin` em uma cópia segura do projeto e informe um usuário próprio e uma senha de pelo menos 12 caracteres. O script grava os valores em `.env`, que está ignorado pelo Git. Copie somente `ADMIN_USERNAME` e `ADMIN_PASSWORD_HASH` para as variáveis do Netlify. Se `.env` já existir, o script não o sobrescreve. Nunca publique esse arquivo nem a conta de serviço.

### Firebase e deploy

1. No Firebase Console, mantenha **Authentication → Google** habilitado e autorize o domínio Netlify e o domínio personalizado. O login administrativo não usa Firebase Authentication.
2. Preserve o projeto e a coleção atuais do Firestore. As reservas existentes continuam em `reservas`; não faça importação nem exclusão durante a publicação.
3. Mantenha as regras do Firestore que negam gravações diretas do navegador. A criação de reservas agora é feita por `/.netlify/functions/reservations`, que valida o token Firebase no servidor e usa a transação do store existente; não depende de Cloud Functions nem de plano Blaze.

   ```sh
   npm test
   npm run build:netlify
   ```

4. No Netlify, use a pasta do projeto como **Base directory**. O `netlify.toml` define o comando `npm run build:netlify`, publica `dist/` e mantém `netlify/functions/` fora da pasta publicada. A versão Node configurada para o build é 22; confirme-a em **Project configuration → Build settings** se houver configuração de interface que a substitua.
5. Publique a alteração no Netlify pelo deploy do commit/branch atualizado ou por **Deploy site → Trigger deploy**. As rotas `/admin` e `/admin/painel` continuam inalteradas.

As Functions administrativas usam o Firebase Admin SDK no servidor e as validações do store atual: ambientes duplicados não são criados, ambientes com reservas ativas não podem ser excluídos e cancelamentos/exclusões mantêm a auditoria. A função de reservas valida o token Firebase do usuário e usa transações para evitar sobreposição de horários. As regras do Firestore negam gravação direta do navegador em `ambientes`, `reservas`, sessões e auditoria; as Functions confiáveis operam com credenciais de servidor. Credenciais de serviço devem permanecer somente nas variáveis secretas do Netlify, nunca no frontend.

### Fotos dos ambientes

O painel envia JPG, PNG ou WebP de até 4 MB para o armazenamento persistente Netlify Blobs por uma Netlify Function protegida pela sessão administrativa. O servidor confere tipo, assinatura do arquivo e tamanho; o Firestore guarda somente o caminho de referência. Na edição, a foto atual permanece quando nenhuma nova é selecionada. As imagens dos ambientes existentes em `imagens/` e URLs HTTPS continuam aceitas.

Esta implementação usa Netlify Blobs, sem provisionar Firebase Storage nem mudar o plano do Firebase. A documentação oficial do Firebase informa que Cloud Storage for Firebase não está disponível no plano Spark e requer Blaze ([requisitos do Spark/Blaze](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)). A página atual de [preços da Netlify](https://www.netlify.com/pricing/) inclui Blob storage no plano Free, sujeito aos limites/créditos de uso da conta; consulte o painel de faturamento do seu site antes de qualquer upgrade. Nenhuma cobrança ou recarga automática é configurada pelo código. Consulte também a [documentação de Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

## Execução local com o backend antigo

`server.js`, `setup-admin.js` e as rotas administrativas antigas foram mantidos. Para continuar usando o fluxo local, execute `npm run setup:admin` e `npm start`. O backend Node.js local continua usando suas próprias sessões; a hospedagem Netlify usa as Netlify Functions e não precisa de servidor Node.js permanente.

## Testes

Execute `npm test` na pasta do projeto. O build estático do Netlify pode ser validado com `npm run build:netlify`. Para validar operações reais, configure as variáveis do Netlify e use um projeto Firebase de teste antes da publicação final.
