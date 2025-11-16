import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useEffect, useState } from 'react';

import { SubscriptionInterval, SubscriptionPlan } from '@/application/types';
import { AppContext } from '@/components/app/app.hooks';
import { AFConfigContext } from '@/components/main/app.hooks';
import UpgradePlan from './UpgradePlan';

const mockAFConfigValue = {
  service: {
    getSubscriptionLink: async () => 'https://example.com/subscribe',
  },
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

const mockAppContext = {
  currentWorkspaceId: 'test-workspace-id',
  outline: [],
  rendered: true,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  toView: async () => {},
  loadViewMeta: async () => {
    throw new Error('Not implemented in story');
  },
  loadView: async () => {
    throw new Error('Not implemented in story');
  },
  createRowDoc: async () => {
    throw new Error('Not implemented in story');
  },
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  appendBreadcrumb: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onRendered: () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  updatePage: async () => {},
  addPage: async () => 'test-page-id',
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  deletePage: async () => {},
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  openPageModal: () => {},
  loadViews: async () => [],
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  setWordCount: () => {},
  uploadFile: async () => {
    throw new Error('Not implemented in story');
  },
  eventEmitter: undefined,
  awarenessMap: {},
  getSubscriptions: async () => {
    return [
      {
        plan: SubscriptionPlan.Free,
        currency: 'USD',
        recurring_interval: SubscriptionInterval.Month,
        price_cents: 0,
      },
    ];
  },
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
  title: 'Billing/UpgradePlan',
  component: UpgradePlan,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType, context: { args: { hostname?: string; open?: boolean } }) => {
      const hostname = context.args.hostname || 'beta.appflowy.cloud';
      const [open, setOpen] = useState(context.args.open ?? false);

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
          <AppContext.Provider value={mockAppContext}>
            <div style={{ padding: '20px', width: '100%', maxWidth: '800px' }}>
              <button
                onClick={() => setOpen(true)}
                style={{
                  marginBottom: '20px',
                  padding: '10px 20px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Open Upgrade Plan Modal
              </button>
              <Story args={{ ...context.args, open, onClose: () => setOpen(false), onOpen: () => setOpen(true) }} />
            </div>
          </AppContext.Provider>
        </AFConfigContext.Provider>
      );
    },
  ],
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the modal is open',
    },
    hostname: {
      control: 'text',
      description: 'Mock hostname to simulate different hosting scenarios',
    },
  },
} satisfies Meta<typeof UpgradePlan>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OfficialHost: Story = {
  args: {
    open: true,
    hostname: 'beta.appflowy.cloud',
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows both Free and Pro plans on official host (beta.appflowy.cloud). Users can upgrade to Pro plan.',
      },
    },
  },
};

export const SelfHosted: Story = {
  args: {
    open: true,
    hostname: 'self-hosted.example.com',
  },
  parameters: {
    docs: {
      description: {
        story: 'On self-hosted instances, Pro plan is hidden. Pro features are enabled by default without subscription.',
      },
    },
  },
};

