.PHONY: install dev mock test test-frontend test-backend test-e2e clean

install:           ## Install all dependencies
	python3 -m venv .venv
	.venv/bin/pip install -r backend/requirements.txt
	cd frontend && npm install

dev:               ## Start backend + frontend (real Claude mode)
	@echo "Starting backend on :4910 and frontend on :4920..."
	.venv/bin/python backend/server.py &
	cd frontend && npm run dev -- --port 4920

mock:              ## Start mock backend + frontend (no Claude needed)
	@echo "Starting mock server on :4910 and frontend on :4920..."
	BACKEND_PORT=4910 .venv/bin/python -m e2e.fixtures.mock_server --port 4910 &
	cd frontend && npm run dev -- --port 4920

test:              ## Run all tests
	cd frontend && npx vitest run
	.venv/bin/python -m pytest backend/tests/test_session.py --noconftest -v

test-frontend:     ## Frontend tests only
	cd frontend && npx vitest run

test-backend:      ## Backend tests only
	.venv/bin/python -m pytest backend/tests/test_session.py --noconftest -v

test-e2e:          ## E2E tests (requires mock server running)
	npx playwright test --config=e2e/playwright.config.ts

clean:             ## Remove generated files
	rm -rf .venv frontend/node_modules frontend/dist
