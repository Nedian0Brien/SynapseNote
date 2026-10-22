import { afterEach, describe, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseAgentCreationPlanPreview } from './DatabaseAgentCreationPlanPreview';

afterEach(cleanup);

describe('DatabaseAgentCreationPlanPreview', () => {
  test('shows the inferred template, properties, views, and optional sample pages', () => {
    render(
      <DatabaseAgentCreationPlanPreview goal="Create a project tracker for the design team" />,
    );

    const preview = screen.getByTestId('database-agent-plan-preview');
    expect(preview.textContent).toContain('Agent proposal · not saved');
    expect(preview.textContent).toContain('Projects');
    expect((screen.getByLabelText('Property name status') as HTMLInputElement).value).toBe(
      'Status',
    );
    expect((screen.getByLabelText('View name board') as HTMLInputElement).value).toBe('Board');
    expect(screen.getByTestId('database-agent-plan-samples').textContent).toContain(
      'Website refresh',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include sample pages' }));
    expect(screen.queryByTestId('database-agent-plan-samples')).toBeNull();
    expect(preview.textContent).toContain('No sample pages will be included');
  });

  test('lets the user edit property and view suggestions before handoff', () => {
    let latest: {
      properties: readonly { key: string; name: string; type: string }[];
      views: readonly { key: string; name: string; layout: string }[];
      includeSamples: boolean;
    } | null = null;
    render(
      <DatabaseAgentCreationPlanPreview
        goal="Create a project tracker"
        onPlanChange={(next) => {
          latest = next;
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Property name title'), {
      target: { value: 'Work item' },
    });
    fireEvent.change(screen.getByLabelText('View name table'), {
      target: { value: 'All work' },
    });

    expect(screen.getByLabelText('Property type title')).toBeDefined();
    expect(screen.getByLabelText('View layout table')).toBeDefined();
    expect(latest?.properties.find((property) => property.key === 'title')?.name).toBe('Work item');
    expect(latest?.views.find((view) => view.key === 'table')?.name).toBe('All work');
  });

  test('does not render a plan for an empty goal', () => {
    render(<DatabaseAgentCreationPlanPreview goal="   " />);
    expect(screen.queryByTestId('database-agent-plan-preview')).toBeNull();
  });
});
