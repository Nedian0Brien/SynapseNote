import { describe, expect, test } from 'bun:test';

import { githubOutputForPlan, serverShardsForDispatch } from './ci-plan.ts';

describe('CI plan output', () => {
  test('selects only the requested failed shard', () => {
    expect(serverShardsForDispatch(undefined)).toEqual(['1/4', '2/4', '3/4', '4/4']);
    expect(serverShardsForDispatch('all')).toEqual(['1/4', '2/4', '3/4', '4/4']);
    expect(serverShardsForDispatch('2/4')).toEqual(['2/4']);
    expect(() => serverShardsForDispatch('5/4')).toThrow('invalid server shard selection');
  });

  test('serializes the affected plan as GitHub output values', () => {
    const output = githubOutputForPlan(
      {
        changedFiles: ['packages/app/src/editor/example.ts'],
        docsOnly: false,
        domains: ['editor'],
        packages: ['app'],
        reasons: ['app source changed'],
        repository: false,
      },
      '3/4',
    );
    expect(output).toContain('packages=["app"]');
    expect(output).toContain('domains=["editor"]');
    expect(output).toContain('server_shards=["3/4"]');
  });
});
