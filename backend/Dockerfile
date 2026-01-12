FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for running the application
RUN groupadd -r aexy && useradd -r -g aexy aexy

# Copy all application files first
COPY . .

# Install Python dependencies
RUN pip install --no-cache-dir -e .

# Set ownership of the app directory
RUN chown -R aexy:aexy /app

# Set Python path
ENV PYTHONPATH=/app/src

# Switch to non-root user
USER aexy

# Default command (can be overridden)
CMD ["uvicorn", "aexy.main:app", "--host", "0.0.0.0", "--port", "8000"]
