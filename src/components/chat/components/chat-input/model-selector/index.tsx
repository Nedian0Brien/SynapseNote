import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ReactComponent as AISparksIcon } from '@/components/chat/assets/icons/ai_sparks.svg';

import { Button } from '@/components/chat/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/chat/components/ui/popover';
import { useModelSelectorContext } from '@/components/chat/contexts/model-selector-context';
import { MESSAGE_VARIANTS } from '@/components/chat/lib/animations';
import { ModelCache } from '@/components/chat/lib/model-cache';
import { cn } from '@/components/chat/lib/utils';
import { AvailableModel, toModelDisplayInfo } from '@/components/chat/types/ai-model';

interface ModelSelectorProps {
  className?: string;
  disabled?: boolean;
}

export function ModelSelector({ className, disabled }: ModelSelectorProps) {

  const [open, setOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(''); // Start empty, will be loaded from settings
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get unified context for model selection
  const context = useModelSelectorContext();

  const requestInstance = context?.requestInstance;
  const chatId = context?.chatId;
  const setSelectedModelName = context?.setSelectedModelName;
  const contextSelectedModel = context?.selectedModelName;


  // Initialize: Load cached model or sync with context
  useEffect(() => {
    // If no context, just mark as initialized
    if (!context) {
      setIsInitialized(true);
      return;
    }

    // Sync with context's selected model
    if (contextSelectedModel) {
      setSelectedModel(contextSelectedModel);
    }

    // If we have chat capabilities, load from server
    if (!chatId || !requestInstance || isInitialized) {
      setIsInitialized(true);
      return;
    }

    // Step 1: Load from cache immediately for instant UI
    const cachedModel = ModelCache.get(chatId);

    if (cachedModel) {
      setSelectedModel(cachedModel);
      setSelectedModelName?.(cachedModel);
    }

    // Step 2: Fetch chat settings in background to get the truth
    const loadChatSettings = async () => {
      try {
        const settings = await requestInstance.getChatSettings();
        const modelFromSettings = settings.metadata?.ai_model as string | undefined;

        if (modelFromSettings) {
          // Server has a model saved, use it
          setSelectedModel(modelFromSettings);
          setSelectedModelName?.(modelFromSettings);
          ModelCache.set(chatId, modelFromSettings);
        }
        // Don't set a default if there's no saved model - let user choose
        // If no model in settings but we have cache, keep using cache
      } catch (error) {
        console.warn('Failed to load chat settings', error);
        // Keep cached model if available, otherwise let user choose
      }
    };

    void loadChatSettings();
    setIsInitialized(true);
  }, [chatId, requestInstance, isInitialized, setSelectedModelName, context, contextSelectedModel]);

  const loadModels = useCallback(async () => {
    if (!requestInstance) {
      // Provide fallback models when no context (e.g., in writer mode)
      setModels([
        { name: 'Auto', metadata: { is_default: true, desc: 'Auto select the best model for writing tasks' } },
      ]);
      return;
    }

    setLoading(true);
    try {
      const modelList = await requestInstance.getModelList();

      setModels(modelList.models);

      // Don't override the selected model - it should come from chat settings
    } catch (error) {
      console.error('Failed to load models:', error);
      // Fallback to Auto only if API fails
      setModels([
        { name: 'Auto', metadata: { is_default: true, desc: 'Auto select the best model' } },
      ]);
    } finally {
      setLoading(false);
    }
  }, [requestInstance]);

  // Load models when popover opens
  useEffect(() => {
    if (open && models.length === 0) {
      void loadModels();
    }
  }, [open, models.length, loadModels]);

  // Focus search input when popover opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  const handleSelect = useCallback(async (modelName: string) => {
    // Update UI immediately
    setSelectedModel(modelName);
    setOpen(false);

    // Update context if available (works for both chat and writer contexts)
    if (setSelectedModelName) {
      setSelectedModelName(modelName);
    }

    // For chat context: update cache and server settings
    if (chatId && requestInstance) {
      ModelCache.set(chatId, modelName);

      try {
        await requestInstance.updateChatSettings({
          metadata: {
            ai_model: modelName
          }
        });
      } catch (error) {
        console.error('Failed to update chat settings:', error);
        // Cache is already updated, so user experience is not affected
      }
    }

    // For writer context: model is already updated via setSelectedModelName
    // No additional persistence needed as it's session-based
  }, [setSelectedModelName, chatId, requestInstance]);

  const filteredModels = models.filter((model) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();

    return (
      model.name.toLowerCase().includes(query) ||
      model.metadata?.desc?.toLowerCase().includes(query) ||
      model.provider?.toLowerCase().includes(query)
    );
  });

  // Use writer's model if in writer context, otherwise use local selected model
  const currentModel = contextSelectedModel || selectedModel;
  const selectedModelData = models.find((m) => m.name === currentModel);
  const displayText = selectedModelData?.name || currentModel || 'Select Model';

  const getProviderIcon = (_provider?: string) => {
    // You can add specific icons for different providers here
    return null;
  };

  // Always render the button, even without full context
  const hasContext = !!(requestInstance && chatId);


  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn('h-7 px-2 text-xs font-normal gap-1', className)}
          onMouseDown={(e) => e.preventDefault()}
          disabled={disabled}
          title={hasContext ? 'Select AI Model' : 'Model selector (offline mode)'}
        >
          {AISparksIcon ? (
            <AISparksIcon className="w-4 h-4" />
          ) : (
            <span className="text-[10px]">🤖</span>
          )}
          <span className="truncate max-w-[120px]">{displayText}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent asChild
        className="w-[380px] p-0 rounded-lg"
        align="start"
        side="top"
        sideOffset={8}
      >
        <motion.div
          variants={MESSAGE_VARIANTS.getSelectorVariants()}
          initial="hidden"
          animate={open ? "visible" : "exit"}
        >
          {/* Search Input */}
          <div className="px-3 py-2 border-b border-border-primary">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-2 py-1 text-sm bg-transparent outline-none placeholder:text-text-placeholder"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
            />
          </div>

          {/* Models List */}
          <div className="max-h-[380px] overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-8 text-center text-sm text-text-secondary">
                Loading models...
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-text-secondary">
                {searchQuery ? 'No models found' : 'No models available'}
              </div>
            ) : (
              filteredModels.map((model) => {
                const displayInfo = toModelDisplayInfo(model);
                const isSelected = currentModel === model.name;

                return (
                  <button
                    key={displayInfo.id}
                    onClick={() => handleSelect(model.name)}
                    className={cn(
                      'w-full px-3 py-2.5 text-left hover:bg-fill-content-hover transition-colors',
                      'flex items-start justify-between group',
                      'focus:outline-none focus:bg-fill-content-hover',
                      isSelected && 'bg-fill-content-select'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getProviderIcon(model.provider)}
                        <span className={cn(
                          "text-sm font-medium",
                          isSelected && "text-primary"
                        )}>
                          {model.name}
                        </span>
                      </div>
                      {model.metadata?.desc && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate pr-2">
                          {model.metadata.desc}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-primary mt-0.5 ml-2 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}

export default ModelSelector;