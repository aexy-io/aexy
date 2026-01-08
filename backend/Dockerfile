FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy all application files first
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -e .

# Set Python path
ENV PYTHONPATH=/app/src

# Default command (can be overridden)
CMD ["uvicorn", "aexy.main:app", "--host", "0.0.0.0", "--port", "8000"]
