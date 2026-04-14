#!/bin/bash
# Validate that critical secrets are not using default values
# This script should be run before starting services in production

set -e

echo "🔐 Validating environment variables..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "   Copy .env.template to .env and configure it:"
    echo "   cp .env.template .env"
    exit 1
fi

# Source .env file
source .env

ERRORS=0

# Validate POSTGRES_PASSWORD
if [ "$POSTGRES_PASSWORD" = "bookreading123" ] || [ "$POSTGRES_PASSWORD" = "CHANGE_ME_TO_SECURE_PASSWORD" ]; then
    echo "❌ POSTGRES_PASSWORD is using default value! Please change it."
    ERRORS=$((ERRORS + 1))
fi

# Validate JWT_SECRET
if [ "$JWT_SECRET" = "your-production-jwt-secret-change-this" ] || [ "$JWT_SECRET" = "CHANGE_ME_TO_SECURE_JWT_SECRET" ]; then
    echo "❌ JWT_SECRET is using default value! Generate a secure one:"
    echo "   openssl rand -hex 32"
    ERRORS=$((ERRORS + 1))
fi

# Validate API Keys are set
if [ -z "$OPENAI_API_KEY" ] && [ "$LLM_PROVIDER" = "openai" ]; then
    echo "⚠️  OPENAI_API_KEY is not set but LLM_PROVIDER is 'openai'"
fi

if [ -z "$GEMINI_API_KEY" ] && [ "$LLM_PROVIDER" = "gemini" ]; then
    echo "⚠️  GEMINI_API_KEY is not set but LLM_PROVIDER is 'gemini'"
fi

# Check password strength
if [ ${#POSTGRES_PASSWORD} -lt 16 ]; then
    echo "⚠️  POSTGRES_PASSWORD should be at least 16 characters"
    ERRORS=$((ERRORS + 1))
fi

if [ ${#JWT_SECRET} -lt 32 ]; then
    echo "⚠️  JWT_SECRET should be at least 32 characters"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "❌ Validation failed with $ERRORS error(s). Please fix them before starting services."
    exit 1
fi

echo "✅ All security validations passed!"
exit 0
