# Claude Code Guidelines for AppFlowy-Web-Premium

This document provides clear instructions for Claude Code when working with the AppFlowy-Web-Premium repository.

## Project Overview

AppFlowy-Web-Premium is the premium web version of AppFlowy built with modern web technologies.

**Backend Integration**: The backend service is AppFlowy-Cloud-Premium. All API definitions are declared in the cloud repository under `libs/client-api` (Rust implementation). This web project must adhere to the client-api definitions.

## Development Environment

### Prerequisites
- Node.js with pnpm package manager
- Docker for containerized services
- TypeScript for type safety

### Essential Commands

```bash
# Development
pnpm install          # Install dependencies
pnpm run dev         # Start development server
pnpm run build       # Build for production

# Quality Assurance
npx tsc              # TypeScript type checking
pnpm run lint        # Code linting
pnpm test            # Run unit tests
pnpm cypress run     # Run end-to-end tests
```

## Protocol Buffers Integration

The protobuf definitions must match those declared in the appflowy-cloud-premium repository.

```bash
npx pbjs <options>   # Compile protobuf to JavaScript
npx pbts <options>   # Generate TypeScript definitions
```

## Development Guidelines
Do not run the pnpm run dev in the chat. Ask user to run pnpm run dev instead.

### Mandatory Verification Steps
1. **Build verification**: Always run `pnpm run build` to ensure successful compilation
2. **Type checking**: Run `npx tsc` to verify TypeScript compilation
3. **Code consistency**: Follow established patterns in the existing codebase
4. **API compliance**: Ensure all implementations respect the client-api definitions from the cloud repository

### Best Practices
- Maintain consistency with existing code patterns
- Verify protobuf definitions align with the backend
- Ask for clarification when implementation approach is uncertain
- Test thoroughly before considering work complete
