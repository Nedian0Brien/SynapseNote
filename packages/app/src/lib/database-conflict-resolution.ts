import type {
  DatabaseConflictDomain,
  DatabasePlanArtifact,
  DatabasePlanConflict,
} from '@nedian0brien/synapsenote-server';

export interface DatabaseConflictSection {
  domain: DatabaseConflictDomain;
  title: string;
  guidance: string;
  conflicts: readonly DatabasePlanConflict[];
}

const DOMAIN_ORDER: readonly DatabaseConflictDomain[] = [
  'record_value',
  'schema',
  'option',
  'view',
  'formula',
  'relation',
  'automation',
];

const COPY: Record<DatabaseConflictDomain, { title: string; guidance: string }> = {
  record_value: {
    title: 'Record values',
    guidance: 'Compare the latest record values, then reapply only the values you still want.',
  },
  schema: {
    title: 'Schema',
    guidance: 'Review renamed, removed, or moved fields against the latest schema.',
  },
  option: {
    title: 'Options',
    guidance: 'Map changed select or status options by stable ID before retrying.',
  },
  view: {
    title: 'Views',
    guidance: 'Review the latest filters, sorts, groups, layout, and visibility settings.',
  },
  formula: {
    title: 'Formulas',
    guidance: 'Revalidate references and the computed type against the latest schema.',
  },
  relation: {
    title: 'Relations',
    guidance: 'Resolve missing targets or changed source bindings before retrying.',
  },
  automation: {
    title: 'Automations',
    guidance: 'Review triggers, actions, owner, secrets, and enabled state before retrying.',
  },
};

function domainForConflict(conflict: DatabasePlanConflict): DatabaseConflictDomain {
  if (conflict.code === 'relation_target_missing') return 'relation';
  if (
    conflict.code === 'record_revision_changed' ||
    conflict.code === 'record_revision_required' ||
    conflict.code === 'record_not_found' ||
    conflict.code === 'record_scope_mismatch' ||
    conflict.code === 'record_identity_required' ||
    conflict.code === 'record_path_occupied' ||
    conflict.code === 'duplicate_record_target' ||
    conflict.code === 'record_limit_exceeded' ||
    conflict.code === 'sample_required_value_missing' ||
    conflict.code === 'sample_value_invalid' ||
    conflict.code === 'sample_unique_value_duplicate' ||
    conflict.code === 'person_target_missing'
  ) {
    return 'record_value';
  }
  return 'schema';
}

export function databaseConflictSections(plan: DatabasePlanArtifact): DatabaseConflictSection[] {
  const domains = new Set(plan.conflictDomains ?? []);
  for (const conflict of plan.conflicts) domains.add(domainForConflict(conflict));
  if (domains.size === 0) domains.add('schema');

  return DOMAIN_ORDER.filter((domain) => domains.has(domain)).map((domain) => ({
    domain,
    ...COPY[domain],
    conflicts: plan.conflicts.filter((conflict) => domainForConflict(conflict) === domain),
  }));
}
