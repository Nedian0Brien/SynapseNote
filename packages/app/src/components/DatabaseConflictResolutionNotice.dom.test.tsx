import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabasePlanArtifact } from '@nedian0brien/synapsenote-server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseConflictResolutionNotice } from './DatabaseConflictResolutionNotice';

afterEach(cleanup);

function plan(committable: boolean): DatabasePlanArtifact {
  return {
    committable,
    conflictDomains: [
      'record_value',
      'schema',
      'option',
      'view',
      'formula',
      'relation',
      'automation',
    ],
    conflicts: [
      {
        code: 'record_revision_changed',
        message: 'Record changed after planning',
        targetId: 'rec_one',
      },
      {
        code: 'relation_target_missing',
        message: 'Relation target is missing',
        targetId: 'rec_missing',
        propertyId: 'prop_relation',
      },
    ],
  } as DatabasePlanArtifact;
}

describe('DatabaseConflictResolutionNotice', () => {
  test('shows all conflict areas and keeps blocked changes in explicit edit mode', () => {
    const useLatest = mock(() => {});
    render(
      <DatabaseConflictResolutionNotice
        plan={plan(false)}
        onUseLatest={useLatest}
        onReplan={undefined}
      />,
    );

    for (const label of [
      'Record values',
      'Schema',
      'Options',
      'Views',
      'Formulas',
      'Relations',
      'Automations',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText('Record changed after planning')).toBeTruthy();
    expect(screen.getByText('Relation target is missing')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Replan my change' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Use latest state' }));
    expect(useLatest).toHaveBeenCalledTimes(1);
  });

  test('offers an explicit fresh-plan action for a committable plan invalidated at commit time', () => {
    const replan = mock(() => {});
    render(
      <DatabaseConflictResolutionNotice
        plan={plan(true)}
        onUseLatest={() => {}}
        onReplan={replan}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replan my change' }));
    expect(replan).toHaveBeenCalledTimes(1);
  });
});
