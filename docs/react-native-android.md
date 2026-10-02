# Aplicativo Android

O aplicativo Android é React Native com Expo e vive exclusivamente em `apps/mobile`.

## Ambiente

Copie `apps/mobile/.env.example` para `apps/mobile/.env` e configure:

```dotenv
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
EXPO_PUBLIC_API_URL=https://seu-dominio.example/api
EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_EAS_PROJECT_ID=895cd188-25ae-4746-a5ad-83ab187e40d9
```

Todas as variáveis desse arquivo são públicas. Segredos do Clerk pertencem somente a
`apps/api/.env`.

O `app.config.ts` interrompe o build imediatamente quando a chave pública do Clerk não está
disponível. Isso evita gerar um APK que falha apenas depois de instalado.

## Desenvolvimento

Na raiz do repositório:

```powershell
npm run mobile:native:start
```

O QR code abre o servidor de desenvolvimento; ele não é um APK.

## APK pela nuvem

```powershell
npm run mobile:native:apk
```

Esse comando executa o EAS a partir do workspace `apps/mobile` e usa o perfil `preview`, configurado
para produzir um APK instalável.

## Play Store

```powershell
npm run mobile:native:aab
```

O perfil `production` produz um Android App Bundle (`.aab`).

## Build nativo local

```powershell
npm run apk:local -w apps/mobile
```

Esse fluxo exige JDK e Android SDK locais. A pasta `apps/mobile/android` é gerada automaticamente e
não deve ser versionada.

## EAS e variáveis

Para builds iniciados nesta máquina, `.easignore` inclui `apps/mobile/.env` no upload. Para builds de
CI, configure as variáveis no ambiente EAS e não dependa de um arquivo local:

```powershell
cd apps/mobile
npx eas env:create --environment preview --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
npx eas env:create --environment production --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
```

Repita para as demais variáveis necessárias.
