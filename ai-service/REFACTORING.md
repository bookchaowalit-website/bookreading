# AI Service Refactoring Guide

## Current State
- `main.py` has 2,958 lines
- Contains: scraping, translation, terminology, manga OCR, review queue, context management, health checks

## Completed Modules
✅ `scrapers.py` - Web novel scraping logic
✅ `terminology.py` - Terminology management
✅ `routes.py` - Basic route definitions (needs expansion)

## Remaining Modules to Create
- [ ] `translation_routes.py` - Translation endpoints (/translate, /translate/agentic)
- [ ] `context_routes.py` - Context management endpoints (/context/*)
- [ ] `review_routes.py` - Review queue endpoints (/review/*)
- [ ] `manga_routes.py` - Manga translation endpoints (/manga/*)
- [ ] `models.py` - Pydantic models (currently in main.py)

## How to Complete the Refactor

### Step 1: Extract Pydantic Models
Create `models.py` and move all BaseModel classes from main.py (lines ~137-2000)

### Step 2: Extract Route Handlers
For each endpoint group:
1. Find all endpoints related to that feature in main.py
2. Move the logic to the corresponding routes file
3. Update imports in main.py

### Step 3: Update main.py
After extraction, main.py should be:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from routes import register_routes
from scrapers import register_scraper_routes
from translation_routes import register_translation_routes
from manga_routes import register_manga_routes
from review_routes import register_review_routes
from context_routes import register_context_routes

app = FastAPI(title="BookReading AI Service", version="1.0.0")

# CORS setup
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
register_routes(app)

# Startup/shutdown events
@app.on_event("startup")
async def startup():
    pass

@app.on_event("shutdown")
async def shutdown():
    pass
```

### Step 4: Test Everything
```bash
cd ai-service
python -m pytest test_pipeline.py -v
```

## Benefits
- Each module < 500 lines
- Easier to test
- Clear separation of concerns
- Follows structure mentioned in README
