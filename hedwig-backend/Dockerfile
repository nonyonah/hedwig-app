# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL org.opencontainers.image.description="Hedwig Backend - Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules (rsync needed for expo-live-updates)
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git node-gyp pkg-config python-is-python3 rsync

# Install node modules (include dev for TypeScript build)
COPY package-lock.json package.json ./
RUN npm ci --include=dev

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Build web-client (it has its own package.json)
WORKDIR /app/web-client
RUN npm ci --include=dev
RUN npm run build
WORKDIR /app


# Final stage for app image
FROM base

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 hedwig

# Copy built application
COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json

# Copy templates if they exist (for PDF generation)
COPY --from=build /app/src/templates /app/src/templates

# Copy public folder for static files
COPY --from=build /app/public /app/public

# Copy web-client build
COPY --from=build /app/web-client/dist /app/web-client/dist

# Set ownership and switch to non-root user
RUN chown -R hedwig:nodejs /app
USER hedwig

# Add health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
CMD [ "npm", "run", "start" ]