import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useEffect } from 'react';

import { SubscriptionPlan } from '@/application/types';
import { AppContext } from '@/components/app/app.hooks';
import { AFConfigContext } from '@/components/main/app.hooks';
import { UpgradeBanner } from './UpgradeBanner';

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
  updateCurrentUser: async () => {
    // Mock implementation
  },
  openLoginModal: () => {
    // Mock implementation
  },
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
        owner: {
          uid: 'storybook-uid',
        },
      },
    ],
  },
  currentWorkspaceId: 'storybook-workspace-id',
  outline: [],
  rendered: true,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  toView: async () => { },
  loadViewMeta: async () => {
    throw new Error('Not implemented in story');
  },
  loadView: async () => {
    throw new Error('Not implemented in story');
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  appendBreadcrumb: () => { },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onRendered: () => { },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  updatePage: async () => { },
  addPage: async () => 'test-page-id',
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  deletePage: async () => { },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  openPageModal: () => { },
  loadViews: async () => [],
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setWordCount: () => { },
  uploadFile: async () => {
    throw new Error('Not implemented in story');
  },
  eventEmitter: undefined,
  awarenessMap: {},
};

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
  title: 'Share/UpgradeBanner',
  component: UpgradeBanner,
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
        // Update if hostname changes
        mockHostname(hostname);
        // Cleanup
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
    activeSubscriptionPlan: {
      control: 'select',
      options: [SubscriptionPlan.Free, SubscriptionPlan.Pro, null],
    },
    hostname: {
      control: 'text',
      description: 'Mock hostname to simulate different hosting scenarios',
    },
  },
} satisfies Meta<typeof UpgradeBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OfficialHostFreePlan: Story = {
  args: {
    activeSubscriptionPlan: SubscriptionPlan.Free,
    hostname: 'beta.appflowy.cloud',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows upgrade banner on official host (beta.appflowy.cloud) when user has Free plan',
      },
    },
  },
};

export const OfficialHostProPlan: Story = {
  args: {
    activeSubscriptionPlan: SubscriptionPlan.Pro,
    hostname: 'beta.appflowy.cloud',
  },
  parameters: {
    docs: {
      description: {
        story: 'No banner shown on official host when user already has Pro plan',
      },
    },
  },
};

export const SelfHostedFreePlan: Story = {
  args: {
    activeSubscriptionPlan: SubscriptionPlan.Free,
    hostname: 'self-hosted.example.com',
  },
  parameters: {
    docs: {
      description: {
        story: 'No banner shown on self-hosted instance - Pro features are enabled by default',
      },
    },
  },
};

export const SelfHostedProPlan: Story = {
  args: {
    activeSubscriptionPlan: SubscriptionPlan.Pro,
    hostname: 'self-hosted.example.com',
  },
  parameters: {
    docs: {
      description: {
        story: 'No banner shown on self-hosted instance - Pro features are enabled by default',
      },
    },
  },
};

