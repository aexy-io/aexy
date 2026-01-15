#!/bin/sh
# PostgreSQL Restore Script for Aexy
# Usage: ./restore.sh [backup_file.sql.gz]

set -e

# Configuration from environment
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-aexy}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"
POSTGRES_DB="${POSTGRES_DB:-aexy}"
BACKUP_DIR="/backup/dumps"

# Set password for psql
export PGPASSWORD="$POSTGRES_PASSWORD"

# Function to list available backups
list_backups() {
    echo "Available backups:"
    echo "===================="
    ls -lht "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No backups found"
    echo ""
}

# Check if backup file was provided
if [ -z "$1" ]; then
    echo "Usage: ./restore.sh <backup_file.sql.gz>"
    echo ""
    list_backups
    echo "Example: ./restore.sh dumps/aexy_20240115_020000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Check if it's a relative path, prepend backup dir
if [ ! -f "$BACKUP_FILE" ]; then
    BACKUP_FILE="$BACKUP_DIR/$1"
fi

# Verify backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    echo ""
    list_backups
    exit 1
fi

echo "=========================================="
echo "PostgreSQL Restore"
echo "Date: $(date)"
echo "Backup file: $BACKUP_FILE"
echo "Target database: $POSTGRES_DB"
echo "=========================================="
echo ""
echo "WARNING: This will OVERWRITE all data in the database '$POSTGRES_DB'!"
echo "Press Ctrl+C within 10 seconds to cancel..."
sleep 10

echo ""
echo "Starting restore..."

# Drop and recreate database
echo "Dropping existing database..."
psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $POSTGRES_DB;"

echo "Creating fresh database..."
psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB;"

# Restore from backup
echo "Restoring from backup..."
gunzip -c "$BACKUP_FILE" | psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo ""
echo "=========================================="
echo "Restore completed successfully!"
echo "Date: $(date)"
echo "=========================================="
