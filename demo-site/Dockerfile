# ── Stage 1: Build the React app ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Only install production dependencies (express)
COPY package*.json ./
RUN npm install --omit=dev

# Copy built React files and the serve script
COPY --from=builder /app/dist ./dist
COPY serve.js ./

# Volume for persisted state.json (shared with automation container)
VOLUME ["/data"]

ENV PORT=8080
ENV STATE_FILE=/data/state.json

EXPOSE 8080

CMD ["node", "serve.js"]
