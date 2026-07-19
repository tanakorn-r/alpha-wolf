FROM python:3.12-slim AS wheels

WORKDIR /build

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential cmake \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt


FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=wheels /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
  && rm -rf /wheels

COPY . .

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
