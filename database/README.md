# Database Migrations

This directory contains database migrations using [golang-migrate](https://github.com/golang-migrate/migrate).

## Directory Structure

```
database/
├── migrations/
│   ├── 001_create_users_table.up.sql
│   ├── 001_create_users_table.down.sql
│   ├── 002_create_novels_table.up.sql
│   ├── 002_create_novels_table.down.sql
│   └── ...
├── init.sql (legacy - will be deprecated)
└── README.md (this file)
```

## Installing golang-migrate

### macOS
```bash
brew install golang-migrate
```

### Linux
```bash
curl -L https://github.com/golang-migrate/migrate/releases/download/v4.17.0/migrate.linux-amd64.tar.gz | tar xvz
sudo mv migrate /usr/local/bin/
```

### Docker
```bash
docker run --rm -v $(pwd)/database/migrations:/migrations migrate/migrate
```

## Creating a New Migration

```bash
# Create up/down migration files
migrate create -ext sql -dir database/migrations -seq add_chapters_table
```

This will create:
- `database/migrations/003_add_chapters_table.up.sql`
- `database/migrations/003_add_chapters_table.down.sql`

## Running Migrations

### Apply all pending migrations
```bash
migrate -database "postgres://bookreading:bookreading123@localhost:5432/bookreading?sslmode=disable" -path database/migrations up
```

### Rollback last migration
```bash
migrate -database "postgres://bookreading:bookreading123@localhost:5432/bookreading?sslmode=disable" -path database/migrations down 1
```

### Rollback all migrations
```bash
migrate -database "postgres://bookreading:bookreading123@localhost:5432/bookreading?sslmode=disable" -path database/migrations down -all
```

### Check migration status
```bash
migrate -database "postgres://bookreading:bookreading123@localhost:5432/bookreading?sslmode=disable" -path database/migrations status
```

## Using with Docker Compose

```bash
# Run migrations against docker-compose database
docker-compose exec backend migrate -database "postgres://bookreading:bookreading123@postgres:5432/bookreading?sslmode=disable" -path /app/migrations up
```

## Migration Guidelines

1. **Always create both up and down files**
2. **Use descriptive names** (e.g., `add_chapters_table`, not `add_table`)
3. **Never modify existing applied migrations** - create a new one instead
4. **Test down migrations** - ensure rollback works correctly
5. **Add indexes for frequently queried columns**
6. **Use transactions** for complex migrations (PostgreSQL supports DDL in transactions)

## Example Migration

### Up Migration
```sql
-- 003_add_chapters_table.up.sql
BEGIN;

CREATE TABLE IF NOT EXISTS chapters (
    id SERIAL PRIMARY KEY,
    novel_id VARCHAR(100) NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(novel_id, chapter_number)
);

CREATE INDEX idx_chapters_novel_id ON chapters(novel_id);
CREATE INDEX idx_chapters_chapter_number ON chapters(chapter_number);

COMMIT;
```

### Down Migration
```sql
-- 003_add_chapters_table.down.sql
DROP TABLE IF EXISTS chapters;
```
