import { describe, expect, test } from 'bun:test';
import {
  databaseFolderNameFromTitle,
  databaseManagedSourceFolder,
  databasePathNameWithCollisionSuffix,
  databaseRecordNameFromTitle,
} from './path-names.ts';

describe('database title path names', () => {
  test('preserves readable Unicode titles and document-relative parents', () => {
    expect(databaseFolderNameFromTitle('프로젝트 일정')).toBe('프로젝트 일정');
    expect(databaseRecordNameFromTitle('첫 번째 작업')).toBe('첫 번째 작업');
    expect(databaseManagedSourceFolder('문서/기획', '프로젝트 일정')).toBe(
      '문서/기획/프로젝트 일정',
    );
  });

  test('sanitizes invalid path characters without exposing internal ids', () => {
    expect(databaseFolderNameFromTitle('Roadmap: Q3/Q4')).toBe('Roadmap- Q3-Q4');
    expect(databaseRecordNameFromTitle('')).toBe('Untitled');
  });

  test('adds a human collision suffix before the extension', () => {
    expect(databasePathNameWithCollisionSuffix('Tasks', 2)).toBe('Tasks (2)');
    expect(databasePathNameWithCollisionSuffix('Task', 3)).toBe('Task (3)');
  });
});
