/**
 * Check if the current host is an official AppFlowy host
 * Official hosts are beta.appflowy.cloud and test.appflowy.cloud
 * Self-hosted instances are not official hosts
 */
export function isOfficialHost(): boolean {
    if (typeof window === 'undefined') return false;
    // Support Storybook mocking via global variable
    const hostname = (window as any).__STORYBOOK_MOCK_HOSTNAME__ || window.location.hostname;
    return hostname === 'beta.appflowy.cloud' || hostname === 'test.appflowy.cloud';
}

