import React, { Suspense } from 'react';
import { Awareness } from 'y-protocols/awareness';

import { AppContext } from '@/components/app/app.hooks';
import { AIChatProvider } from '@/components/ai-chat/AIChatProvider';
import { AppOverlayProvider } from '@/components/app/app-overlay/AppOverlayProvider';
import RequestAccess from '@/components/app/landing-pages/RequestAccess';
import { useAllContextData } from '../hooks/useAllContextData';

const ViewModal = React.lazy(() => import('@/components/app/ViewModal'));

interface AppContextConsumerProps {
  children: React.ReactNode;
  requestAccessOpened: boolean;
  openModalViewId?: string;
  setOpenModalViewId: (id: string | undefined) => void;
  awarenessMap: Record<string, Awareness>;
}

// Component that consumes all internal contexts and provides the unified AppContext
// This maintains the original AppContext API while using the new layered architecture internally
export const AppContextConsumer: React.FC<AppContextConsumerProps> = ({ 
  children, 
  requestAccessOpened,
  openModalViewId,
  setOpenModalViewId,
  awarenessMap,
}) => {
  // Merge all layer data into the complete AppContextType
  const allContextData = useAllContextData(awarenessMap);

  return (
    <AppContext.Provider value={allContextData}>
      <AIChatProvider>
        <AppOverlayProvider>
          {requestAccessOpened ? <RequestAccess /> : children}
          {
            <Suspense>
              <ViewModal
                open={!!openModalViewId}
                viewId={openModalViewId}
                onClose={() => {
                  setOpenModalViewId(undefined);
                }}
              />
            </Suspense>
          }
        </AppOverlayProvider>
      </AIChatProvider>
    </AppContext.Provider>
  );
};