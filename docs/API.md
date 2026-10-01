# API Documentation

## Overview

The BookReading platform provides two types of APIs:
1. **REST API** (HTTP) - For web frontend and general operations
2. **gRPC API** - For high-performance internal communication

## REST API

### Base URL
- Development: `http://localhost:8080`
- Production: `https://api.bookreading.app`

### Authentication

Most endpoints require JWT authentication via the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

### Endpoints

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy"
}
```

---

#### Authentication

**Register:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "User Name"
}
```

**Login:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name"
  }
}
```

---

#### Novels

**List Novels:**
```http
GET /api/novels?page=1&limit=20
```

**Scrape Novel:**
```http
POST /api/novels
Content-Type: application/json

{
  "url": "https://www.piaotia.com/book/123",
  "source_lang": "zh"
}
```

**Get Novel Details:**
```http
GET /api/novels/detail?id=novel_id
```

---

#### Chapters

**List Chapters:**
```http
GET /api/chapters?novel_id=123
```

**Get Chapter:**
```http
GET /api/chapters/detail?id=chapter_id
```

**Get Chapter by Number:**
```http
GET /api/chapters/by-number?novel_id=123&chapter_number=5
```

**Translate Chapter:**
```http
POST /api/chapters/translate
Authorization: Bearer <token>
Content-Type: application/json

{
  "novel_id": "123",
  "chapter_number": 5,
  "translator_type": "agentic"
}
```

---

#### Library

**Get User Library:**
```http
GET /api/library
Authorization: Bearer <token>
```

**Add to Library:**
```http
POST /api/library
Authorization: Bearer <token>
Content-Type: application/json

{
  "novel_id": "123"
}
```

**Remove from Library:**
```http
DELETE /api/library
Authorization: Bearer <token>
Content-Type: application/json

{
  "novel_id": "123"
}
```

---

#### Terminology

**Get Terminology:**
```http
GET /api/terminology
Authorization: Bearer <token>
```

**Add Terminology:**
```http
POST /api/terminology
Authorization: Bearer <token>
Content-Type: application/json

{
  "original_term": "云澈",
  "translation": "หยุนเช่อ",
  "term_type": "character",
  "description": "Main protagonist"
}
```

**Delete Terminology:**
```http
DELETE /api/terminology
Authorization: Bearer <token>
Content-Type: application/json

{
  "term_id": "uuid"
}
```

---

## gRPC API

### Connection
- Address: `localhost:9090`
- Protocol: HTTP/2

### Services

#### BookReadingService

```protobuf
service BookReadingService {
  rpc ListNovels(ListNovelsRequest) returns (ListNovelsResponse);
  rpc GetNovel(GetNovelRequest) returns (GetNovelResponse);
  rpc ScrapeNovel(ScrapeNovelRequest) returns (ScrapeNovelResponse);
  rpc ListChapters(ListChaptersRequest) returns (ListChaptersResponse);
  rpc TranslateChapter(TranslateChapterRequest) returns (TranslateChapterResponse);
}
```

### Proto Files

See `proto/bookreading.proto` for the complete protocol buffer definitions.

### Example Usage

```go
conn, err := grpc.Dial("localhost:9090", grpc.WithTransportCredentials(insecure.NewCredentials()))
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

client := pb.NewBookReadingServiceClient(conn)

resp, err := client.ListNovels(context.Background(), &pb.ListNovelsRequest{
    Page:  1,
    Limit: 20,
})
```

---

## AI Service API

### Base URL
- Browser / frontend: `{BACKEND_URL}/api/ai` (for example
  `POST /api/ai/translate`). The backend requires a logged-in session
  (`auth_token` cookie or `Authorization: Bearer <jwt>`), then forwards to
  ai-service with `Authorization: Bearer $AI_SERVICE_TOKEN`. Only the paths the frontend
  uses are allow-listed (`aiProxyRoutes` in
  `backend/internal/delivery/http/ai_proxy_handler.go`); others return 404.
  Request bodies are capped at 2 MiB (32 MiB for manga image routes). The
  manga health/supported-* metadata routes are public.
  `POST /api/ai/review/approve|edit|reject` additionally require the admin
  role (403 otherwise, checked against the current user record); see
  `ADMIN_EMAILS` in `.env.example`.
- Service-to-service only: `http://ai-service:8000` (development:
  `http://localhost:8000`, loopback-bound). Not for browsers.

### Endpoints

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "ai-service"
}
```

#### Scrape Novel
```http
POST /scrape
Content-Type: application/json

{
  "url": "https://www.piaotia.com/book/123",
  "source_lang": "zh"
}
```

#### Translate Content
```http
POST /translate
Content-Type: application/json

{
  "text": "这是一段需要翻译的文本",
  "source_lang": "zh",
  "target_lang": "th",
  "terminology": [
    {
      "original": "云澈",
      "translation": "หยุนเช่อ",
      "type": "character"
    }
  ]
}
```

#### Agentic Translation
```http
POST /translate/agentic
Content-Type: application/json

{
  "text": "这是一段需要翻译的文本",
  "source_lang": "zh",
  "target_lang": "th",
  "novel_id": "novel_123",
  "chapter_number": 5,
  "llm_provider": "openai",
  "model": "gpt-4o"
}
```

#### Pipeline Translation
```http
POST /translate/pipeline
Content-Type: application/json

{
  "text": "这是一段需要翻译的文本",
  "novel_id": "novel_123",
  "chapter_number": 5,
  "model": "gpt-4o",
  "target_quality": "A"
}
```

#### Manga Translation
```http
POST /manga/translate
Content-Type: application/json

{
  "image_base64": "<base64_encoded_image>",
  "source_lang": "japanese",
  "target_lang": "thai"
}
```

---

## Error Responses

All APIs return standardized error responses:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200  | Success |
| 400  | Bad Request - Invalid input |
| 401  | Unauthorized - Missing or invalid token |
| 403  | Forbidden - Insufficient permissions |
| 404  | Not Found - Resource doesn't exist |
| 500  | Internal Server Error |

---

## Rate Limiting

- **REST API**: 100 requests per minute per user
- **AI Service**: 10 requests per minute (LLM API limits apply)
- **gRPC**: No rate limiting (internal use only)

---

## OpenAPI/Swagger

For interactive API documentation, run:
```bash
# Generate Swagger UI
docker run --rm -p 8080:8080 \
  -e SWAGGER_JSON=/tmp/openapi.yaml \
  -v $(pwd)/docs/openapi.yaml:/tmp/openapi.yaml \
  swaggerapi/swagger-ui
```

Then open `http://localhost:8080` in your browser.
