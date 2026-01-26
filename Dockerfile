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

# Install Chromium for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libfreetype6 \
    libharfbuzz0b \
    ca-certificates \
    fonts-freefont-ttf \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Create non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs nodejs

USER nodejs

EXPOSE 3000

CMD ["node", "dist/app.js"]
