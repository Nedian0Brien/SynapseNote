import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseNumberVisualization } from '@nedian0brien/synapsenote-core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatabaseTable } from './DatabaseTableDialog';
import { createDatabaseTestFixture } from './database-tests/database-test-fixture';

afterEach(cleanup);

describe('Number property visualization', () => {
  function renderNumberTable(
    visualization: DatabaseNumberVisualization,
    onConfigureNumberProperty = mock(() => {}),
  ) {
    const fixture = createDatabaseTestFixture();
    const property = {
      id: 'prop_progress',
      key: 'progress',
      name: 'Progress',
      type: 'number' as const,
      visualization,
    };
    render(
      <DatabaseTable
        databaseId={fixture.database.id}
        source={{ ...fixture.source, properties: [...fixture.source.properties, property] }}
        result={{
          ...fixture.result,
          records: [
            {
              ...fixture.record,
              values: { ...fixture.record.values, prop_progress: 24 },
            },
          ],
        }}
        notionSurface
        onEdit={() => {}}
        onConfigureNumberProperty={onConfigureNumberProperty}
      />,
    );
    return { property, onConfigureNumberProperty };
  }

  test('renders a scaled bar while preserving the formatted Number value', () => {
    renderNumberTable({ style: 'bar', color: 'green', denominator: 100, showValue: true });

    const visualization = document.querySelector<HTMLElement>(
      '[data-database-number-visualization="bar"]',
    );
    const fill = document.querySelector<HTMLElement>('[data-database-number-progress-fill]');
    expect(visualization?.getAttribute('data-database-number-progress')).toBe('0.24');
    expect(fill?.style.width).toBe('24%');
    expect(screen.getByText('24')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Progress: 24' })).toBeTruthy();
  });

  test('applies ring, color, scale, and value visibility from the property menu', async () => {
    const onConfigureNumberProperty = mock(() => {});
    const { property } = renderNumberTable(
      { style: 'bar', color: 'green', denominator: 100, showValue: true },
      onConfigureNumberProperty,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Property options for Progress' }));
    const numberDisplay = screen.getByRole('menuitem', { name: 'Number display' });
    act(() => {
      numberDisplay.focus();
      fireEvent.keyDown(numberDisplay, { key: 'ArrowRight' });
    });
    await user.click(await screen.findByRole('button', { name: 'Ring display' }));
    await user.click(screen.getByRole('button', { name: 'blue color' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Divide by' }), {
      target: { value: '80' },
    });
    await user.click(screen.getByRole('switch', { name: 'Show number' }));
    await user.click(screen.getByRole('button', { name: 'Apply number display' }));

    expect(onConfigureNumberProperty).toHaveBeenCalledWith(property, {
      style: 'ring',
      color: 'blue',
      denominator: 80,
      showValue: false,
    });
  });
});
