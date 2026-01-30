# Node.js multi-stage build - backend from root context
# Build timestamp: 2026-01-30T22:45:00Z - force rebuild for Prisma schema update
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies
COPY backend/package*.json ./
RUN npm install --production=false

# Copy source and build
COPY backend/ .
RUN npm run db:generate
RUN npm run build

# Production image
FROM node:20-slim AS production
WORKDIR /app

# Install dependencies for Playwright Chromium (no chromium package itself)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # OpenSSL for Prisma
    openssl \
    # Dependencies for Playwright's Chromium
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    # Utilities
    ca-certificates \
    fonts-liberation \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Copy built application FIRST
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Copy and make start script executable
COPY backend/start.sh ./start.sh
RUN chmod +x ./start.sh

# Install Playwright system dependencies as root (before USER nodejs)
# This installs all the apt packages needed by Chromium
RUN npx playwright install-deps chromium

# Create non-root user with home directory (needed for playwright cache)
RUN groupadd -g 1001 nodejs && \
    useradd -m -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Install Playwright's Chromium binary as the nodejs user (without --with-deps)
# System deps are already installed above, this just downloads the browser
RUN npx playwright install chromium

EXPOSE 3000

CMD ["./start.sh"]
