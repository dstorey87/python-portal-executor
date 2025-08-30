# Python Portal Executor - Docker Configuration
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM python:3.11-alpine AS production

# Install Node.js in Python image
RUN apk add --no-cache nodejs npm

# Create non-root user for security
RUN addgroup -g 1001 -S executor && \
    adduser -S executor -u 1001 -G executor

# Create necessary directories
RUN mkdir -p /app /tmp/python-portal && \
    chown -R executor:executor /app /tmp/python-portal

WORKDIR /app

# Copy production files from builder
COPY --from=builder --chown=executor:executor /app/dist ./dist
COPY --from=builder --chown=executor:executor /app/node_modules ./node_modules
COPY --from=builder --chown=executor:executor /app/package.json ./

# Install Python security packages
RUN apk add --no-cache \
    # Security tools
    coreutils \
    util-linux \
    # Memory monitoring
    procps \
    # Network security
    iptables \
    # Clean up
    && rm -rf /var/cache/apk/*

# Configure Python security
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
    # Standard library only - no external packages for security
    && rm -rf /root/.cache

# Security: Remove unnecessary packages and files
RUN apk del --purge \
    # Remove build tools that aren't needed in runtime
    && rm -rf /var/cache/apk/* \
    && rm -rf /tmp/* \
    && rm -rf /root/.npm \
    && rm -rf /root/.cache

# Set up resource limits
RUN echo "executor hard nproc 100" >> /etc/security/limits.conf && \
    echo "executor hard nofile 1024" >> /etc/security/limits.conf && \
    echo "executor hard fsize 10240" >> /etc/security/limits.conf && \
    echo "executor hard memlock 16384" >> /etc/security/limits.conf

# Switch to non-root user
USER executor

# Environment configuration
ENV NODE_ENV=production \
    PORT=3002 \
    EXECUTION_TIMEOUT=10000 \
    MEMORY_LIMIT=128 \
    MAX_OUTPUT_LENGTH=10000 \
    MAX_CODE_LENGTH=50000 \
    ENABLE_SANDBOX=true \
    PYTHON_PATH=python3 \
    RATE_LIMIT_WINDOW=60000 \
    RATE_LIMIT_MAX=100 \
    MAX_CONCURRENT_EXECUTIONS=10

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 3002, path: '/health/live', timeout: 5000 }; \
    const req = http.request(options, (res) => { \
        process.exit(res.statusCode === 200 ? 0 : 1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();"

# Expose port
EXPOSE 3002

# Start the application
CMD ["node", "dist/server.js"]

# Security labels
LABEL \
    name="python-portal-executor" \
    version="1.0.0" \
    description="Secure Python code execution microservice" \
    maintainer="Python Portal Team" \
    security.scan="enabled" \
    security.non-root="true" \
    security.read-only="true"