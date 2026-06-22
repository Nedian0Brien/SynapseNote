FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./app.py
COPY base_routes.py ./base_routes.py
COPY version.txt ./version.txt
COPY --from=frontend-build /frontend/dist ./public

CMD ["python", "app.py"]
