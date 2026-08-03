# syntax=docker/dockerfile:1

FROM node:24-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npm run prisma:generate

FROM deps AS builder

COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
RUN npm run build

FROM node:24-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3100 \
    UAT_BASE_URL=https://administracionescolar.uat.edu.mx \
    UAT_HTTP_TIMEOUT_MS=30000 \
    UAT_SESSION_TTL_MINUTES=45

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force
RUN npm run prisma:generate

COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const port=process.env.PORT||3100; fetch('http://127.0.0.1:' + port + '/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "dist/scripts/start-production.js"]
