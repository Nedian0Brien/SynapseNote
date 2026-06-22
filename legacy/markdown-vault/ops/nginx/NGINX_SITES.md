# Nginx site configs for obsidian stack

`/etc/nginx/sites-available/`에 아래 3개 사이트 파일을 만들고,
`/etc/nginx/sites-enabled/`에 심볼릭 링크를 연결합니다.

모든 백엔드는 compose에서 `127.0.0.1` 바인딩이므로 외부 노출은 nginx만 담당합니다.

## `n8n.lawdigest.cloud`

```nginx
server {
    server_name n8n.lawdigest.cloud;

    access_log /var/log/nginx/n8n.lawdigest.cloud.access.log;
    error_log /var/log/nginx/n8n.lawdigest.cloud.error.log;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300;
        proxy_send_timeout 300;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/n8n.lawdigest.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.lawdigest.cloud/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = n8n.lawdigest.cloud) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name n8n.lawdigest.cloud;
    return 404;
}
```

## `couchdb.lawdigest.cloud`

```nginx
server {
    server_name couchdb.lawdigest.cloud;

    access_log /var/log/nginx/couchdb.lawdigest.cloud.access.log;
    error_log /var/log/nginx/couchdb.lawdigest.cloud.error.log;

    location / {
        proxy_pass http://127.0.0.1:5984;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/couchdb.lawdigest.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/couchdb.lawdigest.cloud/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = couchdb.lawdigest.cloud) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name couchdb.lawdigest.cloud;
    return 404;
}
```

## `obsidian.lawdigest.cloud` (Web Editor)

```nginx
server {
    server_name obsidian.lawdigest.cloud;

    access_log /var/log/nginx/obsidian.lawdigest.cloud.access.log;
    error_log /var/log/nginx/obsidian.lawdigest.cloud.error.log;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/obsidian.lawdigest.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/obsidian.lawdigest.cloud/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = obsidian.lawdigest.cloud) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name obsidian.lawdigest.cloud;
    return 404;
}
```

## `synapse.lawdigest.cloud` (Synapse (dev/preprod) Access)

```nginx
server {
    server_name synapse.lawdigest.cloud;

    access_log /var/log/nginx/synapse.lawdigest.cloud.access.log;
    error_log /var/log/nginx/synapse.lawdigest.cloud.error.log;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_cache_bypass $http_upgrade;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/synapse.lawdigest.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/synapse.lawdigest.cloud/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = synapse.lawdigest.cloud) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name synapse.lawdigest.cloud;
    return 404;
}
```

## `synapse-dev.lawdigest.cloud` (Vite Dev Server)

```nginx
server {
    server_name synapse-dev.lawdigest.cloud;

    access_log /var/log/nginx/synapse-dev.lawdigest.cloud.access.log;
    error_log /var/log/nginx/synapse-dev.lawdigest.cloud.error.log;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
        proxy_cache_bypass $http_upgrade;
    }

    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/synapse-dev.lawdigest.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/synapse-dev.lawdigest.cloud/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

server {
    if ($host = synapse-dev.lawdigest.cloud) {
        return 301 https://$host$request_uri;
    }

    listen 80;
    listen [::]:80;
    server_name synapse-dev.lawdigest.cloud;
    return 404;
}
```

이 설정은 브라우저 Basic Auth를 쓰지 않고, 앱 내부 `/api/auth/*` 로그인 화면을 그대로 사용한다.

Vite 실행 예시:

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend
npm run dev:remote
```

## 참고
- `notes.lawdigest.cloud -> 127.0.0.1:27123` 구성은 현재 이 compose 스택 범위에 포함되지 않습니다.
- 필요 시 별도 서비스(예: 로컬 옵시디언 원격 액세스)용으로 별도 사이트 파일을 관리하세요.

## Recommended hardening
- `n8n.lawdigest.cloud`, `obsidian.lawdigest.cloud`에 Cloudflare Access 또는 추가 인증 계층 적용
- `couchdb.lawdigest.cloud`는 가능하면 소스 IP 제한
- LiveSync/CouchDB/N8N 인증정보는 모두 고유하고 긴 값 사용
