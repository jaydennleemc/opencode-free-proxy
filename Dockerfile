# syntax=docker/dockerfile:1
# ── Build stage ──────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# Reproducible install from lockfile (never floating npm install)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ── Run stage ────────────────────────────────────────────────
FROM node:24-alpine AS run

# Minimal runtime env
ENV NODE_ENV=production \
    NODE_OPTIONS=--use-openssl-ca \
    PROXY_PORT=6446 \
    OPENCODE_PORT=4096 \
    KEYS_FILE=/data/api-keys.json

WORKDIR /app

# Drop privileges on copy — no root-owned app tree, no chown RUN
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json models.json ./
COPY --chown=node:node src ./src

# Writable dirs: keys + opencode's global state + workdir
# (rootfs can stay read-only; opencode writes under HOME)
RUN mkdir -p /data /home/node/.local/share/opencode /home/node/.config/opencode /home/node/.cache/opencode /tmp/oc-proxy-workdir \
  && chown -R node:node /data /home/node /tmp/oc-proxy-workdir

USER node

EXPOSE 6446

# Liveness: proxy + opencode session API both answering
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "Promise.all([fetch('http://127.0.0.1:'+(process.env.PROXY_PORT||6446)+'/health'),fetch('http://127.0.0.1:'+(process.env.OPENCODE_PORT||4096)+'/session')]).then(rs=>process.exit(rs.every(r=>r.ok)?0:1)).catch(()=>process.exit(1))"

# exec form — no shell, no signal loss
CMD ["node", "src/index.mjs"]
