import type { Meta, StoryObj } from '@storybook/react-vite';
import React from 'react';

import { ErrorType } from '@/application/utils/error-utils';
import { AppContext } from '@/components/app/app.hooks';
import { AFConfigContext } from '@/components/main/app.hooks';
import RecordNotFound from './RecordNotFound';

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
};

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

const meta = {
  title: 'Error Pages/RecordNotFound',
  component: RecordNotFound,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <AFConfigContext.Provider value={mockAFConfigValue}>
        <AppContext.Provider value={mockAppContext}>
          <Story />
        </AppContext.Provider>
      </AFConfigContext.Provider>
    ),
  ],
} satisfies Meta<typeof RecordNotFound>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PageNotFound: Story = {
  args: {
    error: {
      type: ErrorType.PageNotFound,
      message: 'Page or resource not found',
      statusCode: 404,
    },
  },
};

export const Unauthorized: Story = {
  args: {
    error: {
      type: ErrorType.Unauthorized,
      message: 'You need to sign in to access this resource',
      statusCode: 401,
    },
  },
};

export const Forbidden: Story = {
  args: {
    error: {
      type: ErrorType.Forbidden,
      message: 'You do not have permission to access this resource',
      statusCode: 403,
    },
  },
};

export const ForbiddenWithViewId: Story = {
  args: {
    viewId: 'test-view-id',
    error: {
      type: ErrorType.Forbidden,
      message: 'You do not have permission to access this resource',
      statusCode: 403,
    },
  },
};

export const ServerError: Story = {
  args: {
    error: {
      type: ErrorType.ServerError,
      message: 'Server error. Please try again later.',
      statusCode: 500,
    },
  },
};

export const NetworkError: Story = {
  args: {
    error: {
      type: ErrorType.NetworkError,
      message: 'Network connection failed. Please check your internet connection.',
    },
  },
};

export const InvalidLink: Story = {
  args: {
    error: {
      type: ErrorType.InvalidLink,
      message: 'Invalid or expired link',
      code: 1068,
      statusCode: 400,
    },
  },
};

export const AlreadyJoined: Story = {
  args: {
    error: {
      type: ErrorType.AlreadyJoined,
      message: 'You have already joined this workspace',
      code: 1073,
      statusCode: 409,
    },
  },
};

export const NotInvitee: Story = {
  args: {
    error: {
      type: ErrorType.NotInvitee,
      message: 'You are not the intended recipient of this invitation',
      code: 1041,
      statusCode: 403,
    },
  },
};

export const Gone: Story = {
  args: {
    error: {
      type: ErrorType.Gone,
      message: 'This resource has been deleted',
      statusCode: 410,
    },
  },
};

export const Timeout: Story = {
  args: {
    error: {
      type: ErrorType.Timeout,
      message: 'Request timed out. Please try again.',
      statusCode: 408,
    },
  },
};

export const RateLimited: Story = {
  args: {
    error: {
      type: ErrorType.RateLimited,
      message: 'Too many requests. Please try again later.',
      statusCode: 429,
    },
  },
};

export const Unknown: Story = {
  args: {
    error: {
      type: ErrorType.Unknown,
      message: 'An unexpected error occurred',
    },
  },
};

export const LegacyNotFound: Story = {
  args: {
    isViewNotFound: true,
  },
};

export const LegacyRecordNotFound: Story = {
  args: {
    isViewNotFound: false,
  },
};

export const NoContent: Story = {
  args: {
    noContent: true,
  },
};

