# Build Stage
FROM node:20-slim AS builder
WORKDIR /app

# Copy all files
COPY . .

# Build frontend
RUN cd frontend && npm install && npm run build

# Final Stage
FROM node:20-slim
WORKDIR /app

# Copy backend and frontend build
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/frontend/dist ./frontend/dist

# Install backend dependencies
RUN cd backend && npm install --production

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "backend/server.js"]
