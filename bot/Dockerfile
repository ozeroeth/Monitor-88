FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ ./src/

# Koyeb requires a port for health check even if bot doesn't serve HTTP
# We add a minimal health endpoint
ENV PORT=8000
EXPOSE 8000

CMD ["node", "src/index.js"]
