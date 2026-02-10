# Build Stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy dependency files first for caching
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN cd backend && npm install
RUN cd frontend && npm install

# Copy source code
COPY . .

# Build frontend
RUN cd frontend && npm run build

# Final Stage
FROM node:20-slim
WORKDIR /app

# Copy build artifacts and backend
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/dist ./frontend/dist
# Copy root package.json if needed by PaaS
COPY package.json ./

# Change workdir to backend to run the server
WORKDIR /app/backend
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
