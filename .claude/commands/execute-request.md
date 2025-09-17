## Task Implementation
Execute user request: `$ARGUMENTS`

### Process
1. **Analyze** - Search codebase for context, dependencies, and patterns
2. **Plan** - Create `{topic}_tasks.md` with detailed task breakdown
3. **Execute** - Implement with progress tracking (await permission)
4. **Verify** - Test and report completion status
5. **Do not modify source code** - Do not modify source code until user ask you

### Rules
- Full context before action. You can do code scan to gather more context
- Follow existing code patterns
- Document all changes
- Break complex work into atomic tasks