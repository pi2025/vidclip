FROM node:18-alpine

RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
COPY .env ./
RUN npm install --production

COPY server.js ./
COPY public/ ./public/

RUN mkdir -p uploads output logs

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server.js"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/status || exit 1
