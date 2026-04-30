# Root deployment image for Cloud Run.
# IMPORTANT: This repository contains both mobile app and backend code.
# Cloud Run must run the backend HTTP server (hedwig-backend), not Expo dev server.

FROM node:22-slim AS build

WORKDIR /app/hedwig-backend

# Build toolchain for native node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git node-gyp pkg-config python-is-python3 rsync && \
    rm -rf /var/lib/apt/lists/*

# Install backend deps
COPY hedwig-backend/package-lock.json hedwig-backend/package.json ./
RUN npm ci --include=dev --legacy-peer-deps

# Copy backend source and build TypeScript
COPY hedwig-backend ./
RUN npm run build

# Build embedded web-client
WORKDIR /app/hedwig-backend/web-client
RUN npm ci --include=dev --legacy-peer-deps
ENV VITE_REOWN_PROJECT_ID=e2fead0a05813697717820eaed0f18ea
ENV VITE_API_URL=https://pay.hedwigbot.xyz
ENV VITE_PRIVY_APP_ID=cmby98gd300hxl40mrdr3mkoh
RUN npm run build && mkdir -p dist


FROM node:22-slim

WORKDIR /app/hedwig-backend
ENV NODE_ENV=production
ENV PORT=8080

# Non-root runtime user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hedwig

# Runtime artifacts
COPY --from=build /app/hedwig-backend/dist /app/hedwig-backend/dist
COPY --from=build /app/hedwig-backend/node_modules /app/hedwig-backend/node_modules
COPY --from=build /app/hedwig-backend/package.json /app/hedwig-backend/package.json
COPY --from=build /app/hedwig-backend/src/templates /app/hedwig-backend/src/templates
COPY --from=build /app/hedwig-backend/public /app/hedwig-backend/public
COPY --from=build /app/hedwig-backend/web-client/dist /app/hedwig-backend/web-client/dist

RUN chown -R hedwig:nodejs /app/hedwig-backend
USER hedwig

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
