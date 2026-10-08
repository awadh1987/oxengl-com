# ==============================================================================
# Production Dockerfile for OxenGL FastAPI Backend Engine
# Optimized for 2GB RAM host with explicit worker & concurrency bounds
# ==============================================================================

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Install runtime dependencies (curl, libpq, and graphics libraries for WeasyPrint)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    postgresql-client \
    gcc \
    python3-dev \
    libpq-dev \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libffi-dev \
    shared-mime-info \
    libgdk-pixbuf-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend application source
COPY . ./backend

EXPOSE 8000

# Healthcheck for container orchestration
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health 2>/dev/null || curl -f http://localhost:8000/docs 2>/dev/null || exit 1

# Launch uvicorn with 1 worker to stay well within the 2GB host memory budget
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--limit-concurrency", "100"]
