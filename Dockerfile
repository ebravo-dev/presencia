# Node.js multi-stage build - backend from root context
# Build timestamp: 2026-01-26T02:57:00Z - force rebuild
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

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

# Install Playwright's Chromium as the nodejs user (after USER nodejs)
# This ensures it's installed in /home/nodejs/.cache/ms-playwright
RUN npx playwright install chromium --with-deps

EXPOSE 3000

CMD ["./start.sh"]
