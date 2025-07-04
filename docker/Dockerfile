# syntax=docker/dockerfile:1
FROM node:20.12.0 AS builder

WORKDIR /app

ARG VERSION=main

RUN npm install -g pnpm@10.9.0
RUN pnpm install

COPY . .

RUN sed -i 's|https://test.appflowy.cloud||g' src/components/main/app.hooks.ts
RUN pnpm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html/

# Copy nginx.conf from docker folder
COPY docker/nginx.conf /etc/nginx/nginx.conf