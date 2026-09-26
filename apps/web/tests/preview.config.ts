import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureResponse } from './preview-data';

const directory = fileURLToPath(new URL('.', import.meta.url));
const fixtureMiddleware = (request: any, response: any, next: () => void) => {
  if (!request.url?.startsWith('/api/')) return next();
  response.setHeader('Content-Type', 'application/json');
  if (request.method !== 'GET') {
    response.statusCode = 400;
    response.end(
      JSON.stringify({ message: 'Prévia visual somente leitura. Nenhum registro foi salvo.' }),
    );
    return;
  }
  response.end(JSON.stringify(fixtureResponse(request.url)));
};

// Isolated visual test server. Never imported by the production Vite configuration.
export default defineConfig({
  root: directory,
  plugins: [
    react(),
    {
      name: 'visual-test-fixtures',
      configureServer(server) {
        server.middlewares.use(fixtureMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(fixtureMiddleware);
      },
    },
  ],
  resolve: { alias: { '@clerk/clerk-react': resolve(directory, 'preview-auth.tsx') } },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: [resolve(directory, '../../..')] },
  },
});
