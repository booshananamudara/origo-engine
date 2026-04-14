FROM python:3.11-slim

WORKDIR /app

# System deps for asyncpg / psycopg build
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (cache layer)
COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -e ".[dev]"

# Copy source
COPY . .

EXPOSE 8000
