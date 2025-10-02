# E2E Test Creation Command

**User Request:** `$ARGUMENTS`

## Overview
This command orchestrates E2E test creation using specialized test-planner and test-worker agents. The workflow analyzes existing Cypress test patterns, creates a detailed test plan, implements tests following project conventions, and ensures all tests pass.

## Workflow

### Phase 1: Test Planning
**Agent**: `test-planner`

**Objectives**:
1. Analyze existing Cypress test patterns in `cypress/e2e/`
2. Study `cypress/support/selectors.ts` structure and conventions
3. Identify required vs existing data-testid attributes
4. Create comprehensive test plan: `{topic}_test_cases.md`
5. Emphasize: NO source code logic modifications (only data-testid additions)

**Deliverables**:
- `{topic}_test_cases.md` containing:
  - Existing test pattern analysis
  - Required data-testid mapping (existing vs missing)
  - Detailed test cases with steps and verifications
  - Implementation tasks for test-worker
  - Clear marking of source code modifications (requires user approval)
  - Selector updates needed for selectors.ts

**Key Principles**:
- ✅ Analyze before planning
- ✅ Identify existing data-testids first
- ✅ Minimize source code changes
- ⚠️ Mark all source modifications clearly
- ✅ Follow existing test patterns exactly

---

### Phase 2: Test Implementation
**Agent**: `test-worker`

**Prerequisites**:
- Task file exists: `{topic}_test_cases.md`
- User reviewed and approved plan (especially source modifications)
- Environment ready (web server + cloud server running)

**Objectives**:
1. **Source Modifications** (with user permission):
   - Request permission for data-testid additions
   - Add data-testid attributes to source files if approved
   - Verify additions with grep

2. **Test Infrastructure** (safe, no permission needed):
   - Update `cypress/support/selectors.ts` with new selector groups
   - Follow existing selector patterns

3. **Test Implementation** (safe, no permission needed):
   - Create test file: `cypress/e2e/{category}/{topic}.cy.ts`
   - Implement each test case following existing patterns
   - Use selectors from selectors.ts
   - Match authentication, waiting, and logging patterns

4. **Test Execution & Debugging** (iterative):
   - Run tests: `pnpm cypress run --spec "{test-file}"`
   - Analyze failures
   - Fix timing, selector, or wait issues
   - Re-run until passing

5. **Progress Tracking**:
   - Update `{topic}_test_cases.md` after each test case
   - Mark status: Pending → 🔄 In Progress → ✅ Completed
   - Report blockers immediately

**Deliverables**:
- Test file: `cypress/e2e/{category}/{topic}.cy.ts`
- Updated: `cypress/support/selectors.ts`
- Modified (with approval): Source files with data-testid additions
- Updated: `{topic}_test_cases.md` with completion status
- All tests passing

**Critical Rules**:
- ⚠️ **NEVER** modify source code logic without explicit user permission
- ✅ **ONLY** add data-testid attributes (no functional changes)
- ⚠️ **ALWAYS** request permission before modifying files in `src/`
- ✅ Safe to modify: `cypress/` directory files without permission
- ✅ Ask user if blocked or tests cannot pass

---

## Usage Example

```bash
# User runs command
/create-test workspace settings page tests

# Phase 1: test-planner analyzes and creates plan
→ Analyzes existing tests in cypress/e2e/
→ Reviews selectors.ts patterns
→ Identifies required data-testids
→ Creates workspace_settings_page_test_cases.md

# User reviews plan, approves source modifications

# Phase 2: test-worker implements
→ Requests permission to add data-testids to src/
→ User approves
→ Adds data-testids to source components
→ Updates selectors.ts with WorkspaceSettingsSelectors
→ Creates cypress/e2e/workspace/settings-page.cy.ts
→ Runs tests, fixes errors
→ Updates workspace_settings_page_test_cases.md
→ All tests passing ✅
```

---

## Agent Coordination

```
┌──────────────────┐
│   test-planner   │
│                  │
│  - Analyze tests │
│  - Study patterns│
│  - Create plan   │
└────────┬─────────┘
         │
         │ Produces: {topic}_test_cases.md
         │
         ▼
┌─────────────────────┐
│  User Review        │
│  - Review plan      │
│  - Approve source   │
│    modifications    │
└────────┬────────────┘
         │
         │ Approval
         │
         ▼
┌──────────────────┐
│   test-worker    │
│                  │
│  - Add testids   │
│  - Create tests  │
│  - Run & fix     │
│  - Update status │
└──────────────────┘
```

---

## Success Criteria

- [ ] Test plan created with comprehensive analysis
- [ ] All data-testid requirements identified
- [ ] User approved source code modifications
- [ ] Selectors added to selectors.ts following conventions
- [ ] Test file created matching existing patterns
- [ ] All test cases implemented
- [ ] Tests pass consistently
- [ ] No unauthorized source code changes
- [ ] Task file updated with completion status
- [ ] TypeScript compilation succeeds
