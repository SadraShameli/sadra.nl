.PHONY: help install up down restart reset logs status dev build clean clean-all

help:
	@echo "Sadra.nl Docker & Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install           - First-time setup: .env, deps, Postgres, schema (db:push)"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make up                - Start containers + dev server"
	@echo "  make down              - Stop containers"
	@echo "  make restart           - Restart containers"
	@echo "  make reset             - Delete database and restart (wipes all data)"
	@echo "  make logs              - View PostgreSQL logs"
	@echo "  make status            - Show container status"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev               - Start dev server (bun run dev)"
	@echo "  make build             - Build for production"
	@echo ""
	@echo "Quick Setup:"
	@echo "  make install && make dev"
	@echo ""

install:
	@if [ ! -f .env ]; then cp .env.example .env && echo "Created .env from .env.example"; fi
	bun install
	@echo "Starting PostgreSQL..."
	@if docker ps -a --format '{{.Names}}' | grep -qx sadra-postgres-local; then \
		docker start sadra-postgres-local; \
	else \
		docker-compose up -d postgres; \
	fi
	@echo "Waiting for PostgreSQL..."
	@until docker exec sadra-postgres-local pg_isready -U sadra >/dev/null 2>&1; do sleep 1; done
	@docker exec sadra-postgres-local psql -U sadra -d postgres -c "ALTER ROLE sadra WITH PASSWORD 'sadra';" >/dev/null 2>&1 || true
	@set -a && . ./.env && set +a && \
		url="$${DATABASE_URL%%\?*}" && \
		db="$${url##*/}" && \
		db="$${db%%$$'\r'}" && \
		docker exec sadra-postgres-local psql -U sadra -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$$db'" | grep -q 1 || \
		docker exec sadra-postgres-local psql -U sadra -d postgres -c "CREATE DATABASE \"$$db\";"
	@echo "Applying database schema (drizzle push)..."
	bun run db:push
	@echo ""
	@echo "Install complete. DATABASE_URL database is ready. Run: make dev  (or make up for Postgres + dev)"

up:
	@echo "Starting PostgreSQL and PgAdmin containers..."
	docker-compose up -d
	@sleep 3
	@echo "PostgreSQL is running on localhost:5432"
	@echo "PgAdmin is available at http://localhost:5050"
	@echo ""
	@echo "Login to PgAdmin:"
	@echo "  Email: admin@example.com"
	@echo "  Password: admin_password"
	@echo ""
	@echo "Database connection:"
	@echo "  Host: localhost:5432 (or postgres from docker)"
	@echo "  User: sadra"
	@echo "  Password: sadra"
	@echo "  Database: sadra"
	@echo ""
	@echo "Starting dev server..."
	bun run dev

down:
	@echo "Stopping containers..."
	docker-compose down
	@echo "Containers stopped"

restart:
	@echo "Restarting containers..."
	docker-compose down
	docker-compose up -d
	@sleep 3
	@echo "Containers restarted"

reset:
	@echo "Resetting database (deleting all data)..."
	docker-compose down -v
	@echo "Database deleted. Run 'make up' to recreate"

logs:
	@echo "PostgreSQL logs (press Ctrl+C to exit):"
	docker-compose logs -f postgres

status:
	@echo "Container Status:"
	@docker-compose ps

dev:
	@echo "Starting dev server..."
	bun run dev

build:
	@echo "Building for production..."
	bun run build

info:
	@echo "Current Configuration:"
	@echo ""
	@echo "Files:"
	@ls -lah docker-compose.yml .env .env.local Makefile 2>/dev/null | awk '{print "  " $$9 " (" $$5 ")"}'
	@echo ""
	@echo "Docker Containers:"
	@docker ps -a --filter "label!=com.docker.compose.project" --format "table {{.Image}}\t{{.Status}}" 2>/dev/null || echo "  Docker not running or no containers found"
	@echo ""
	@echo "Environment Variables:"
	@grep -v '^#' .env | grep -v '^$$' | sed 's/=.*/=/g' | sed 's/^/  /'
	@echo ""

clean:
	@echo "Cleaning up..."
	rm -rf .next
	@echo "Cleaned .next directory"

clean-all: reset clean
	@echo "Full cleanup complete"
