import type { ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';

export type DatabaseTableCellEditing = { recordId: string; propertyId: string; draft: string };

export type DatabaseTableComputedResult = NonNullable<
  ProjectedDatabaseRecord['computedResults']
>[string];

export type DatabaseTableVerificationProjection = NonNullable<
  ProjectedDatabaseRecord['verificationProjections']
>[string];
