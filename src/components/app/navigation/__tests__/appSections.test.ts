import { APP_SECTIONS, getAppSectionPath, isAppSection } from '../appSections';

describe('appSections', () => {
  it('uses Agent as the fourth app section instead of Search', () => {
    expect(APP_SECTIONS).toEqual(['home', 'library', 'graph', 'agent']);
    expect(isAppSection('agent')).toBe(true);
    expect(isAppSection('search')).toBe(false);
    expect(getAppSectionPath('workspace-id', 'agent')).toBe('/app/workspace-id/agent');
  });
});
