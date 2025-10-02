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
4. **Output**: Implemented tests and updated task file with completion status