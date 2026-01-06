# Stage 1: Build the Application
FROM node:22 AS build

# Set the working directory
WORKDIR /usr/src/app

# Install system dependencies required by Expo modules
# 'rsync' is required for the expo-module prepare script
RUN apt-get update && apt-get install -y rsync && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies needed for build)
RUN npm install

# Copy the rest of the application source code
COPY . .

# Stage 2: Create the Final Production Image
FROM node:22-slim

WORKDIR /usr/src/app

# Copy built application and modules from build stage
COPY --from=build /usr/src/app .

# Set environment variables
ENV NODE_ENV=production
# Match the internal_port in fly.toml
ENV PORT=3000
EXPOSE 3000

# Secure the container by running as a non-root user
USER node

# Add health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
# Note: Ensure "npm run start" or "node index.js" is appropriate for your app
CMD [ "npm", "run", "start" ]