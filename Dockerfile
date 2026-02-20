FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

WORKDIR /app

COPY backend/requirements-server.txt /app/backend/requirements-server.txt
RUN pip install --no-cache-dir -r /app/backend/requirements-server.txt

COPY backend /app/backend
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Optional persistent data root for history/ops store/backups:
#   WORKBOOST_DATA_DIR=/data
ENV WORKBOOST_DATA_DIR=/data
RUN mkdir -p /data

WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
