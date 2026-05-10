# syntax=docker/dockerfile:1.7

# ==========================================
# Stage 1: Builder - Install dependencies
# ==========================================
FROM oven/bun:1 AS builder
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Copy only dependency files first for better caching
COPY package.json bun.lock ./

# Install dependencies (frozen lockfile for consistency)
RUN bun install --frozen-lockfile --production

# ==========================================
# Stage 2: Runner - Lightweight production image
# ==========================================
FROM oven/bun:1-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Metadata labels
LABEL org.opencontainers.image.source="https://github.com/yuramedia/autoclaim-bot"
LABEL org.opencontainers.image.description="Discord bot for automated game claims"
LABEL org.opencontainers.image.licenses="MIT"

# Install dumb-init for proper signal handling and setup non-root user
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S bunjs && \
    adduser -S botuser -u 1001 -G bunjs && \
    mkdir -p /app/logs /app/data && \
    chown -R botuser:bunjs /app

# Copy dependencies from builder
COPY --from=builder --chown=botuser:bunjs /app/node_modules ./node_modules

# Copy source code and config
COPY --chown=botuser:bunjs package.json tsconfig.json ./
COPY --chown=botuser:bunjs src ./src

# Switch to non-root user for security
USER botuser

# Start with dumb-init for proper signal handling (SIGTERM/SIGKILL)
CMD ["dumb-init", "bun", "run", "src/index.ts"]
