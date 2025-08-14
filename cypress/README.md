# Cypress E2E Tests

## Overview

This directory contains end-to-end tests for the AppFlowy Web application, with a focus on the publish feature.

## Test Structure

```
cypress/
├── e2e/
│   └── publish/
│       ├── publish.integration.cy.ts      # Basic publish tests
│       ├── publish.simple.cy.ts           # Simple publish tests without auth
│       └── publish-with-auth.cy.ts        # Full publish tests with authentication
├── support/
│   ├── auth-utils.ts                      # Authentication utilities
│   ├── commands.ts                        # Custom Cypress commands
│   └── component.ts                       # Component test support
└── fixtures/                              # Test data
```

## Authentication

The tests use GoTrue admin functionality to generate sign-in URLs for test users, similar to the Rust desktop client implementation.

### Auth Utilities

The `auth-utils.ts` file provides:
- `AuthTestUtils` class for managing authentication
- Custom Cypress commands: `cy.signIn()` and `cy.generateSignInUrl()`
- Support for both real backend and mocked authentication

## Running Tests

### Local Development (with mocked data)

```bash
# Start the dev server
pnpm run dev

# Run all integration tests
pnpm run test:integration

# Run only publish tests
pnpm run test:integration:publish

# Run specific test file
npx cypress run --spec 'cypress/e2e/publish/publish-with-auth.cy.ts'

# Open Cypress UI for interactive testing
npx cypress open
```

### With Real Backend (AppFlowy-Cloud-Premium)

1. Start the AppFlowy-Cloud-Premium backend:
```bash
# Clone and setup AppFlowy-Cloud-Premium
git clone https://github.com/AppFlowy-IO/AppFlowy-Cloud-Premium.git
cd AppFlowy-Cloud-Premium

# Configure environment
cp deploy.env .env
# Edit .env to set GOTRUE_MAILER_AUTOCONFIRM=true

# Start services
docker compose up -d
```

2. Run tests with real backend:
```bash
# Set environment variables
export AF_BASE_URL=http://localhost
export GOTRUE_ADMIN_EMAIL=admin@example.com
export GOTRUE_ADMIN_PASSWORD=password
export USE_REAL_BACKEND=true

# Run tests
pnpm run test:integration:publish
```

### In CI/CD

The GitHub Actions workflow automatically:
1. Checks out AppFlowy-Cloud-Premium
2. Configures and starts the backend services
3. Runs integration tests against the real backend
4. Uploads test results and coverage reports

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AF_BASE_URL` | Base URL for the backend API | `http://localhost` |
| `CYPRESS_BASE_URL` | Base URL for the web application | `http://localhost:3000` |
| `GOTRUE_ADMIN_EMAIL` | GoTrue admin email for test user creation | `admin@example.com` |
| `GOTRUE_ADMIN_PASSWORD` | GoTrue admin password | `password` |
| `CI` | Set to `true` in CI environment | `false` |
| `USE_REAL_BACKEND` | Use real backend instead of mocks | `false` |

## Writing New Tests

### Basic Test Structure

```typescript
describe('Feature Name', () => {
  before(() => {
    // Sign in if needed
    if (Cypress.env('CI') || Cypress.env('USE_REAL_BACKEND')) {
      cy.signIn('test@example.com');
    }
  });

  it('should do something', () => {
    cy.visit('/page');
    cy.get('[data-testid="element"]').click();
    cy.contains('Expected text').should('be.visible');
  });
});
```

### Using Authentication

```typescript
// Sign in a test user
cy.signIn('test@example.com');

// Generate sign-in URL without signing in
cy.generateSignInUrl('test@example.com').then((url) => {
  // Use the URL as needed
});
```

### Mocking API Responses

```typescript
cy.intercept('GET', '**/api/workspace/*/publish/*', {
  statusCode: 200,
  body: {
    // Mock response data
  }
}).as('getPublishData');

cy.visit('/namespace/document');
cy.wait('@getPublishData');
```

## Best Practices

1. **Use data-testid attributes**: Add `data-testid` attributes to elements for reliable selection
2. **Mock external dependencies**: Use `cy.intercept()` to mock API calls when not using real backend
3. **Clean up state**: Clear localStorage/sessionStorage between tests when needed
4. **Use proper waits**: Use `cy.wait()` with aliases instead of arbitrary timeouts
5. **Test both success and error cases**: Include tests for error handling and edge cases

## Troubleshooting

### Tests timeout waiting for elements
- Check if the dev server is running (`pnpm run dev`)
- Verify selectors are correct (use Cypress UI to inspect)
- Increase timeout: `cy.get('[data-testid="element"]', { timeout: 10000 })`

### Authentication fails
- Verify backend is running and healthy
- Check environment variables are set correctly
- Ensure GoTrue admin credentials are correct

### Tests fail in CI but pass locally
- Check CI environment variables
- Verify backend services are fully started before tests run
- Review Docker logs for any startup issues

## Coverage

Test coverage reports are generated in the `coverage/` directory after running tests with coverage enabled:

```bash
pnpm run test:unit:coverage
pnpm run test:components:coverage
```