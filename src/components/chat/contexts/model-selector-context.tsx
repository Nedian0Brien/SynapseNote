import { createContext, useContext } from 'react';
import { AvailableModel } from '@/components/chat/types/ai-model';

export interface ModelSelectorContextType {
  // Current selected model
  selectedModelName?: string;
  setSelectedModelName?: (modelName: string) => void;
  
  // Optional: for chat context - server sync capabilities  
  requestInstance?: {
    getModelList: () => Promise<{ models: AvailableModel[] }>;
    getChatSettings: () => Promise<{ metadata?: Record<string, unknown> }>;
    updateChatSettings: (params: { metadata: Record<string, unknown> }) => Promise<void>;
  };
  
  // Optional: for chat context - identification
  chatId?: string;
}

export const ModelSelectorContext = createContext<ModelSelectorContextType | undefined>(undefined);

export function useModelSelectorContext() {
  const context = useContext(ModelSelectorContext);

  return context; // Return undefined if no provider
}