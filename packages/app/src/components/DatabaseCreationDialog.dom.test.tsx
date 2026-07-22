import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseCreationDialog } from './DatabaseCreationDialog';

afterEach(cleanup);

describe('DatabaseCreationDialog', () => {
  test('prepares blank creation through the reviewed desired-state contract', () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Database name'), {
      target: { value: 'Project Tasks' },
    });
    const summary = screen.getByLabelText('Creation summary');
    expect(summary.textContent).toContain('One Project Tasks record');
    expect(summary.textContent).toContain('project_tasks');
    expect(summary.textContent).toContain('Table');
    expect(summary.textContent).toContain('Title');
    expect(summary.querySelector('details')?.open).toBe(false);
    expect(summary.textContent).toContain('Advanced storage details');
    fireEvent.click(screen.getByRole('button', { name: 'Create database' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      database: { key: 'project_tasks', name: 'Project Tasks' },
      sources: [{ folder: 'project_tasks' }],
      sampleRecords: [],
    });
    expect(onCreate.mock.calls[0]?.[1]).toBe('blank');
  });

  test('allows an untitled blank database and supplies a stable local name', () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    expect(screen.getByPlaceholderText('Untitled database')).toBeDefined();
    expect(screen.getByLabelText('Creation summary').textContent).toContain('Untitled database');
    fireEvent.click(screen.getByRole('button', { name: 'Create database' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      database: { key: 'untitled_database', name: 'Untitled database' },
      sources: [{ properties: [{ key: 'title', type: 'title' }] }],
    });
  });

  test('keeps existing-folder creation non-mutating until separate onboarding', () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByText('Existing folder'));
    fireEvent.change(screen.getByLabelText('Database name'), {
      target: { value: 'Research' },
    });
    fireEvent.change(screen.getByLabelText('Content-relative folder'), {
      target: { value: 'research/notes' },
    });
    fireEvent.click(screen.getByText('Review creation'));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      sources: [{ folder: 'research/notes', includeSubfolders: true }],
      sampleRecords: [],
    });
    expect(onCreate.mock.calls[0]?.[1]).toBe('folder');
  });

  test('previews bounded example records for a starter database', () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByText('Template'));
    fireEvent.change(screen.getByLabelText('Database name'), {
      target: { value: 'Launch Tasks' },
    });
    expect(screen.getByLabelText('Creation summary').textContent).toContain('Initial records');
    expect(screen.getByTestId('database-creation-page-preview').textContent).toContain(
      'Page preview',
    );
    fireEvent.click(screen.getByText('Review creation'));
    expect(onCreate.mock.calls[0]?.[0].sampleRecords).toHaveLength(2);
    expect(onCreate.mock.calls[0]?.[1]).toBe('template');
  });

  test('previews template views and property types before commit', () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    fireEvent.click(screen.getByText('Template'));
    fireEvent.change(screen.getByLabelText('Database name'), {
      target: { value: 'Launch Tasks' },
    });

    const preview = screen.getByTestId('database-template-preview');
    expect(preview.textContent).toContain('Table · table');
    expect(preview.textContent).toContain('Board · board');
    expect(preview.textContent).toContain('Status');
    expect(preview.textContent).toContain('select');
    expect(screen.getByTestId('database-creation-page-preview').textContent).toContain(
      'Plan launch',
    );
    expect(onCreate).toHaveBeenCalledTimes(0);
  });

  test('keeps agent-assisted creation inside the same start surface', () => {
    const onCreate = mock(() => {});
    render(
      <DatabaseCreationDialog
        open
        onOpenChange={() => {}}
        onCreate={onCreate}
        agentComposer={<div>Installed agent composer</div>}
      />,
    );

    fireEvent.click(screen.getByText('Assistant'));

    expect(screen.getByLabelText('Agent-assisted database creation')).toBeDefined();
    expect(screen.getByText('Describe the database you want')).toBeDefined();
    expect(screen.getByText('Installed agent composer')).toBeDefined();
    expect(screen.getByText(/same reviewed plan and commit boundary/i)).toBeDefined();
    expect(onCreate).toHaveBeenCalledTimes(0);
  });

  test('returns to Blank after cancelling an advanced creation choice', () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);

    fireEvent.click(screen.getByText('Template'));
    expect(screen.getByLabelText('Starter template')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Blank' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByLabelText('Starter template')).toBeNull();
    expect(onCreate).toHaveBeenCalledTimes(0);
  });

  test('reads CSV, infers typed records, and submits one bounded creation draft', async () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByText('CSV or TSV'));
    const file = new File(['Task,Estimate,Done\nShip,3,true'], 'launch.csv', {
      type: 'text/csv',
    });
    fireEvent.change(screen.getByLabelText('Create database from CSV or TSV file'), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect((screen.getByLabelText('Database name') as HTMLInputElement).value).toBe('launch'),
    );
    expect(screen.getByTestId('database-creation-page-preview').textContent).toContain('Ship');
    fireEvent.click(screen.getByText('Review creation'));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({
      sources: [
        {
          properties: [
            { key: 'task', type: 'title' },
            { key: 'estimate', type: 'number' },
            { key: 'done', type: 'checkbox' },
          ],
        },
      ],
      sampleRecords: [{ values: { task: 'Ship', estimate: 3, done: true } }],
    });
    expect(onCreate.mock.calls[0]?.[1]).toBe('csv');
  });

  test('still validates a missing name for non-blank creation modes', () => {
    const onCreate = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByText('Template'));
    fireEvent.click(screen.getByText('Review creation'));
    expect(screen.getByRole('alert').textContent).toContain('Database name is required');
    expect(onCreate).toHaveBeenCalledTimes(0);
  });

  test('distinguishes an explicit cancel from a submitted creation draft', () => {
    const onCreate = mock(() => {});
    const onOpenChange = mock(() => {});
    render(<DatabaseCreationDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'cancel');

    cleanup();
    onOpenChange.mockClear();
    render(<DatabaseCreationDialog open onOpenChange={onOpenChange} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create database' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false, 'submit');
  });

  test('uses a non-modal full-page surface for document-native creation', () => {
    const onCreate = mock(() => {});
    render(
      <DatabaseCreationDialog
        open
        presentation="page"
        onOpenChange={() => {}}
        onCreate={onCreate}
      />,
    );

    const surface = document.querySelector<HTMLElement>('[data-database-creation-surface]');
    if (!surface) throw new Error('Expected the page creation surface');
    expect(surface.getAttribute('data-database-creation-presentation')).toBe('page');
    expect(surface.className).toContain('inset-0');
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'New database' })).toBeDefined();
    expect(
      screen.getByText('Start with a page-based table, then add properties and records as you go.'),
    ).toBeDefined();
  });
});
