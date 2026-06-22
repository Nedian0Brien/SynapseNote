FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ARG SYNAPSENOTE_BUILD_COMMIT=unknown
LABEL org.opencontainers.image.revision=$SYNAPSENOTE_BUILD_COMMIT

ENV PORT=8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
