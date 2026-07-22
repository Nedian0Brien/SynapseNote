import type { DatabasePropertyType } from '@nedian0brien/synapsenote-core';

export type DatabasePropertyCopy = {
  label: string;
  example: string;
};

/** Human-facing labels/examples for the stable property type vocabulary. */
export const DATABASE_PROPERTY_TYPE_COPY: Record<DatabasePropertyType, DatabasePropertyCopy> = {
  title: { label: 'Title', example: 'The page name' },
  text: { label: 'Text', example: 'Short notes or descriptions' },
  number: { label: 'Number', example: 'Amount, score, or estimate' },
  checkbox: { label: 'Checkbox', example: 'A yes/no or done state' },
  date: { label: 'Date', example: 'A date, time, or date range' },
  select: { label: 'Select', example: 'One choice from a list' },
  status: { label: 'Status', example: 'A workflow state such as In progress' },
  multi_select: { label: 'Multi-select', example: 'Several choices from a list' },
  url: { label: 'URL', example: 'A link to a website' },
  email: { label: 'Email', example: 'An email address' },
  phone: { label: 'Phone', example: 'A phone number' },
  created_time: { label: 'Created time', example: 'When the page was created' },
  last_edited_time: { label: 'Last edited time', example: 'When the page was last changed' },
  created_by: { label: 'Created by', example: 'The person who created the page' },
  last_edited_by: { label: 'Last edited by', example: 'The person who last changed the page' },
  verification: { label: 'Verification', example: 'A review or approval state' },
  button: { label: 'Button', example: 'An action someone can run' },
  unique_id: { label: 'Unique ID', example: 'A stable identifier such as TASK-42' },
  place: { label: 'Place', example: 'A location with optional map details' },
  person: { label: 'Person', example: 'A teammate or collaborator' },
  files: { label: 'Files', example: 'Attachments or uploaded files' },
  relation: { label: 'Relation', example: 'Pages linked from another database' },
  formula: { label: 'Formula', example: 'A value calculated from other properties' },
  rollup: { label: 'Rollup', example: 'A value summarized from related pages' },
};

export function databasePropertyTypeCopy(type: DatabasePropertyType): DatabasePropertyCopy {
  return DATABASE_PROPERTY_TYPE_COPY[type];
}

export function databasePropertyTypeLabel(type: DatabasePropertyType): string {
  return databasePropertyTypeCopy(type).label;
}

export function databasePropertyTypeExample(type: DatabasePropertyType): string {
  return databasePropertyTypeCopy(type).example;
}
