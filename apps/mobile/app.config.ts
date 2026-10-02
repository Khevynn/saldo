import type { ExpoConfig } from 'expo/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workingDirectory = process.cwd();
const mobileDirectory = existsSync(resolve(workingDirectory, 'app.config.ts'))
  ? workingDirectory
  : resolve(workingDirectory, 'apps', 'mobile');
const localEnvironmentPath = resolve(mobileDirectory, '.env');
const localEnvironment = existsSync(localEnvironmentPath)
  ? Object.fromEntries(
      readFileSync(localEnvironmentPath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1).trim()];
        }),
    )
  : {};

const environmentValue = (name: string) => process.env[name] || localEnvironment[name];
const easProjectId =
  environmentValue('EXPO_PUBLIC_EAS_PROJECT_ID') || '895cd188-25ae-4746-a5ad-83ab187e40d9';
const clerkPublishableKey = environmentValue('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY')?.trim();

if (!clerkPublishableKey) {
  throw new Error(
    'Defina EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY em apps/mobile/.env ou no ambiente do EAS antes de iniciar ou compilar o app.',
  );
}

const config: ExpoConfig = {
  owner: 'khevynn-sas-team',
  name: 'Saldo',
  slug: 'saldo-mobile',
  scheme: 'app.saldo.mobile',
  version: '1.0.0',
  runtimeVersion: { policy: 'appVersion' },
  updates: {
    url: `https://u.expo.dev/${easProjectId}`,
    checkAutomatically: 'ON_ERROR_RECOVERY' as const,
    fallbackToCacheTimeout: 0,
  },
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#ffffff',
  icon: './assets/icon.png',
  plugins: [
    'expo-secure-store',
    '@clerk/expo-google-signin',
    [
      '@clerk/expo',
      {
        appleSignIn: false,
        theme: './clerk-theme.json',
      },
    ],
  ],
  android: {
    package: 'app.saldo.mobile',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#f3f6f2',
    },
    permissions: [],
  },
  ios: {
    bundleIdentifier: 'app.saldo.mobile',
    supportsTablet: true,
  },
  extra: {
    apiUrl: environmentValue('EXPO_PUBLIC_API_URL') || 'https://saldo.bdpserver.online/api',
    clerkPublishableKey,
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: environmentValue(
      'EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID',
    ),
    EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID: environmentValue(
      'EXPO_PUBLIC_CLERK_GOOGLE_ANDROID_CLIENT_ID',
    ),
    eas: {
      projectId: '895cd188-25ae-4746-a5ad-83ab187e40d9',
    },
  },
};

export default config;
