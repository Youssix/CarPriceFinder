# Stage 1: Build dashboard (React/Vite SPA)
FROM node:20-alpine AS dashboard-build
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine
WORKDIR /app

# Install server dependencies only
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/ ./

# Copy built dashboard from stage 1
COPY --from=dashboard-build /app/dashboard/dist /app/public/dashboard

# Copy landing page static files
COPY landing/ /app/public/landing

ENV NODE_ENV=production
ENV PORT=9001

EXPOSE 9001

# Health check using wget (available in alpine)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9001/api/health || exit 1

CMD ["node", "lbcScraper.js"]
