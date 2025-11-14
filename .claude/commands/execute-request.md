## Task Implementation Framework

**User Request:** `$ARGUMENTS`

### Agent Responsibilities

- **context-awareness**: Project knowledge repository (patterns, commands, conventions)
- **planner**: Creates actionable task lists from requirements
- **worker**: Executes approved tasks with progress reporting
- **code-review**: Verifies AppFlowy web only make the minimal changes that needed

### Execution Workflow

#### Phase 1: Context Gathering
1. **Spawn** `context-awareness` subagent
2. **Objective**: Analyze the user request and identify relevant context
3. **Output**: Context analysis report including:
   - Relevant files and dependencies
   - Current implementation patterns
   - Potential impact areas
   - Technical constraints
4. **Note**: Context-awareness also serves as knowledge base for other agents

#### Phase 2: Planning
1. **Prerequisite**: Context-awareness subagent completion
2. **Spawn** `planner` subagent with context analysis
3. **Objective**: Create detailed implementation plan
4. **Output**: `{topic}_tasks.md` with task breakdown
5. **Important**: Save task file path for worker phase

#### Phase 3: User Review
1. **Present** the plan to user with:
   - Summary of context findings
   - Proposed task list
   - Estimated complexity/impact
2. **Ask**: "Would you like to proceed with this implementation plan? (yes/no/modify)"
3. **Wait** for explicit user confirmation

#### Phase 4: Implementation (Conditional)
**IF user approves:**
1. **Spawn** `worker` subagent
2. **Input**:
   - Task file path: `{topic}_tasks.md`
   - Context analysis from Phase 1
3. **Worker actions**:
   - Reads task file for task list
   - References `context-awareness` for patterns
   - Updates task file after each task
4. **Objective**: Execute tasks with live progress tracking
5. **Output**:
   - Updated `{topic}_tasks.md` with final status
   - Implementation summary

**IF user requests modifications:**
- Return to Phase 2 with user feedback

**IF user declines:**
- Store plan for potential future use

#### Phase 5: Compilation Verification
1. **Spawn** `code-review ` subagent
2. **Objective**: Verify AppFlowy project compiles without errors
3. **Actions**:
   - Run `pnpm run lint`
   - Collect all compilation errors
4. **Output**: Compilation status report
5. **IF errors found**:
   - Notify the `worker` subagent with error details
   - Worker fixes errors and reruns compilation check
   - Repeat until no errors remain
6. **IF no errors**:
   - Report successful compilation
   - Proceed to completion

### Subagent Handoff Protocol
- Each subagent must complete before next phase
- Pass full context between subagents
- Maintain conversation continuity
- Report any blockers immediately

### Decision Gates
✓ Context complete → Proceed to planning
✓ Plan complete → Request user review
✓ User approval → Execute implementation
✓ Implementation complete → Run compilation verification
✓ Compilation passes → Task complete
✗ Compilation fails → Return to worker for fixes
✗ Any failure → Report and request guidance

### Error Recovery Protocol
- **Context Phase Failure**: Retry with broader search, ask user for clarification
- **Planning Phase Failure**: Request additional context, simplify scope
- **Implementation Failure**: Execute rollback, report specific blockers
- **Compilation Failure**: Return errors to worker for fixes, iterate until clean
- **Verification Failure**: Diagnose issues, propose fixes

### Quality Checkpoints
1. **After Context**: Validate all dependencies identified
2. **After Planning**: Ensure tasks are atomic and clear
3. **After Each Task**: Run incremental verification

### Performance Optimization
- **Parallel Context Gathering**: Multiple file reads simultaneously
- **Cached Dependencies**: Reuse context across related requests
- **Incremental Verification**: Test as you go, not just at end
- **Smart Rollback**: Checkpoint after successful task groups

### Agent Communication Flow
```
User Request
    ↓
[Context-Awareness] → Analyzes request, provides knowledge
    ↓
[Planner] → Creates tasks using context
    ↓
User Review → Approval/Modification
    ↓
[Worker] → Executes tasks (references Context-Awareness for patterns)
    ↓
[Reviewer] → Runs dart analyze & cargo check
    ↓           ↓ Errors found
    ↓       [Worker] → Fix errors
    ↓           ↓
    ↓       [Reviewer] → Re-verify
    ↓           ↓
Compilation Verified → Task Complete
```

### Key Principles
1. **Single Source of Truth**: All project knowledge in context-awareness
2. **Clear Separation**: Each agent has distinct responsibilities  
3. **No Duplication**: Patterns and conventions stored once
4. **Linear Flow**: Simple, predictable execution path
5. **User Control**: Explicit approval before implementation

### Task Tracking Benefits
1. **Persistent Progress**: Task file shows real-time status
2. **Resumable**: Can restart from any point if interrupted
3. **Audit Trail**: Complete record of what was done vs planned
4. **Clear Communication**: User can check `{topic}_tasks.md` anytime
5. **Failure Transparency**: Failed tasks clearly marked with reasons