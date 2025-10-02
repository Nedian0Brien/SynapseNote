# E2E Test Creation Command

**User Request:** `$ARGUMENTS`

## Phase 1: Planning
1. **Spawn** `test-planner` subagent
2. **Input**: User's test request from `$ARGUMENTS`
3. **Output**: `{topic}_test_cases.md` with detailed test plan

## Phase 2: Implementation  
1. **Wait for user approval** of the plan
2. **Spawn** `test-worker` subagent
3. **Input**: Task file path `{topic}_test_cases.md`
4. **Output**: Implemented tests in `cypress/e2e/{category}/{topic}.cy.ts`

## Phase 3: Execution & Validation
1. **Spawn** `test-executor` subagent
2. **Input**: Test file path from test-worker
3. **Process**:
   - Execute tests and analyze results
   - If tests fail: Send detailed failure analysis to test-worker
   - Test-worker fixes issues based on analysis
   - Test-executor re-runs tests
   - Repeat until all tests pass or max iterations reached
4. **Output**: Final validation report and all tests passing