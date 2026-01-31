# Entity Identity API - Docker build

FROM node:20-alpine

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy only necessary application code (not node_modules, .git, etc.)
COPY api/ ./api/
COPY src/ ./src/
COPY build/ ./build/
COPY setup/ ./setup/

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production
ENV DB_PATH=/app/data/ei.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start server
CMD ["node", "api/server.js"]
