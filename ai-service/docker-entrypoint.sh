#!/bin/sh
set -e

echo "🔐 Validating environment variables..."

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL is not set!"
    exit 1
fi

# Check that at least one API key is set if LLM is used
if [ "$LLM_PROVIDER" = "openai" ] && [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  WARNING: LLM_PROVIDER is 'openai' but OPENAI_API_KEY is not set"
fi

if [ "$LLM_PROVIDER" = "gemini" ] && [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  WARNING: LLM_PROVIDER is 'gemini' but GEMINI_API_KEY is not set"
fi

echo "✅ Environment variables validated"

# Start the server
exec "$@"
