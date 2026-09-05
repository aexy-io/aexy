FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
#
# `fonts-freefont-ttf` is for PDF export. reportlab's built-in faces are
# Latin-1 and the only TTF it bundles is Vera (283 glyphs, no Devanagari), so
# without a font here every Hindi document — the product ships `hi` — exported
# as blank rectangles, for exactly the users that locale exists for.
#
# FreeSans specifically: it is the one family in Debian whose regular *and*
# bold cover both Latin and Devanagari. NotoSansDevanagari has a bold face but
# is missing 35 basic Latin characters, so choosing it would trade the Hindi
# bug for an English one; Lohit-Devanagari covers both but ships a single face,
# which would cost every document its bold and italic.
#
# Copied into a directory of its own because AEXY_PDF_FONT_DIR registers the
# widest-covering family in whatever directory it is given — aimed at the
# system font tree, the choice would silently depend on what else is installed.
# The package is purged afterwards; only the four faces are needed.
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    fonts-freefont-ttf \
    && mkdir -p /usr/share/aexy-fonts \
    && cp /usr/share/fonts/truetype/freefont/FreeSans*.ttf /usr/share/aexy-fonts/ \
    && apt-get purge -y fonts-freefont-ttf \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Set on the image rather than in compose so the PDF font is present however
# the image is run — prod compose, a worker, or a plain `docker run`.
ENV AEXY_PDF_FONT_DIR=/usr/share/aexy-fonts

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
CMD ["uvicorn", "aexy.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
