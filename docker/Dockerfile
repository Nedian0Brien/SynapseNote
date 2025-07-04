# syntax=docker/dockerfile:1
FROM node:20.12.0 AS builder

WORKDIR /app

ARG VERSION=main

COPY . .
RUN corepack enable
RUN pnpm install


RUN sed -i 's|https://test.appflowy.cloud||g' src/components/main/app.hooks.ts
RUN pnpm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html/
COPY --from=builder /app/docker/nginx.conf /etc/nginx/nginx.conf
