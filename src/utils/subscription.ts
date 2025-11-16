/**
 * Check if the current host is an official AppFlowy host
 * Official hosts are beta.appflowy.cloud, test.appflowy.cloud, and localhost (for development)
 * Self-hosted instances are not official hosts
 */
export function isOfficialHost(): boolean {
    if (typeof window === 'undefined') return false;

    // Support Storybook mocking via global variable
    const hostname = (window as Window & { __STORYBOOK_MOCK_HOSTNAME__?: string }).__STORYBOOK_MOCK_HOSTNAME__ || window.location.hostname;

    return (
        hostname === 'beta.appflowy.cloud' ||
        hostname === 'test.appflowy.cloud'
        // hostname === 'localhost' ||
        // hostname === '127.0.0.1' ||
        // hostname.startsWith('localhost:') ||
        // hostname.startsWith('127.0.0.1:')
    );
}

