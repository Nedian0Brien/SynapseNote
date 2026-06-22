FROM alpine:3.18

RUN apk add --no-cache rclone tar tzdata

ENV TZ=UTC

WORKDIR /app
COPY backup.sh .
COPY entrypoint.sh .
RUN chmod +x backup.sh entrypoint.sh

CMD ["/app/entrypoint.sh"]
