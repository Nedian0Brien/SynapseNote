import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDatabaseManifestYaml, serializeDatabaseManifestYaml } from './manifest.ts';
import { materializeDatabaseRecord } from './record.ts';

const fixtureUrl = (path: string): string =>
  fileURLToPath(new URL(`./fixtures/v1/${path}`, import.meta.url));

describe('database v1 golden fixtures', () => {
  test('a standalone core clone interprets every current canonical object and property type', async () => {
    const manifest = parseDatabaseManifestYaml(await readFile(fixtureUrl('database.yml'), 'utf-8'));
    expect(manifest.ok).toBe(true);
    if (!manifest.ok) return;

    const propertyTypes = new Set(
      manifest.definition.sources.flatMap((source) =>
        source.properties.map((property) => property.type),
      ),
    );
    expect([...propertyTypes].sort()).toEqual([
      'checkbox',
      'date',
      'email',
      'files',
      'multi_select',
      'number',
      'person',
      'phone',
      'place',
      'relation',
      'select',
      'text',
      'title',
      'unique_id',
      'url',
    ]);
    expect(manifest.definition.views).toMatchObject([
      {
        id: 'view_feedback_table',
        sourceId: 'ds_feedback',
        layout: { type: 'table', configuration: { rowHeight: 'compact' } },
        groups: [{ propertyId: 'prop_feedback_status' }],
        projection: {
          propertyIds: ['prop_feedback_title', 'prop_feedback_status', 'prop_feedback_received'],
        },
      },
    ]);

    const feedback = materializeDatabaseRecord({
      definition: manifest.definition,
      sourceId: 'ds_feedback',
      path: 'records/feedback/report.md',
      markdown: await readFile(fixtureUrl('records/feedback/report.md'), 'utf-8'),
    });
    expect(feedback).toMatchObject({
      ok: true,
      record: {
        id: 'rec_feedback_report',
        values: {
          prop_feedback_title: 'Mobile navigation feedback',
          prop_feedback_notes: 'The navigation hierarchy is hard to scan.',
          prop_feedback_score: 4.5,
          prop_feedback_resolved: false,
          prop_feedback_received: '2026-07-19T09:30:00+09:00',
          prop_feedback_status: 'opt_status_new',
          prop_feedback_topics: ['opt_topic_ux', 'opt_topic_mobile'],
          prop_feedback_url: 'https://example.com/feedback/1',
          prop_feedback_email: 'person@example.com',
          prop_feedback_phone: '+82-10-1234-5678',
          prop_feedback_place: {
            label: 'City Hall',
            address: 'Jongno-gu, Seoul',
            lat: 37.57,
            lon: 126.98,
            precision: 'approximate',
            source: 'manual',
          },
          prop_feedback_owners: ['person_fixture_owner'],
          prop_feedback_files: [
            {
              kind: 'local',
              path: 'assets/mobile-navigation.png',
              caption: 'Navigation screenshot',
            },
            {
              kind: 'external',
              url: 'https://example.com/demo.mp4',
              name: 'Demo video',
            },
          ],
          prop_feedback_project: 'rec_project_mobile',
        },
      },
    });

    const project = materializeDatabaseRecord({
      definition: manifest.definition,
      sourceId: 'ds_projects',
      path: 'records/projects/mobile.md',
      markdown: await readFile(fixtureUrl('records/projects/mobile.md'), 'utf-8'),
    });
    expect(project).toMatchObject({
      ok: true,
      record: {
        id: 'rec_project_mobile',
        values: { prop_project_title: 'Mobile application' },
      },
    });

    expect(parseDatabaseManifestYaml(serializeDatabaseManifestYaml(manifest.definition))).toEqual(
      manifest,
    );
  });
});
