import { useEffect } from 'react';

export function useVaultEvents(onVaultEvent, { enabled = true } = {}) {
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return undefined;

    const source = new EventSource('/api/vault/events', { withCredentials: true });

    const handleVaultEvent = (message) => {
      let event;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      onVaultEvent(event);
    };

    source.addEventListener('vault', handleVaultEvent);

    return () => {
      source.removeEventListener('vault', handleVaultEvent);
      source.close();
    };
  }, [enabled, onVaultEvent]);
}
