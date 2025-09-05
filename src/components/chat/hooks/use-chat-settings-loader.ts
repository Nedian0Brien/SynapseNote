import { useChatContext } from '@/components/chat/chat/context';
import { ChatSettings } from '@/components/chat/types';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

export function useChatSettingsLoader() {
  const [loading, setLoading] = useState(true);
  const [chatSettings, setChatSettings] = useState<ChatSettings | null>(null);
  const {
    requestInstance,
    chatId,
  } = useChatContext();

  useEffect(() => {
    return () => {
      setLoading(true);
      setChatSettings(null);
    };
  }, [chatId]);

  const fetchChatSettings = useCallback(async() => {
    try {
      const data = await requestInstance.getChatSettings();

      setLoading(false);
      setChatSettings(data);
      return data;
      // eslint-disable-next-line
    } catch(e: any) {
      setLoading(false);
    }
  }, [requestInstance]);

  const updateChatSettings = useCallback(async(payload: Partial<ChatSettings>) => {
    try {
      await requestInstance.updateChatSettings(payload);
      // eslint-disable-next-line
    } catch(e: any) {
      toast.error(e.message);
    }
  }, [requestInstance]);

  return {
    loading,
    fetchChatSettings,
    updateChatSettings,
    chatSettings,
  };
}