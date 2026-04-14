.PHONY: migrate-up migrate-down migrate-status migrate-create

# Database URL - override with: make migrate-up DB_URL=postgres://...
DB_URL ?= postgres://bookreading:bookreading123@localhost:5432/bookreading?sslmode=disable

# Migration directory
MIGRATION_DIR = database/migrations

# Apply all pending migrations
migrate-up:
	migrate -database "$(DB_URL)" -path $(MIGRATION_DIR) up

# Rollback last migration
migrate-down:
	migrate -database "$(DB_URL)" -path $(MIGRATION_DIR) down 1

# Check migration status
migrate-status:
	migrate -database "$(DB_URL)" -path $(MIGRATION_DIR) status

# Create a new migration (usage: make migrate-create NAME=add_something)
migrate-create:
ifndef NAME
	$(error NAME is required. Usage: make migrate-create NAME=add_something)
endif
	migrate create -ext sql -dir $(MIGRATION_DIR) -seq $(NAME)

# Run migrations in Docker
migrate-up-docker:
	docker run --rm \
		-v $(PWD)/$(MIGRATION_DIR):/migrations \
		--network bookreading-network \
		migrate/migrate \
		-path=/migrations \
		-database "$(DB_URL)" \
		up
