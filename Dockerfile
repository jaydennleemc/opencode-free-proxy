# ── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --production

# ── Run stage ────────────────────────────────────────────────
FROM node:20-alpine AS run
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY server.mjs models.json ./
RUN chown node:node /app /app/*.json /app/*.mjs
EXPOSE 6446
USER node
CMD ["node", "server.mjs"]
