#!/bin/sh
set -e

echo "🔐 Validating environment variables..."

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "your-production-jwt-secret-change-this" ]; then
    echo "❌ ERROR: JWT_SECRET is not set or using default value!"
    echo "   Please set a secure JWT_SECRET (at least 32 characters)"
    echo "   Generate one with: openssl rand -hex 32"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL is not set!"
    exit 1
fi

echo "✅ Environment variables validated"

# Start the server
exec "$@"
