import type { AffectedPlan } from './affected.ts';

export const SERVER_SHARD_CHOICES = ['1/4', '2/4', '3/4', '4/4'] as const;

export function serverShardsForDispatch(selected: string | undefined): string[] {
  if (!selected || selected === 'all') return [...SERVER_SHARD_CHOICES];
  if (!SERVER_SHARD_CHOICES.includes(selected as (typeof SERVER_SHARD_CHOICES)[number])) {
    throw new Error(`invalid server shard selection: ${selected}`);
  }
  return [selected];
}

export function githubOutputForPlan(plan: AffectedPlan, selectedShard?: string): string {
  return [
    `packages=${JSON.stringify(plan.packages)}`,
    `domains=${JSON.stringify(plan.domains)}`,
    `repository=${plan.repository}`,
    `docs_only=${plan.docsOnly}`,
    `server_shards=${JSON.stringify(serverShardsForDispatch(selectedShard))}`,
  ].join('\n');
}

if (import.meta.main) {
  const rawPlan = process.env.PLAN_JSON;
  if (!rawPlan) {
    console.error('[ci-plan] PLAN_JSON is required');
    process.exit(2);
  }
  try {
    const plan = JSON.parse(rawPlan) as AffectedPlan;
    console.log(githubOutputForPlan(plan, process.env.SERVER_SHARD));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
