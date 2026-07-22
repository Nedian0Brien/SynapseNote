import { isDatabaseDateOnly } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { DATABASE_CSV_IMPORT_RECORD_LIMIT, parseDelimited } from './database-csv.ts';

export type DatabaseCreationTemplateKey =
  | 'tasks'
  | 'projects'
  | 'crm'
  | 'feedback'
  | 'content_calendar'
  | 'issue_tracking'
  | 'research_evidence';

export interface DatabaseCreationTemplate {
  key: DatabaseCreationTemplateKey;
  name: string;
  description: string;
}

export interface DatabaseCreationSummary {
  recordMeaning: string;
  canonicalFolder: string;
  stableKey: string;
  initialView: string;
  propertyNames: readonly string[];
  initialRecordCount: number;
}

export interface DatabaseAgentCreationPlanPreview {
  goal: string;
  name: string;
  template: DatabaseCreationTemplateKey;
  templateName: string;
  properties: readonly { name: string; type: string }[];
  views: readonly { name: string; layout: string }[];
  sampleRecords: readonly Record<string, unknown>[];
}

export const DATABASE_CREATION_TEMPLATES: readonly DatabaseCreationTemplate[] = [
  { key: 'tasks', name: 'Tasks', description: 'Status, priority, due date, and assignee' },
  { key: 'projects', name: 'Projects', description: 'Status, owner, due date, and progress' },
  { key: 'crm', name: 'Lightweight CRM', description: 'Company, contact, stage, and value' },
  { key: 'feedback', name: 'Feedback', description: 'Type, status, source, and submitted date' },
  {
    key: 'content_calendar',
    name: 'Content calendar',
    description: 'Publishing status, channel, and publish date',
  },
  {
    key: 'issue_tracking',
    name: 'Issue tracking',
    description: 'Status, priority, assignee, and due date',
  },
  {
    key: 'research_evidence',
    name: 'Research evidence',
    description: 'Source, evidence type, confidence, and review date',
  },
];

const AGENT_TEMPLATE_KEYWORDS: readonly [DatabaseCreationTemplateKey, readonly string[]][] = [
  ['issue_tracking', ['issue', 'bug', 'ticket', '이슈', '버그']],
  ['content_calendar', ['content', 'calendar', 'publishing', '콘텐츠', '캘린더', '게시']],
  ['research_evidence', ['research', 'evidence', 'study', 'paper', '연구', '근거', '자료']],
  ['crm', ['crm', 'customer', 'sales', 'contact', '고객', '영업', '거래처']],
  ['feedback', ['feedback', 'request', 'survey', '피드백', '요청', '설문']],
  ['projects', ['project', 'roadmap', '프로젝트', '로드맵']],
  ['tasks', ['task', 'todo', 'checklist', 'work', '할 일', '업무', '작업']],
];

function agentTemplateForGoal(goal: string): DatabaseCreationTemplateKey {
  const normalized = goal.toLocaleLowerCase();
  return (
    AGENT_TEMPLATE_KEYWORDS.find(([, keywords]) =>
      keywords.some((keyword) => normalized.includes(keyword)),
    )?.[0] ?? 'research_evidence'
  );
}

function agentNameForGoal(goal: string, templateName: string): string {
  const phrase = goal
    .replace(/^(please|can you|i want|i need|create|build|make)\s+/i, '')
    .split(/[.!?\n]/, 1)[0]
    ?.trim()
    .split(/\s+/)
    .slice(0, 7)
    .join(' ');
  if (!phrase) return templateName;
  return `${phrase.slice(0, 1).toLocaleUpperCase()}${phrase.slice(1)}`;
}

/**
 * Compile a conservative, local proposal from a natural-language creation
 * goal. This is preview-only: it never allocates IDs, writes a manifest, or
 * bypasses the installed-agent handoff and exact-plan approval boundary.
 */
export function createAgentDatabasePlanPreview(
  goalInput: string,
): DatabaseAgentCreationPlanPreview | null {
  const goal = goalInput.trim().replace(/\s+/g, ' ');
  if (!goal) return null;
  const template = agentTemplateForGoal(goal);
  const templateDefinition = DATABASE_CREATION_TEMPLATES.find(
    (candidate) => candidate.key === template,
  );
  if (!templateDefinition) return null;
  const name = agentNameForGoal(goal, templateDefinition.name);
  const desiredState = createTemplateDatabaseDesiredState({ name, template });
  const source = desiredState.sources[0];
  const views = (desiredState.views ?? []).map((view) => {
    const layout = view.layout;
    const layoutType =
      layout && typeof layout === 'object' && 'type' in layout ? String(layout.type) : 'view';
    return { name: view.name, layout: layoutType };
  });
  return {
    goal,
    name,
    template,
    templateName: templateDefinition.name,
    properties: (source?.properties ?? []).map((property) => ({
      name: property.name,
      type: property.type,
    })),
    views,
    sampleRecords: desiredState.sampleRecords?.map((record) => record.values) ?? [],
  };
}

interface CreationProperty {
  key: string;
  name: string;
  type: 'title' | 'text' | 'number' | 'checkbox' | 'date' | 'select';
  required?: boolean;
  options?: Array<{ key: string; name: string }>;
}

type CreationView = NonNullable<DatabaseDesiredStateDraftInput['views']>[number];

const TEMPLATE_BOARD_GROUPS: Record<DatabaseCreationTemplateKey, string> = {
  tasks: 'status',
  projects: 'status',
  crm: 'stage',
  feedback: 'status',
  content_calendar: 'status',
  issue_tracking: 'status',
  research_evidence: 'confidence',
};

function templateViews(
  template: DatabaseCreationTemplateKey,
  sourceKey: string,
  properties: readonly CreationProperty[],
): CreationView[] {
  const propertyKeys = properties.map((property) => property.key);
  const groupPropertyKey = TEMPLATE_BOARD_GROUPS[template];
  return [
    {
      key: 'table',
      name: 'Table',
      sourceKey,
      layout: { type: 'table', configuration: {} },
      projection: { propertyKeys, body: 'hidden' },
    },
    {
      key: 'board',
      name: 'Board',
      sourceKey,
      layout: {
        type: 'board',
        configuration: {
          cardSize: 'medium',
          cardPreview: { type: 'none' },
          fitImage: false,
          colorColumns: true,
          groupLimit: 100,
          cardLimitPerGroup: 100,
        },
      },
      groups: [{ propertyKey: groupPropertyKey }],
      projection: { propertyKeys, body: 'hidden' },
    },
  ];
}

function stableKey(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '');
  return (normalized || fallback).slice(0, 128).replace(/_+$/g, '') || fallback;
}

function uniqueKeys(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    const base = stableKey(name, `column_${index + 1}`);
    let key = base;
    let suffix = 2;
    while (used.has(key)) {
      key = `${base.slice(0, Math.max(1, 128 - String(suffix).length - 1))}_${suffix}`;
      suffix += 1;
    }
    used.add(key);
    return key;
  });
}

function baseDesiredState(input: {
  name: string;
  folder?: string;
  includeSubfolders?: boolean;
  properties: readonly CreationProperty[];
  records?: readonly Record<string, unknown>[];
  views?: readonly CreationView[];
}): DatabaseDesiredStateDraftInput {
  const name = input.name.trim();
  if (!name) throw new Error('Database name is required');
  const key = stableKey(name, 'database');
  const folder = input.folder?.trim() || key;
  const records = input.records ?? [];
  return {
    database: {
      key,
      name,
      contract: {
        purpose: `Manage ${name}`,
        canonicality: 'canonical',
        vocabulary: [key],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
    },
    sources: [
      {
        key,
        name,
        recordMeaning: `One ${name} record`,
        folder,
        includeSubfolders: input.includeSubfolders ?? true,
        properties: input.properties.map((property) => ({ ...property })),
      },
    ],
    views: input.views
      ? [...input.views]
      : [
          {
            key: 'table',
            name: 'Table',
            sourceKey: key,
            layout: { type: 'table', configuration: {} },
            projection: {
              propertyKeys: input.properties.map((property) => property.key),
              body: 'hidden',
            },
          },
        ],
    templates: [],
    policy: {
      mode: 'review',
      allowedOperations: [],
      maxRecordsPerCommit: Math.max(1, records.length),
    },
    sampleRecords: records.map((values) => ({ sourceKey: key, values, body: '' })),
    recordMutations: [],
  };
}

export function createBlankDatabaseDesiredState(input: {
  name: string;
  folder?: string;
}): DatabaseDesiredStateDraftInput {
  return baseDesiredState({
    ...input,
    properties: [{ key: 'title', name: 'Title', type: 'title', required: true }],
  });
}

export function createExistingFolderDatabaseDesiredState(input: {
  name: string;
  folder: string;
  includeSubfolders?: boolean;
}): DatabaseDesiredStateDraftInput {
  if (!input.folder.trim()) throw new Error('Existing folder is required');
  return baseDesiredState({
    ...input,
    properties: [{ key: 'title', name: 'Title', type: 'title', required: true }],
  });
}

function templateProperties(template: DatabaseCreationTemplateKey): CreationProperty[] {
  if (template === 'tasks') {
    return [
      { key: 'title', name: 'Task', type: 'title', required: true },
      {
        key: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { key: 'todo', name: 'To do' },
          { key: 'doing', name: 'In progress' },
          { key: 'done', name: 'Done' },
        ],
      },
      {
        key: 'priority',
        name: 'Priority',
        type: 'select',
        options: [
          { key: 'low', name: 'Low' },
          { key: 'medium', name: 'Medium' },
          { key: 'high', name: 'High' },
        ],
      },
      { key: 'due', name: 'Due', type: 'date' },
      { key: 'assignee', name: 'Assignee', type: 'text' },
    ];
  }
  if (template === 'projects') {
    return [
      { key: 'title', name: 'Project', type: 'title', required: true },
      {
        key: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { key: 'planned', name: 'Planned' },
          { key: 'active', name: 'Active' },
          { key: 'paused', name: 'Paused' },
          { key: 'complete', name: 'Complete' },
        ],
      },
      { key: 'owner', name: 'Owner', type: 'text' },
      { key: 'due', name: 'Due', type: 'date' },
      { key: 'progress', name: 'Progress', type: 'number' },
    ];
  }
  if (template === 'feedback') {
    return [
      { key: 'title', name: 'Feedback', type: 'title', required: true },
      {
        key: 'type',
        name: 'Type',
        type: 'select',
        options: [
          { key: 'bug', name: 'Bug' },
          { key: 'idea', name: 'Idea' },
          { key: 'praise', name: 'Praise' },
          { key: 'question', name: 'Question' },
        ],
      },
      {
        key: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { key: 'new', name: 'New' },
          { key: 'triaged', name: 'Triaged' },
          { key: 'planned', name: 'Planned' },
          { key: 'done', name: 'Done' },
        ],
      },
      { key: 'source', name: 'Source', type: 'text' },
      { key: 'submitted', name: 'Submitted', type: 'date' },
    ];
  }
  if (template === 'content_calendar') {
    return [
      { key: 'title', name: 'Content', type: 'title', required: true },
      {
        key: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { key: 'idea', name: 'Idea' },
          { key: 'draft', name: 'Draft' },
          { key: 'scheduled', name: 'Scheduled' },
          { key: 'published', name: 'Published' },
        ],
      },
      { key: 'channel', name: 'Channel', type: 'text' },
      { key: 'publish_date', name: 'Publish date', type: 'date' },
    ];
  }
  if (template === 'issue_tracking') {
    return [
      { key: 'title', name: 'Issue', type: 'title', required: true },
      {
        key: 'status',
        name: 'Status',
        type: 'select',
        options: [
          { key: 'backlog', name: 'Backlog' },
          { key: 'in_progress', name: 'In progress' },
          { key: 'blocked', name: 'Blocked' },
          { key: 'done', name: 'Done' },
        ],
      },
      {
        key: 'priority',
        name: 'Priority',
        type: 'select',
        options: [
          { key: 'low', name: 'Low' },
          { key: 'medium', name: 'Medium' },
          { key: 'high', name: 'High' },
          { key: 'urgent', name: 'Urgent' },
        ],
      },
      { key: 'assignee', name: 'Assignee', type: 'text' },
      { key: 'due', name: 'Due', type: 'date' },
    ];
  }
  if (template === 'research_evidence') {
    return [
      { key: 'title', name: 'Claim', type: 'title', required: true },
      { key: 'source', name: 'Source', type: 'text' },
      {
        key: 'evidence_type',
        name: 'Evidence type',
        type: 'select',
        options: [
          { key: 'paper', name: 'Paper' },
          { key: 'dataset', name: 'Dataset' },
          { key: 'interview', name: 'Interview' },
          { key: 'observation', name: 'Observation' },
        ],
      },
      {
        key: 'confidence',
        name: 'Confidence',
        type: 'select',
        options: [
          { key: 'low', name: 'Low' },
          { key: 'medium', name: 'Medium' },
          { key: 'high', name: 'High' },
        ],
      },
      { key: 'reviewed', name: 'Reviewed', type: 'date' },
      { key: 'url', name: 'URL', type: 'text' },
    ];
  }
  return [
    { key: 'title', name: 'Company', type: 'title', required: true },
    { key: 'contact', name: 'Contact', type: 'text' },
    {
      key: 'stage',
      name: 'Stage',
      type: 'select',
      options: [
        { key: 'lead', name: 'Lead' },
        { key: 'qualified', name: 'Qualified' },
        { key: 'customer', name: 'Customer' },
      ],
    },
    { key: 'value', name: 'Value', type: 'number' },
  ];
}

function templateRecords(template: DatabaseCreationTemplateKey): Record<string, unknown>[] {
  if (template === 'tasks') {
    return [
      {
        title: 'Plan launch',
        status: 'todo',
        priority: 'high',
        due: '2026-08-01',
        assignee: 'Product team',
      },
      {
        title: 'Review metrics',
        status: 'doing',
        priority: 'medium',
        due: '2026-08-03',
        assignee: 'Growth team',
      },
    ];
  }
  if (template === 'projects') {
    return [
      {
        title: 'Website refresh',
        status: 'active',
        owner: 'Design',
        due: '2026-09-01',
        progress: 35,
      },
      {
        title: 'Quarterly planning',
        status: 'planned',
        owner: 'Operations',
        due: '2026-09-15',
        progress: 0,
      },
    ];
  }
  if (template === 'crm') {
    return [
      { title: 'Northwind', contact: 'hello@northwind.example', stage: 'qualified', value: 12000 },
      { title: 'Acme Labs', contact: 'team@acme.example', stage: 'lead', value: 5000 },
    ];
  }
  if (template === 'feedback') {
    return [
      {
        title: 'Keyboard shortcut request',
        type: 'idea',
        status: 'new',
        source: 'Inbox',
        submitted: '2026-07-18',
      },
      {
        title: 'Export feels slow',
        type: 'bug',
        status: 'triaged',
        source: 'Support',
        submitted: '2026-07-19',
      },
    ];
  }
  if (template === 'content_calendar') {
    return [
      { title: 'Product update', status: 'draft', channel: 'Blog', publish_date: '2026-08-05' },
      {
        title: 'Customer story',
        status: 'idea',
        channel: 'Newsletter',
        publish_date: '2026-08-12',
      },
    ];
  }
  if (template === 'issue_tracking') {
    return [
      {
        title: 'Fix empty state copy',
        status: 'in_progress',
        priority: 'medium',
        assignee: 'Frontend',
        due: '2026-07-28',
      },
      {
        title: 'Audit export permissions',
        status: 'backlog',
        priority: 'high',
        assignee: 'Platform',
        due: '2026-08-02',
      },
    ];
  }
  return [
    {
      title: 'Context packs reduce reading time',
      source: 'Retrieval benchmark',
      evidence_type: 'dataset',
      confidence: 'medium',
      reviewed: '2026-07-20',
      url: 'https://example.com/benchmark',
    },
    {
      title: 'Users prefer inline database creation',
      source: 'UX interview notes',
      evidence_type: 'interview',
      confidence: 'high',
      reviewed: '2026-07-21',
      url: 'https://example.com/interviews',
    },
  ];
}

export function createTemplateDatabaseDesiredState(input: {
  name: string;
  template: DatabaseCreationTemplateKey;
  folder?: string;
}): DatabaseDesiredStateDraftInput {
  const name = input.name.trim();
  const sourceKey = stableKey(name, 'database');
  const properties = templateProperties(input.template);
  return baseDesiredState({
    ...input,
    properties,
    records: templateRecords(input.template),
    views: templateViews(input.template, sourceKey, properties),
  });
}

function inferProperty(name: string, key: string, values: readonly string[]): CreationProperty {
  const present = values.filter((value) => value !== '');
  if (present.length > 0 && present.every((value) => value === 'true' || value === 'false')) {
    return { key, name, type: 'checkbox' };
  }
  if (
    present.length > 0 &&
    present.every(
      (value) => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)),
    )
  ) {
    return { key, name, type: 'number' };
  }
  if (present.length > 0 && present.every((value) => isDatabaseDateOnly(value))) {
    return { key, name, type: 'date' };
  }
  return { key, name, type: 'text' };
}

function typedValue(property: CreationProperty, value: string): unknown {
  if (value === '') return undefined;
  if (property.type === 'number') return Number(value);
  if (property.type === 'checkbox') return value === 'true';
  return value;
}

export function createDelimitedDatabaseDesiredState(input: {
  name: string;
  contents: string;
  delimiter: ',' | '\t' | ';';
  folder?: string;
}): DatabaseDesiredStateDraftInput {
  const [rawHeaders, ...rows] = parseDelimited(input.contents, input.delimiter);
  const headers = rawHeaders?.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '').trim() : header.trim(),
  );
  if (!headers || headers.length === 0 || headers.some((header) => !header)) {
    throw new Error('Every imported column requires a header');
  }
  if (new Set(headers).size !== headers.length) throw new Error('Imported headers must be unique');
  if (rows.length === 0) throw new Error('The imported file has no records');
  if (rows.length > DATABASE_CSV_IMPORT_RECORD_LIMIT) {
    throw new Error(`Database creation is limited to ${DATABASE_CSV_IMPORT_RECORD_LIMIT} records`);
  }
  if (rows.some((row) => (row[0] ?? '').trim() === '')) {
    throw new Error(`The first column "${headers[0]}" is the required Title and cannot be empty`);
  }
  const keys = uniqueKeys(headers);
  const properties = headers.map((header, column) =>
    column === 0
      ? ({ key: keys[0] ?? 'title', name: header, type: 'title', required: true } as const)
      : inferProperty(
          header,
          keys[column] ?? `column_${column + 1}`,
          rows.map((row) => row[column] ?? ''),
        ),
  );
  const records = rows.map((row) =>
    Object.fromEntries(
      properties.flatMap((property, column) => {
        const value = typedValue(property, row[column] ?? '');
        return value === undefined ? [] : [[property.key, value]];
      }),
    ),
  );
  return baseDesiredState({ ...input, properties, records });
}

export function summarizeDatabaseCreation(
  desiredState: DatabaseDesiredStateDraftInput,
): DatabaseCreationSummary {
  const source = desiredState.sources[0];
  const view = desiredState.views?.[0];
  if (!source || !view) throw new Error('Database creation requires an initial source and view');
  return {
    recordMeaning: source.recordMeaning,
    canonicalFolder: source.folder,
    stableKey: desiredState.database.key,
    initialView: view.name,
    propertyNames: source.properties.map((property) => property.name),
    initialRecordCount: desiredState.sampleRecords?.length ?? 0,
  };
}
