.PHONY: image test-integration test-integration-local test-integration-ci

IMAGE_NAME = appflowy-web-app
IMAGE_TAG = latest

build:
	pnpm install
	pnpm run build

image: build
	cp .env deploy/
	rm -rf deploy/dist
	cp -r dist deploy/
	docker build -t $(IMAGE_NAME):$(IMAGE_TAG) deploy

# Integration testing commands
test-integration-local: ## Run integration tests locally with docker-compose
	@echo "Starting backend services..."
	docker-compose -f docker-compose.test.yml up -d
	@echo "Waiting for backend to be ready..."
	node scripts/wait-for-backend.js http://localhost:8080 60
	@echo "Running integration tests..."
	CYPRESS_BASE_URL=http://localhost:3000 CYPRESS_BACKEND_URL=http://localhost:8080 pnpm run test:cy
	@echo "Stopping backend services..."
	docker-compose -f docker-compose.test.yml down

test-integration-ci: ## Run integration tests in CI environment
	@echo "Running integration tests in CI mode..."
	CYPRESS_BASE_URL=http://localhost:3000 CYPRESS_BACKEND_URL=http://localhost:8080 pnpm run test:cy

test-integration-publish: ## Run publish feature integration tests
	@echo "Starting backend services..."
	docker-compose -f docker-compose.test.yml up -d
	@echo "Waiting for backend to be ready..."
	node scripts/wait-for-backend.js http://localhost:8080 60
	@echo "Running publish integration tests..."
	CYPRESS_BASE_URL=http://localhost:3000 CYPRESS_BACKEND_URL=http://localhost:8080 npx cypress run --spec "cypress/e2e/publish/**/*.cy.ts"
	@echo "Stopping backend services..."
	docker-compose -f docker-compose.test.yml down

clean-test: ## Clean up test artifacts and docker volumes
	docker-compose -f docker-compose.test.yml down -v
	rm -rf cypress/videos cypress/screenshots coverage .nyc_output

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
