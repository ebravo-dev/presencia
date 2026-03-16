# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./
COPY prisma ./prisma

# Install ALL dependencies (need devDeps for build)
RUN npm ci

# Generate Prisma client
RUN npm run db:generate

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim AS production

WORKDIR /app

# Install system Chromium and dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    fonts-freefont-ttf \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use system Chromium (skip downloading its own)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/start.sh ./start.sh

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Generate Prisma client for production target
RUN npx prisma generate

# Create non-root user for security
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs nodejs && \
    chmod +x ./start.sh && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["./start.sh"]
