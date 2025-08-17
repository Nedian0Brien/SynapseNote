import { useCallback, useEffect, useMemo, useState } from 'react';

import { messages } from '@/proto/messages';

export type BroadcastChannelType = {
  lastBroadcastMessage: messages.Message | null;
  postMessage: (msg: messages.IMessage, keep?: boolean) => void;
};

export const useBroadcastChannel = (channelName: string): BroadcastChannelType => {
  const channel = useMemo(() => new BroadcastChannel(channelName), [channelName]);
  const [lastMessage, setLastMessage] = useState<messages.Message | null>(null);
  const [isChannelClosed, setIsChannelClosed] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = messages.Message.decode(new Uint8Array(event.data));

      setLastMessage(message);
    };

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      setIsChannelClosed(true);
      channel.close();
    };
  }, [channel]);

  const sendMessage = useCallback(
    (msg: messages.IMessage) => {
      if (isChannelClosed) {
        console.warn('⚠️ You cannot send message to a closed channel');
        return;
      }

      try {
        channel.postMessage(messages.Message.encode(msg).finish());
      } catch (error) {
        console.error('Failed to send message to BroadcastChannel:', error);
      }
    },
    [channel, isChannelClosed]
  );

  return { lastBroadcastMessage: lastMessage, postMessage: sendMessage };
};
