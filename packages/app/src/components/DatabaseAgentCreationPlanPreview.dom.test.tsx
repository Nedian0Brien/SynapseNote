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
    expect(preview.textContent).toContain('Status');
    expect(preview.textContent).toContain('Board');
    expect(screen.getByTestId('database-agent-plan-samples').textContent).toContain(
      'Website refresh',
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Include sample pages' }));
    expect(screen.queryByTestId('database-agent-plan-samples')).toBeNull();
    expect(preview.textContent).toContain('No sample pages will be included');
  });

  test('does not render a plan for an empty goal', () => {
    render(<DatabaseAgentCreationPlanPreview goal="   " />);
    expect(screen.queryByTestId('database-agent-plan-preview')).toBeNull();
  });
});
