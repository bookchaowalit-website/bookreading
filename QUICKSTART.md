# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Option 1: Docker (Easiest)

```bash
# Clone or navigate to the project
cd bookreading

# Run the setup script
./setup.sh

# Or manually with docker-compose
docker-compose up -d --build
```

### Option 2: Manual Setup

#### 1. Start Database
```bash
docker run -d --name bookreading-db \
  -e POSTGRES_USER=bookreading \
  -e POSTGRES_PASSWORD=bookreading123 \
  -e POSTGRES_DB=bookreading \
  -p 5432:5432 \
  postgres:15-alpine
```

#### 2. Start AI Service
```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### 3. Start Backend
```bash
cd backend
go mod download
# Generate protobuf (if needed)
protoc --go_out=. --go_opt=paths=source_relative \
    --go-grpc_out=. --go-grpc_opt=paths=source_relative \
    proto/bookreading.proto
# Run
go run cmd/main.go
```

#### 4. Start Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📖 Using the Platform

### 1. Scrape a Novel

1. Go to http://localhost:3000
2. Paste a novel URL (e.g., `https://www.piaotia.com/html/6/6760/`)
3. Click "Scrape"
4. Wait for scraping to complete

### 2. Add Terminology (Important for Consistent Translation)

1. Click "Terminology" in the navigation
2. Click "Add Term"
3. Add character names and their Thai translations:
   - **Original Term**: 萧炎 (Chinese name)
   - **Term**: Xiao Yan (Romanized)
   - **Translation**: เซียวเหยียน (Thai)
   - **Type**: character
4. Repeat for other characters, locations, special terms

### 3. Read and Translate

1. Click on a novel from the home page or novels list
2. Select a chapter
3. Click "Translate to Thai"
4. Read the translated content
5. Toggle between original and translated text

## 🔧 Troubleshooting

### Frontend won't start
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend connection error
```bash
# Check if database is running
docker ps | grep bookreading-db

# Check database logs
docker logs bookreading-db

# Restart database
docker-compose restart postgres
```

### AI Service scraping fails
- The website structure may have changed
- Check `ai-service/main.py` scraping selectors
- Some sites may have anti-scraping measures

### Translation not working
- The current implementation uses a simple rule-based translation
- For real translation, integrate with Google Translate API, DeepL, or an LLM
- See README.md "Production Considerations" section

## 📝 Example Terminology

For "Battle Through the Heavens" (斗破苍穹):

| Original (Chinese) | Romanized | Thai Translation | Type |
|-------------------|-----------|------------------|------|
| 萧炎 | Xiao Yan | เซียวเหยียน | character |
| 薰儿 | Xun Er | ซวินเอ๋อร์ | character |
| 加玛帝国 | Jia Ma Empire | จักรวรรดิเจียหม่า | location |
| 斗之气 | Dou Zhi Qi | พลังลมปราณโต้ว | technique |
| 药老 | Yao Lao | เยาเหล่า | character |

## 🎯 Next Steps

1. **Scrape your first novel** from piaotia.com
2. **Add terminology** for consistent translation
3. **Translate chapters** and read
4. **Customize** the translation service for better quality

## 🆘 Need Help?

- Check the full README.md for detailed documentation
- Review the architecture diagram
- Examine the database schema in `database/init.sql`
