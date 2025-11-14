import { createContext, useCallback, useContext, useState } from 'react';

import { useBoardLayoutSettings, useGroupsSelector } from '@/application/database-yjs';
import { useMoveCardDispatch, useNewRowDispatch } from '@/application/database-yjs/dispatch';

type BoardContextType = {
  groupId: string;
  selectedCardIds: string[];
  setSelectedCardIds: (ids: string[]) => void;
  editingCardId: string | null;
  setEditingCardId: (id: string | null) => void;
  creatingColumnId: string | null;
  setCreatingColumnId: (id: string | null) => void;
  createCard: (columnId: string, beforeCardId?: string) => Promise<string | null>;
  moveCard: ({
    rowId,
    beforeRowId,
    startColumnId,
    finishColumnId,
  }: {
    rowId: string;
    beforeRowId?: string;
    startColumnId: string;
    finishColumnId: string;
  }) => void;
};

const BoardContext = createContext<BoardContextType>({
  groupId: '',
  selectedCardIds: [],
  setSelectedCardIds: () => undefined,
  editingCardId: null,
  setEditingCardId: () => undefined,
  creatingColumnId: null,
  setCreatingColumnId: () => undefined,
  createCard: () => Promise.resolve(null),
  moveCard: () => undefined,
});

export function useBoardContext() {
  const context = useContext(BoardContext);

  if (!context) {
    throw new Error('useBoardContext must be used within a BoardProvider');
  }

  return context;
}

export const BoardProvider = ({ children }: { children: React.ReactNode }) => {
  const groups = useGroupsSelector();
  const groupId = groups[0];
  const { fieldId } = useBoardLayoutSettings();
  const onMoveCard = useMoveCardDispatch();

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [creatingColumnId, setCreatingColumnId] = useState<string | null>(null);
  const onNewCard = useNewRowDispatch();

  const createCard = useCallback(
    async (columnId: string, beforeCardId?: string) => {
      if (!fieldId) return null;
      const cellsData = {
        [fieldId]: columnId,
      };

      const beforeRowId = beforeCardId ? beforeCardId.split('/')[1] : undefined;
      const cardId = await onNewCard({cellsData, beforeRowId});

      if (!cardId) return null;
      setSelectedCardIds([]);

      setEditingCardId(`${columnId}/${cardId}`);
      return cardId;
    },
    [fieldId, onNewCard]
  );

  const moveCard = useCallback(
    ({
      rowId,
      beforeRowId,
      startColumnId,
      finishColumnId,
    }: {
      rowId: string;
      beforeRowId?: string;
      startColumnId: string;
      finishColumnId: string;
    }) => {
      if (!fieldId) return;
      onMoveCard({ rowId, beforeRowId, fieldId, startColumnId, finishColumnId });
      setSelectedCardIds([`${finishColumnId}/${rowId}`]);
    },
    [fieldId, onMoveCard]
  );

  return (
    <BoardContext.Provider
      value={{
        groupId,
        selectedCardIds,
        setSelectedCardIds,
        editingCardId,
        setEditingCardId,
        creatingColumnId,
        setCreatingColumnId,
        createCard,
        moveCard,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
};
