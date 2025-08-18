# syntax=docker/dockerfile:1
FROM node:20.12.0 AS builder

WORKDIR /app

ARG VERSION=main

COPY . .
RUN corepack enable
RUN pnpm install

# Build without environment variables - they will be injected at runtime
RUN pnpm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html/
COPY --from=builder /app/docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/docker/entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Set the entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
