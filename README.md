# Saldo

Monorepo com três aplicações independentes:

```text
apps/
├── api/       API NestJS e PostgreSQL
├── mobile/    aplicativo React Native com Expo
└── web/       frontend React com Vite
```

Cada aplicação possui seu próprio arquivo de ambiente. Não crie `.env` na raiz.

## Configuração

Crie os arquivos locais a partir dos exemplos:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

- `apps/api/.env`: banco, Clerk secreto, CORS e infraestrutura.
- `apps/web/.env`: somente variáveis públicas `VITE_*`.
- `apps/mobile/.env`: somente variáveis públicas `EXPO_PUBLIC_*`.

Nunca coloque `CLERK_SECRET_KEY` nos arquivos da web ou do mobile.

## Instalação e desenvolvimento

```powershell
npm install
npm run setup:local
npm run dev:local
```

O site abre em `http://127.0.0.1:5173` e a API em `http://127.0.0.1:3000`.

Para iniciar apenas o aplicativo móvel:

```powershell
npm run mobile:native:start
```

Se o celular não estiver na mesma rede do computador, use o túnel:

```powershell
npm run mobile:native:start:tunnel
```

Com o development build instalado, alterações em TypeScript, estilos e imagens aparecem por Fast
Refresh, sem gerar outro APK.

Para gerar esse development build uma única vez:

```powershell
npm run mobile:native:dev-build
```

## APK e AAB

O projeto Expo/EAS existe somente em `apps/mobile`. Não execute `eas build` na raiz.

APK instalável para testes:

```powershell
npm run mobile:native:apk
```

Bundle para a Play Store:

```powershell
npm run mobile:native:aab
```

O arquivo `.easignore` da raiz inclui apenas o `.env` público do mobile no upload local ao EAS. Em
CI, configure as mesmas variáveis no ambiente do projeto EAS.

## Atualizações sem novo APK

Mudanças em JavaScript/TypeScript, UI e assets podem ser enviadas ao APK de testes pelo canal
`preview`:

```powershell
npm run mobile:update:preview
```

O comando pede uma mensagem para identificar a atualização. O aplicativo verifica, baixa e aplica a
nova versão automaticamente ao ser aberto. Use `mobile:update:production` somente para uma versão já
validada que deva chegar aos usuários de produção.

Um APK/AAB novo continua obrigatório ao alterar dependências nativas, plugins Expo, permissões,
ícone, splash screen, identificador do pacote ou versão do runtime.

## Verificações

```powershell
npm run typecheck
npm test
npm run build
```

## Publicação cotidiana

Para validar o projeto, publicar o Android no canal de produção do EAS e depois reconstruir o
Docker local, use um único comando na raiz:

```powershell
npm run publish:all
```

Uma mensagem opcional pode ser informada depois de `--`:

```powershell
npm run publish:all -- "Ajustes de cartões e movimentações"
```

O comando verifica as migrations antes de fazer qualquer publicação. Se houver mudança de banco
pendente, ele para imediatamente para que o fluxo com backup e validação seja executado manualmente.
Para testar apenas essa proteção, sem publicar, use `npm run publish:all -- --check`.

## Docker

Os comandos Docker carregam `apps/api/.env` e `apps/web/.env` explicitamente:

```powershell
npm run docker:up
npm run docker:logs
npm run docker:down
```

Publicação com Cloudflare Tunnel:

```powershell
npm run docker:public:up
npm run docker:public:logs
npm run docker:public:down
```

## Documentação

- [API](docs/api.md)
- [Arquitetura](docs/architecture.md)
- [Operações](docs/operations.md)
- [Android e Expo](docs/react-native-android.md)
