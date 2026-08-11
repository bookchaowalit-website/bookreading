# 📚 BookReading Platform

A multilingual novel/manga reading platform with AI-powered translation (Chinese → Thai by default).

See [`PRODUCT.md`](./PRODUCT.md) for the interview case study — including
a real bug found by wiring up a test runner that had never been connected
(tests never imported the module under test), and the 2026-08-11 fix so
`cd frontend && npm test` is **35/35 green**.

## ✨ Features

### 📖 Novel Reading
- **Auto Scraping** - Scrape novels from Chinese websites (piaotia, qidian, etc.)
- **AI Translation** - Translate chapters using OpenAI/Gemini with terminology consistency
- **Auto-Update** - Automatically check for new chapters and download them
- **Reading Progress** - Track your progress, auto-saves every 30 seconds
- **Bookmarks** - Save important moments with notes
- **Keyboard Navigation** - Arrow keys to change chapters, Ctrl+T/F for settings

### 🎨 Manga Reading
- **Manga Translation** - Upload manga/mahwa and get translated versions
- **Multiple View Modes** - Webtoon, page-by-page, horizontal scrolling
- **Cross-Page Sync** - Translate in manga page, read in manga reader

### 🔧 User Experience
- **Dark Mode** - Toggle with persistence
- **Toast Notifications** - Non-blocking, beautiful notifications
- **Loading Skeletons** - Smooth loading states everywhere
- **Error Boundaries** - Graceful error handling with recovery

### 🔒 Security
- **JWT Authentication** - Secure user sessions
- **Server-Side API Keys** - API keys stored on backend, not localStorage
- **Rate Limiting** - 100 req/min (API), 10 req/min (Translation), 5 req/min (Auth)
- **CORS Protection** - Configurable allowed origins

---

## 🏗️ Architecture

```
┌─────────────┐      gRPC      ┌─────────────┐      HTTP     ┌─────────────┐
│  Frontend   │ ◄───────────► │  Backend    │ ◄───────────► │ AI Service  │
│   Next.js   │               │    (Go)     │               │  (FastAPI)  │
│   :3000     │               │ :8080/:9090 │               │   :8000     │
└─────────────┘               └──────┬──────┘               └─────────────┘
                                     │
                              ┌──────▼──────┐
                              │ PostgreSQL  │
                              │   :5432     │
                              └─────────────┘
```

### Tech Stack
| Component | Technology |
|-----------|------------|
| **Frontend** | Next.js 14, TypeScript, TailwindCSS |
| **Backend** | Go (Hexagonal Architecture), gRPC |
| **AI Service** | Python FastAPI, BeautifulSoup |
| **Database** | PostgreSQL 15 |

---

## 🚀 Quick Start

### Using Docker (Recommended)

```bash
# 1. Clone repository
git clone <your-repo-url>
cd bookreading

# 2. Configure environment
cp .env.template .env
# Edit .env with your secrets (see Configuration section)

# 3. Validate secrets
chmod +x scripts/validate-secrets.sh
./scripts/validate-secrets.sh

# 4. Run database migrations
make migrate-up

# 5. Start all services
docker-compose up -d

# 6. Open in browser
open http://localhost:3000
```

### View Services
```bash
docker-compose ps
```

### View Logs
```bash
docker-compose logs -f
docker-compose logs -f backend
docker-compose logs -f ai-service
```

### Stop Services
```bash
docker-compose down
```

---

## ⚙️ Configuration

### Environment Variables (.env)

```env
# PostgreSQL Password (REQUIRED - change from default!)
POSTGRES_PASSWORD=<generate-with: openssl rand -base64 32>

# JWT Secret (REQUIRED - change from default!)
JWT_SECRET=<generate-with: openssl rand -hex 32>

# CORS (your domain)
ALLOWED_ORIGINS=http://localhost:3000

# LLM API Keys
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
GEMINI_API_KEY=your-gemini-key
```

### Generate Secure Secrets

```bash
# PostgreSQL password
openssl rand -base64 32

# JWT secret (64 characters)
openssl rand -hex 32
```

---

## 📁 Project Structure

```
bookreading/
├── ai-service/                 # Python FastAPI - Translation & Scraping
│   ├── main.py                 # Main application
│   ├── scrapers.py             # Web scraping logic
│   ├── terminology.py           # Terminology management
│   ├── agentic_translator.py   # LLM-based translation
│   ├── manga_translator.py     # Manga OCR & translation
│   └── Dockerfile
├── backend/                    # Go - REST + gRPC API
│   ├── cmd/main.go             # Entry point
│   ├── internal/
│   │   ├── delivery/http/      # HTTP handlers
│   │   ├── delivery/grpc/      # gRPC handlers
│   │   ├── usecase/            # Business logic
│   │   ├── repository/         # Data access
│   │   ├── domain/             # Domain models
│   │   ├── middleware/          # Rate limiting, logging
│   │   └── logging/            # Structured logging
│   └── Dockerfile
├── frontend/                   # Next.js 14 - React/TypeScript
│   ├── src/
│   │   ├── app/                # Pages
│   │   ├── components/         # Reusable UI
│   │   ├── hooks/              # React hooks
│   │   ├── lib/                # API clients, types
│   │   └── providers/          # Theme, Toast providers
│   └── Dockerfile
├── database/
│   ├── migrations/             # Versioned migrations
│   └── init.sql                # Legacy init (deprecated)
├── docs/                       # API documentation
├── scripts/                    # Utility scripts
├── docker-compose.yml
└── Makefile
```

---

## 🔌 API Endpoints

### Backend (HTTP)
```
POST   /api/auth/register          - Register user
POST   /api/auth/login             - Login user
GET    /api/novels                 - List novels
POST   /api/novels                 - Scrape novel
GET    /api/chapters               - List chapters
POST   /api/chapters/translate     - Translate chapter
POST   /api/subscriptions          - Subscribe to updates
GET    /api/subscriptions          - Get subscriptions
POST   /api/reading-progress       - Save progress
GET    /api/reading-progress       - Get progress
POST   /api/bookmarks              - Add bookmark
DELETE /api/bookmarks              - Remove bookmark
POST   /api/feedback               - Submit feedback
GET    /api/feedback/quality-score - Get quality score
POST   /api/settings/api-keys      - Save API key
GET    /api/settings/api-keys      - Get key prefixes
GET    /api/health                 - Health check
GET    /api/ready                  - Ready check
```

### AI Service
```
POST   /scrape                     - Scrape novel
POST   /translate                  - Translate text
POST   /translate/agentic          - Agentic translation
POST   /translate/pipeline         - Pipeline translation
POST   /manga/translate            - Translate manga image
GET    /health                     - Health check
```

---

## 🧪 Development

### Run Migrations
```bash
make migrate-up          # Apply all pending
make migrate-down        # Rollback last
make migrate-status      # Check status
make migrate-create NAME=add_something  # Create new
```

### Run Tests
```bash
# Backend
cd backend && go test ./...

# AI Service
cd ai-service && pytest -v

# Frontend (Vitest — 35 unit tests as of 2026-08-11)
cd frontend && npm test
```

### Lint
```bash
# Backend
cd backend && golangci-lint run

# AI Service
cd ai-service && ruff check .

# Frontend
cd frontend && npm run lint
```

---

## 🚢 Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete production deployment guide including:
- SSL/HTTPS configuration
- Nginx reverse proxy
- Database backups
- Monitoring
- Scaling

---

## 📊 Features Implemented

### Phase 1: Security & Quality ✅
- [x] Remove hardcoded secrets
- [x] CORS configuration from environment
- [x] API keys moved to backend
- [x] Structured logging
- [x] Error handling improvements
- [x] Toast notifications
- [x] Loading skeletons

### Phase 2: Core Features ✅
- [x] Auto-update novel tracking
- [x] Reading progress & bookmarks
- [x] Translation quality feedback
- [x] Keyboard navigation (reader)
- [x] Rate limiting (APIs)
- [x] Health checks with dependencies
- [x] Manga reader connected to translator

### Phase 3: Production Ready ✅
- [x] Settings page uses backend API keys
- [x] Production deployment guide
- [x] Database migrations
- [x] CI/CD pipelines
- [x] Comprehensive documentation

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment guide |
| [IMPROVEMENTS.md](./IMPROVEMENTS.md) | All improvements made |
| [NEW_FEATURES.md](./NEW_FEATURES.md) | New features guide |
| [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) | Frontend integration guide |
| [UI_UX_FIXES_COMPLETE.md](./UI_UX_FIXES_COMPLETE.md) | UI/UX fixes documentation |
| [PHASE1_COMPLETE.md](./PHASE1_COMPLETE.md) | Phase 1 summary |
| [PHASE2_COMPLETE.md](./PHASE2_COMPLETE.md) | Phase 2 summary |
| [BACKEND_HANDLERS_COMPLETE.md](./BACKEND_HANDLERS_COMPLETE.md) | Backend handlers guide |
| [docs/API.md](./docs/API.md) | API documentation |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---

**Version:** 3.0.0  
**Last Updated:** April 11, 2026  
**Status:** Production Ready ✅
