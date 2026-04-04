# BookReading Platform

A multilingual novel/manga reading platform with AI-powered translation (Chinese → Thai by default).

## Architecture

```
┌─────────────┐      gRPC      ┌─────────────┐      HTTP     ┌─────────────┐
│  Frontend   │ ◄───────────► │  Backend    │ ◄───────────► │ AI Service  │
│   Next.js   │               │    (Go)     │               │  (FastAPI)  │
│   :3000     │               │   :9090     │               │   :8000     │
└─────────────┘               └──────┬──────┘               └─────────────┘
                                     │
                              ┌──────▼──────┐
                              │ PostgreSQL  │
                              │   :5432     │
                              └─────────────┘
```

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, TailwindCSS
- **Backend**: Go (Golang) with Hexagonal Architecture, gRPC
- **AI Service**: Python FastAPI, BeautifulSoup (scraping)
- **Database**: PostgreSQL 15

## Features

1. **Web Scraping**: Automatically scrape novels from supported sources (piaotia.com)
2. **AI Translation**: Translate content from Chinese to Thai with terminology consistency
3. **Terminology Management**: Maintain consistent character names and terms across chapters
4. **Translation Memory**: Store translation history for better context in future chapters
5. **Reading Interface**: Clean, responsive UI for reading translated content

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local frontend development)
- Go 1.21+ (for local backend development)
- Python 3.11+ (for local AI service development)

### Using Docker (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

Access the application:
- Frontend: http://localhost:3000
- Backend gRPC: localhost:9090
- AI Service API: http://localhost:8000
- PostgreSQL: localhost:5432

### Local Development

#### 1. Database

```bash
docker run -d --name bookreading-db \
  -e POSTGRES_USER=bookreading \
  -e POSTGRES_PASSWORD=bookreading123 \
  -e POSTGRES_DB=bookreading \
  -p 5432:5432 \
  postgres:15-alpine
```

#### 2. Backend (Go)

```bash
cd backend

# Install dependencies
go mod download

# Generate protobuf code (requires protoc)
protoc --go_out=. --go_opt=paths=source_relative \
    --go-grpc_out=. --go-grpc_opt=paths=source_relative \
    proto/bookreading.proto

# Run
DATABASE_URL="postgres://bookreading:bookreading123@localhost:5432/bookreading?sslmode=disable" \
AI_SERVICE_URL="http://localhost:8000" \
go run cmd/main.go
```

#### 3. AI Service (Python)

```bash
cd ai-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Run
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### 4. Frontend (Next.js)

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```

## Project Structure

```
bookreading/
├── backend/
│   ├── cmd/
│   │   └── main.go              # Application entry point
│   ├── internal/
│   │   ├── delivery/grpc/       # gRPC handlers
│   │   ├── domain/              # Domain models & interfaces
│   │   ├── repository/postgres/ # Data access layer
│   │   ├── usecase/             # Business logic
│   │   └── infrastructure/      # External services (AI client)
│   ├── proto/                   # Protocol Buffer definitions
│   └── go.mod
├── ai-service/
│   ├── main.py                  # FastAPI application
│   ├── scrapers/                # Web scrapers
│   ├── translators/             # Translation logic
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js pages
│   │   ├── lib/                 # API client
│   │   └── styles/              # CSS styles
│   └── package.json
├── database/
│   └── init.sql                 # Database schema
└── docker-compose.yml
```

## API Endpoints

### AI Service (FastAPI)

- `POST /scrape` - Scrape novel from URL
- `POST /translate` - Translate content with terminology
- `POST /extract-terminology` - Extract terms from text
- `GET /health` - Health check

### Backend (gRPC)

See `backend/proto/bookreading.proto` for service definitions.

## Database Schema

Key tables:
- `novels` - Novel metadata
- `chapters` - Chapter content and translations
- `terminology` - Consistent term translations
- `translation_history` - Translation memory
- `user_progress` - Reading progress tracking

## Terminology System

The platform maintains translation consistency through:

1. **Manual Entry**: Users can add character names, locations, etc.
2. **Auto-Extraction**: AI extracts frequently occurring terms
3. **Context-Aware Translation**: Previous translations inform future ones
4. **Confidence Scoring**: Auto-generated terms can be reviewed/edited

## Usage Example

1. **Scrape a Novel**
   - Go to homepage
   - Paste URL: `https://www.piaotia.com/html/6/6760/`
   - Click "Scrape"

2. **Manage Terminology**
   - Go to Terminology page
   - Add character names and their Thai translations
   - These will be used consistently across all chapters

3. **Read & Translate**
   - Select a novel from the list
   - Choose a chapter
   - Click "Translate to Thai"
   - Toggle between original and translated text

## Production Considerations

### Translation Integration

The current implementation uses a simple rule-based translation. For production:

```python
# Replace simple_translate() in ai-service/main.py with:

# Option 1: Google Translate API
from google.cloud import translate
def translate_with_google(text, source, target):
    client = translate.TranslationServiceClient()
    # ... implementation

# Option 2: DeepL API
import deepl
def translate_with_deepl(text, source, target):
    translator = deepl.Translator("YOUR_API_KEY")
    # ... implementation

# Option 3: LLM (OpenAI, Claude, etc.)
import openai
def translate_with_llm(text, terminology, context):
    prompt = f"""Translate the following Chinese text to Thai.
    Use these terms consistently: {terminology}
    Previous context: {context}
    
    Text: {text}
    """
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[{"role": "user", "content": prompt}]
    )
    return response.choices[0].message.content
```

### Scalability

- Add Redis for caching translations
- Implement job queue (Celery/Bull) for background scraping/translation
- Use CDN for static assets
- Add rate limiting for scraping

### Security

- Add user authentication
- Implement API rate limiting
- Sanitize scraped content
- Use environment variables for secrets

## License

MIT
