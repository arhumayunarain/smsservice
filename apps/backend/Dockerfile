# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and prisma schema
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Remove dev dependencies
RUN npm prune --omit=dev

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Copy pruned production node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy Prisma schema (needed for migrate deploy at runtime)
COPY prisma ./prisma

EXPOSE 3001

CMD ["node", "dist/main"]
