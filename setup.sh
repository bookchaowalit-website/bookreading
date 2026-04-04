#!/bin/bash

# BookReading Platform - Setup Script

set -e

echo "📚 BookReading Platform - Setup"
echo "================================"

# Check for required tools
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required but not installed."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo "❌ Docker Compose is required but not installed."; exit 1; }

echo "✅ Docker and Docker Compose found"

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p backend/pkg
mkdir -p ai-service/cache

# Build and start services
echo "🚀 Starting services with Docker Compose..."
docker-compose up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check service health
echo "🏥 Checking service health..."
docker-compose ps

echo ""
echo "✅ Setup complete!"
echo ""
echo "📱 Access the application:"
echo "   Frontend:    http://localhost:3000"
echo "   Backend:     localhost:9090 (gRPC)"
echo "   AI Service:  http://localhost:8000"
echo "   PostgreSQL:  localhost:5432"
echo ""
echo "📖 See README.md for usage instructions"
echo ""
echo "📝 Useful commands:"
echo "   docker-compose logs -f     # View logs"
echo "   docker-compose down        # Stop services"
echo "   docker-compose restart     # Restart services"
