FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* && useradd --uid 1001 --create-home stoics
COPY --from=builder --chown=stoics:stoics /app/.next/standalone ./
COPY --from=builder --chown=stoics:stoics /app/.next/static ./.next/static
USER stoics
EXPOSE 3000
CMD ["node", "server.js"]
