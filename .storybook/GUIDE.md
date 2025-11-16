# Storybook Guide for AppFlowy Web

This guide covers how to write Storybook stories for AppFlowy Web components, including common patterns, solutions to frequent issues, and best practices.

## Table of Contents

1. [Setup and Configuration](#setup-and-configuration)
2. [Writing Stories](#writing-stories)
3. [Common Patterns](#common-patterns)
4. [Mocking and Context Providers](#mocking-and-context-providers)
5. [Hostname Mocking for Different Scenarios](#hostname-mocking-for-different-scenarios)
6. [CSS and Styling](#css-and-styling)
7. [Common Issues and Solutions](#common-issues-and-solutions)
8. [Examples](#examples)

## Setup and Configuration

### Prerequisites

- Node.js v20.6.0 or higher (required for Storybook)
- All dependencies installed via `pnpm install`

### Running Storybook

```bash
pnpm run storybook
```

This starts Storybook on `http://localhost:6006` (or next available port).

### Building Storybook

```bash
pnpm run build-storybook
```

## Writing Stories

### Basic Story Structure

A Storybook story file should follow this structure:

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';
import YourComponent from './YourComponent';

const meta = {
  title: 'Category/ComponentName',
  component: YourComponent,
  parameters: {
    layout: 'padded', // or 'centered', 'fullscreen'
  },
  tags: ['autodocs'],
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    // Component props
  },
};
```

### Story Categories

Organize stories by feature area:
- `Share/` - Sharing and collaboration features
- `Billing/` - Subscription and billing components
- `Publish/` - Publishing and site management
- `Editor/` - Editor components and features
- `Error Pages/` - Error and not found pages

## Common Patterns

### 1. Component with Context Dependencies

If your component uses React Context (like `AppContext`, `AFConfigContext`), you need to provide mock values:

```typescript
import { AppContext } from '@/components/app/app.hooks';
import { AFConfigContext } from '@/components/main/app.hooks';

const mockAFConfigValue = {
  service: undefined,
  isAuthenticated: true,
  currentUser: {
    email: 'storybook@example.com',
    name: 'Storybook User',
    uid: 'storybook-uid',
    avatar: null,
    uuid: 'storybook-uuid',
    latestWorkspaceId: 'storybook-workspace-id',
  },
  updateCurrentUser: async () => {},
  openLoginModal: () => {},
};

const mockAppContextValue = {
  userWorkspaceInfo: {
    selectedWorkspace: {
      id: 'storybook-workspace-id',
      name: 'Storybook Workspace',
      owner: {
        uid: 'storybook-uid',
      },
    },
    workspaces: [
      {
        id: 'storybook-workspace-id',
        name: 'Storybook Workspace',
        owner: { uid: 'storybook-uid' },
      },
    ],
  },
  currentWorkspaceId: 'storybook-workspace-id',
  outline: [],
  rendered: true,
  toView: async () => {},
  loadViewMeta: async () => {
    throw new Error('Not implemented in story');
  },
  loadView: async () => {
    throw new Error('Not implemented in story');
  },
  // ... other required properties
};

const meta = {
  title: 'Share/YourComponent',
  component: YourComponent,
  decorators: [
    (Story) => (
      <AFConfigContext.Provider value={mockAFConfigValue}>
        <AppContext.Provider value={mockAppContextValue}>
          <Story />
        </AppContext.Provider>
      </AFConfigContext.Provider>
    ),
  ],
} satisfies Meta<typeof YourComponent>;
```

### 2. Router-Dependent Components

**IMPORTANT**: Do NOT add `BrowserRouter` in your story decorators. The `.storybook/preview.tsx` already provides a global `BrowserRouter` for all stories. Adding another will cause a "Cannot render Router inside another Router" error.

```typescript
// ✅ CORRECT - No BrowserRouter needed
const meta = {
  decorators: [
    (Story) => (
      <div style={{ padding: '20px' }}>
        <Story />
      </div>
    ),
  ],
};

// ❌ WRONG - Don't add BrowserRouter
const meta = {
  decorators: [
    (Story) => (
      <BrowserRouter>  // ❌ This will cause an error!
        <Story />
      </BrowserRouter>
    ),
  ],
};
```

## Mocking and Context Providers

### Required Contexts

Many AppFlowy components require these contexts:

1. **AFConfigContext** - Authentication and service configuration
2. **AppContext** - Workspace and app state
3. **I18nextProvider** - Already provided globally in preview.tsx
4. **BrowserRouter** - Already provided globally in preview.tsx

### Minimal Mock Contexts

For components that only need basic context:

```typescript
const mockAFConfigValue = {
  service: undefined,
  isAuthenticated: true,
  currentUser: {
    email: 'storybook@example.com',
    name: 'Storybook User',
    uid: 'storybook-uid',
    avatar: null,
    uuid: 'storybook-uuid',
    latestWorkspaceId: 'storybook-workspace-id',
  },
  updateCurrentUser: async () => {},
  openLoginModal: () => {},
};
```

For components that need workspace info:

```typescript
const mockAppContextValue = {
  userWorkspaceInfo: {
    selectedWorkspace: {
      id: 'storybook-workspace-id',
      name: 'Storybook Workspace',
      owner: { uid: 'storybook-uid' },
    },
    workspaces: [
      {
        id: 'storybook-workspace-id',
        name: 'Storybook Workspace',
        owner: { uid: 'storybook-uid' },
      },
    ],
  },
  currentWorkspaceId: 'storybook-workspace-id',
  outline: [],
  rendered: true,
  // ... add other required methods as needed
};
```

## Hostname Mocking for Different Scenarios

Many components behave differently based on whether they're running on official AppFlowy hosts (`beta.appflowy.cloud`, `test.appflowy.cloud`) or self-hosted instances.

### How It Works

The `isOfficialHost()` function in `src/utils/subscription.ts` checks `window.location.hostname`. For Storybook, we mock this using a global variable.

### Implementation Pattern

```typescript
// Mock window.location.hostname for different scenarios using a global variable
declare global {
  interface Window {
    __STORYBOOK_MOCK_HOSTNAME__?: string;
  }
}

const mockHostname = (hostname: string) => {
  window.__STORYBOOK_MOCK_HOSTNAME__ = hostname;
};

const meta = {
  title: 'YourComponent',
  component: YourComponent,
  decorators: [
    (Story: React.ComponentType, context: { args: { hostname?: string } }) => {
      const hostname = context.args.hostname || 'beta.appflowy.cloud';
      
      // Set mock hostname synchronously before render
      mockHostname(hostname);

      useEffect(() => {
        // Update if hostname changes
        mockHostname(hostname);
        // Cleanup
        return () => {
          delete (window as any).__STORYBOOK_MOCK_HOSTNAME__;
        };
      }, [hostname]);

      return (
        <div style={{ padding: '20px' }}>
          <Story />
        </div>
      );
    },
  ],
  argTypes: {
    hostname: {
      control: 'text',
      description: 'Mock hostname to simulate different hosting scenarios',
    },
  },
} satisfies Meta<typeof YourComponent>;
```

### Story Examples for Different Hosts

```typescript
export const OfficialHost: Story = {
  args: {
    hostname: 'beta.appflowy.cloud',
    // ... other props
  },
  parameters: {
    docs: {
      description: {
        story: 'Behavior on official AppFlowy host (beta.appflowy.cloud)',
      },
    },
  },
};

export const SelfHosted: Story = {
  args: {
    hostname: 'self-hosted.example.com',
    // ... other props
  },
  parameters: {
    docs: {
      description: {
        story: 'Behavior on self-hosted instance - Pro features enabled by default',
      },
    },
  },
};

export const TestHost: Story = {
  args: {
    hostname: 'test.appflowy.cloud',
    // ... other props
  },
};
```

### Important Notes

1. **Set hostname synchronously**: Call `mockHostname()` before the component renders, not just in `useEffect`
2. **Cleanup**: Delete the global variable in the cleanup function
3. **The `isOfficialHost()` function** automatically checks `window.__STORYBOOK_MOCK_HOSTNAME__` if it exists

## CSS and Styling

### CSS Import Order

The `.storybook/preview.tsx` imports styles in the correct order:

```typescript
import '@/styles/global.css';  // Imports tailwind.css
import '@/styles/app.scss';     // Additional app styles
```

**Do not** import CSS files in individual story files. All styles are loaded globally.

### Tailwind Configuration

Tailwind is configured to use `#body` as the important selector. The preview decorator wraps all stories in a `div` with `id="body"`, so Tailwind classes will work correctly.

### Dark Mode

Dark mode is automatically handled in the preview decorator. The `data-dark-mode` attribute is set on `document.documentElement` based on:
1. `localStorage.getItem('dark-mode')`
2. System preference (`prefers-color-scheme: dark`)

## Common Issues and Solutions

### Issue 1: "Cannot render Router inside another Router"

**Problem**: You added `BrowserRouter` in your story decorator.

**Solution**: Remove `BrowserRouter` from your story. It's already provided globally in `.storybook/preview.tsx`.

```typescript
// ❌ Wrong
<BrowserRouter>
  <Story />
</BrowserRouter>

// ✅ Correct
<Story />
```

### Issue 2: "useUserWorkspaceInfo must be used within an AppProvider"

**Problem**: Component uses `useUserWorkspaceInfo()` or other AppContext hooks but no `AppContext.Provider` is provided.

**Solution**: Wrap your story in `AppContext.Provider` with mock values:

```typescript
import { AppContext } from '@/components/app/app.hooks';

const mockAppContextValue = {
  userWorkspaceInfo: {
    selectedWorkspace: {
      id: 'storybook-workspace-id',
      owner: { uid: 'storybook-uid' },
    },
    workspaces: [],
  },
  // ... other required properties
};

const meta = {
  decorators: [
    (Story) => (
      <AppContext.Provider value={mockAppContextValue}>
        <Story />
      </AppContext.Provider>
    ),
  ],
};
```

### Issue 3: "Cannot redefine property: hostname"

**Problem**: Trying to mock `window.location.hostname` directly using `Object.defineProperty`.

**Solution**: Use the global variable approach instead:

```typescript
// ❌ Wrong - window.location.hostname is not configurable
Object.defineProperty(window.location, 'hostname', {
  value: hostname,
});

// ✅ Correct - Use global variable
window.__STORYBOOK_MOCK_HOSTNAME__ = hostname;
```

### Issue 4: Styles Not Loading

**Problem**: CSS/Tailwind styles not appearing in Storybook.

**Solutions**:
1. Ensure Storybook is restarted after configuration changes
2. Check that CSS files are imported in `.storybook/preview.tsx`
3. Verify `postcss.config.cjs` exists and includes Tailwind
4. Check browser console for CSS loading errors
5. Ensure the `#body` element exists (it's added in preview.tsx)

### Issue 5: Hostname Mocking Not Working

**Problem**: `isOfficialHost()` returns wrong value in stories.

**Solutions**:
1. Set `mockHostname()` synchronously before render, not just in `useEffect`
2. Ensure `window.__STORYBOOK_MOCK_HOSTNAME__` is set before component mounts
3. Check that the cleanup function deletes the variable properly

## Examples

### Complete Example: Component with Hostname Mocking

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useEffect } from 'react';
import { SubscriptionPlan } from '@/application/types';
import { AppContext } from '@/components/app/app.hooks';
import { AFConfigContext } from '@/components/main/app.hooks';
import YourComponent from './YourComponent';

// Mock contexts
const mockAFConfigValue = {
  service: undefined,
  isAuthenticated: true,
  currentUser: {
    email: 'storybook@example.com',
    name: 'Storybook User',
    uid: 'storybook-uid',
    avatar: null,
    uuid: 'storybook-uuid',
    latestWorkspaceId: 'storybook-workspace-id',
  },
  updateCurrentUser: async () => {},
  openLoginModal: () => {},
};

const mockAppContextValue = {
  userWorkspaceInfo: {
    selectedWorkspace: {
      id: 'storybook-workspace-id',
      name: 'Storybook Workspace',
      owner: { uid: 'storybook-uid' },
    },
    workspaces: [],
  },
  currentWorkspaceId: 'storybook-workspace-id',
  outline: [],
  rendered: true,
  toView: async () => {},
  loadViewMeta: async () => {
    throw new Error('Not implemented');
  },
  loadView: async () => {
    throw new Error('Not implemented');
  },
  appendBreadcrumb: () => {},
  onRendered: () => {},
  updatePage: async () => {},
  addPage: async () => 'test-page-id',
  deletePage: async () => {},
  openPageModal: () => {},
  loadViews: async () => [],
  setWordCount: () => {},
  uploadFile: async () => {
    throw new Error('Not implemented');
  },
  eventEmitter: undefined,
  awarenessMap: {},
};

// Hostname mocking
declare global {
  interface Window {
    __STORYBOOK_MOCK_HOSTNAME__?: string;
  }
}

const mockHostname = (hostname: string) => {
  window.__STORYBOOK_MOCK_HOSTNAME__ = hostname;
};

const meta = {
  title: 'Category/YourComponent',
  component: YourComponent,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType, context: { args: { hostname?: string } }) => {
      const hostname = context.args.hostname || 'beta.appflowy.cloud';
      
      // Set mock hostname synchronously before render
      mockHostname(hostname);

      useEffect(() => {
        mockHostname(hostname);
        return () => {
          delete (window as any).__STORYBOOK_MOCK_HOSTNAME__;
        };
      }, [hostname]);

      return (
        <AFConfigContext.Provider value={mockAFConfigValue}>
          <AppContext.Provider value={mockAppContextValue}>
            <div style={{ padding: '20px', maxWidth: '600px' }}>
              <Story />
            </div>
          </AppContext.Provider>
        </AFConfigContext.Provider>
      );
    },
  ],
  argTypes: {
    hostname: {
      control: 'text',
      description: 'Mock hostname to simulate different hosting scenarios',
    },
  },
} satisfies Meta<typeof YourComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OfficialHost: Story = {
  args: {
    hostname: 'beta.appflowy.cloud',
    activePlan: SubscriptionPlan.Free,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows component behavior on official host',
      },
    },
  },
};

export const SelfHosted: Story = {
  args: {
    hostname: 'self-hosted.example.com',
    activePlan: SubscriptionPlan.Free,
  },
  parameters: {
    docs: {
      description: {
        story: 'On self-hosted instances, Pro features are enabled by default',
      },
    },
  },
};
```

### Simple Example: Component Without Context

```typescript
import type { Meta, StoryObj } from '@storybook/react-vite';
import SimpleComponent from './SimpleComponent';

const meta = {
  title: 'Category/SimpleComponent',
  component: SimpleComponent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SimpleComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: 'Hello Storybook',
  },
};
```

## Best Practices

1. **Always provide required contexts**: If a component uses hooks from contexts, provide mock providers
2. **Don't duplicate Router**: Never add `BrowserRouter` in stories
3. **Mock hostname synchronously**: Set `__STORYBOOK_MOCK_HOSTNAME__` before render
4. **Use descriptive story names**: Make it clear what scenario the story demonstrates
5. **Add documentation**: Use `parameters.docs.description.story` to explain the story
6. **Test different scenarios**: Create stories for official hosts, self-hosted, different plans, etc.
7. **Keep mocks minimal**: Only mock what's necessary for the component to render
8. **Use TypeScript**: Leverage `satisfies Meta<typeof Component>` for type safety

## Additional Resources

- [Storybook Documentation](https://storybook.js.org/docs)
- [Storybook React-Vite Framework](https://storybook.js.org/docs/react/get-started/install)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

## Troubleshooting

If you encounter issues not covered here:

1. Check the browser console for errors
2. Verify all required contexts are provided
3. Ensure CSS files are imported in preview.tsx
4. Restart Storybook after configuration changes
5. Check that Node.js version is v20.6.0 or higher
6. Clear Storybook cache: `rm -rf node_modules/.cache/storybook`

For more help, refer to existing story files in the codebase for examples.

