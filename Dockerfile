# ── Build stage ──────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --production

# ── Run stage ────────────────────────────────────────────────
FROM node:24-alpine AS run
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY models.json ./
COPY src ./src
RUN mkdir -p /data && chown -R node:node /app /data
EXPOSE 6446
USER node
CMD ["node", "src/index.mjs"]
