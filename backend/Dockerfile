# Build stage
FROM node:24-slim AS builder

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
FROM node:24-slim AS production

WORKDIR /app

# Install minimal system dependencies needed for healthcheck and TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/start.sh ./start.sh

# Install ONLY production dependencies
RUN npm ci --omit=dev

# Generate Prisma client for production target
RUN ./node_modules/.bin/prisma generate

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
