## Execute Task List
Run tasks from existing task file: `$ARGUMENTS`

### Process
1. **Load** - Read `{filename}_tasks.md` (default: most recent *_tasks.md)
2. **Parse** - Extract pending tasks and dependencies
3. **Execute** - Run tasks sequentially:
   - Skip completed (marked ✓)
   - Execute pending
   - Update status in file
4. **Report** - Summary of completed/failed/remaining tasks


### Task File Format
```markdown
- [ ] Task description {#id}
- [x] Completed task
- [ ] Dependent task {depends: #id}