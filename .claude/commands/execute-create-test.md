# E2E Test Creation Process

## Overview
Create end-to-end test based on user request: `$ARGUMENTS`

## Steps

### 1. Understand Requirements
- Search codebase for context
- Identify dependencies and related tests
- Research additional information if needed

### 2. Plan
- Create detailed test implementation plan
- Break complex tests into smaller steps
- Use TodoWrite tool to document tasks
- Follow existing test patterns

### 3. Execute
- Run tasks (with user permission)
- Add `data-testid` attributes where needed
- Ask user for test file location if not specified
- Run test multiple times to ensure stability
- Add logging at each test step for debugging

## Important Rules
- **Only modify source code to add `data-testid` attributes**
- No other source code changes allowed
- Test multiple times to prevent flaky tests
- Include descriptive logs for each action

## Test Quality Checklist
- ✓ Test requirements understood
- ✓ Test file location confirmed
- ✓ Required `data-testid` attributes added
- ✓ Logging added for each step
- ✓ Test run multiple times successfully
- ✓ No flaky behavior detected
- ✓ Follows existing patterns