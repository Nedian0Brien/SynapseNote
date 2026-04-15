FROM node:20-alpine AS dev

WORKDIR /app

COPY frontend/package*.json ./
COPY frontend/start-dev.sh ./
RUN npm ci --ignore-scripts

EXPOSE 3000

CMD ["sh", "/app/start-dev.sh"]

FROM node:20-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm ci --ignore-scripts

COPY frontend ./
RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
