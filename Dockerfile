FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS api-build
COPY tsconfig.json ./
COPY apps/api ./apps/api
RUN npm run build -w apps/api && npm prune --omit=dev

FROM node:24-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-build --chown=node:node /app/node_modules ./node_modules
COPY --from=api-build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=api-build --chown=node:node /app/apps/api/migrations ./apps/api/migrations
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM dependencies AS web-build
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_API_URL=/api
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
ENV VITE_API_URL=${VITE_API_URL}
COPY tsconfig.json ./
COPY apps/web ./apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
