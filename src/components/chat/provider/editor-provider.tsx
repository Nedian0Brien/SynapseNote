import { useEditor } from '@/vendor/synapsenote-editor';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import { useChatContext } from '@/components/chat/chat/context';

type SynapseNoteEditor = ReturnType<typeof useEditor>;

interface EditorContextTypes {
  getEditor: (messageId: number) => SynapseNoteEditor | undefined;
  setEditor: (messageId: number, editor: SynapseNoteEditor) => void;
}

const EditorContext = createContext<EditorContextTypes | undefined>(undefined);

export const EditorProvider = ({ children }: { children: ReactNode }) => {
  const {
    chatId,
  } = useChatContext();
  const editorsRef = useRef<Map<number, SynapseNoteEditor>>(new Map());

  useEffect(() => {
    editorsRef.current.clear();
  }, [chatId]);

  const getEditor = useCallback((messageId: number) => {
    return editorsRef.current.get(messageId);
  }, [editorsRef]);

  const setEditor = useCallback((messageId: number, editor: SynapseNoteEditor) => {
    editorsRef.current.set(messageId, editor);
  }, [editorsRef]);
  const contextValue = useMemo(
    () => ({
      getEditor,
      setEditor,
    }),
    [getEditor, setEditor]
  );

  return (
    <EditorContext.Provider value={contextValue}>
      {children}
    </EditorContext.Provider>
  );
};

export function useEditorContext() {
  const context = useContext(EditorContext);

  if(!context) {
    throw new Error('useEditorContext must be used within a EditorProvider');
  }

  return context;
}
