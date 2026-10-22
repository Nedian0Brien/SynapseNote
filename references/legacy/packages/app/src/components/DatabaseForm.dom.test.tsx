import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseSource, DatabaseView } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseForm } from './DatabaseForm';

const source: DatabaseSource = {
  id: 'ds_feedback',
  key: 'feedback',
  name: 'Feedback',
  recordMeaning: 'One response',
  folder: 'feedback',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_follow_up', key: 'follow_up', name: 'Follow up', type: 'checkbox' },
    { id: 'prop_details', key: 'details', name: 'Details', type: 'text' },
  ],
};

const view: DatabaseView = {
  id: 'view_feedback_form',
  key: 'feedback-form',
  name: 'Feedback form',
  sourceId: source.id,
  layout: {
    type: 'form',
    configuration: {
      access: 'public',
      title: 'Send feedback',
      description: 'Tell us what happened.',
      questions: [
        {
          id: 'frmq_001_title',
          propertyId: 'prop_title',
          label: 'Subject',
          required: true,
        },
        {
          id: 'frmq_002_follow_up',
          propertyId: 'prop_follow_up',
          label: 'May we follow up?',
          required: false,
        },
        {
          id: 'frmq_003_details',
          propertyId: 'prop_details',
          label: 'Contact details',
          required: true,
          visibleWhen: {
            mode: 'all',
            conditions: [{ questionId: 'frmq_002_follow_up', operator: 'equals', value: true }],
          },
        },
      ],
      defaults: {},
      confirmation: {
        title: 'Thanks',
        message: 'We saved your response.',
        allowAnotherResponse: true,
      },
      closedMessage: 'Closed.',
      fileUploads: { enabled: false, maxFilesPerQuestion: 5 },
      spamProtection: {
        honeypot: true,
        minimumCompletionSeconds: 0,
        rateLimit: { maxSubmissions: 10, windowSeconds: 60 },
      },
      duplicateSubmission: { type: 'allow' },
      retention: { type: 'workspace' },
    },
  },
  sort: [],
  groups: [],
  projection: { propertyIds: ['prop_title', 'prop_follow_up', 'prop_details'], body: 'hidden' },
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('DatabaseForm', () => {
  test('reveals conditional questions, submits mapped answers, and renders confirmation', async () => {
    const fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.answers).toMatchObject({
        prop_title: 'Login issue',
        prop_follow_up: true,
        prop_details: 'person@example.com',
      });
      return new Response(
        JSON.stringify({
          status: 'created',
          recordId: 'rec_created',
          submittedAt: '2026-07-21T12:00:00.000Z',
          idempotentReplay: false,
          confirmation: {
            title: 'Thanks',
            message: 'We saved your response.',
            allowAnotherResponse: true,
          },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    });
    globalThis.fetch = fetch as typeof globalThis.fetch;
    render(<DatabaseForm databaseId="db_feedback" source={source} view={view} people={[]} />);

    expect(screen.getByText('Send feedback')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Details' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Login issue' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Yes' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Details' }), {
      target: { value: 'person@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit response' }));

    await waitFor(() => expect(screen.getByText('Thanks')).toBeTruthy());
    expect(screen.getByText('We saved your response.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit another response' })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('renders a closed state without exposing response controls', () => {
    const closedView = structuredClone(view);
    if (closedView.layout.type !== 'form') throw new Error('expected Form fixture');
    closedView.layout.configuration.closesAt = '2020-01-01T00:00:00.000Z';
    render(<DatabaseForm databaseId="db_feedback" source={source} view={closedView} people={[]} />);
    expect(screen.getByText('Form closed')).toBeTruthy();
    expect(screen.getByText('Closed.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit response' })).toBeNull();
  });
});
