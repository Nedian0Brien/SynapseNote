# Code Review - React Best Practices
Review specified files for code quality, maintainability, and React best practices: `$ARGUMENTS`

## Steps

### 1. Analyze Context
- Identify how the file integrates with the project
- Search for related functions/components that interact with this file
- Map out dependencies and usage patterns
- Note any critical business logic or performance-sensitive areas

### 2. Review Checklist
Evaluate the following aspects:

#### Code Quality
- Identify code smells (duplicated code, long functions, complex conditionals)
- Flag unnecessary comments, console logs, or debug code
- Check for proper error handling and edge cases
- Assess naming conventions and code readability

#### React Best Practices
- Component composition and single responsibility principle
- Proper use of hooks (dependency arrays, custom hooks extraction)
- State management patterns (lifting state, avoiding unnecessary re-renders)
- Performance optimizations (memo, useMemo, useCallback usage)
- Accessibility concerns (ARIA labels, semantic HTML)
- Key prop usage in lists and conditional rendering patterns

#### Maintainability
- Component reusability and modularity
- Prop types or TypeScript usage
- Separation of concerns (logic vs presentation)
- Testability of components

### 3. Deliverables
- Create a prioritized TODO list of improvements (don't modify code directly)
- Categorize issues by severity: Critical | High | Medium | Low
- Provide specific examples and suggested fixes for each issue
- Include relevant documentation links or examples when applicable

## Constraints
- Focus only on the specified files unless critical dependencies require attention
- Request user permission before suggesting changes to multiple files
- Verify current React best practices via web search when uncertain
- Keep recommendations practical and incremental