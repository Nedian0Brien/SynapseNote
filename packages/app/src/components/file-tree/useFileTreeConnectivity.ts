import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { getRelaunchInFlightSnapshot, useRelaunchInFlight } from '@/lib/relaunch-store';

const CONNECTIVITY_RECONNECT_RETRY_MS = 2000;

type Input = {
  refreshDocsScheduleRef: MutableRefObject<(() => void) | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  unreachableMessage: string;
};

/** Owns desktop-relaunch retry state and distinguishes transient reachability from server errors. */
export function useFileTreeConnectivity({
  refreshDocsScheduleRef,
  setError,
  unreachableMessage,
}: Input) {
  const [reconnecting, setReconnecting] = useState(false);
  const relaunchInFlight = useRelaunchInFlight();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearConnectivityRetry = () => {
    if (retryTimerRef.current === null) return;
    clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  };
  const noteConnectivityRecovered = () => {
    clearConnectivityRetry();
    setReconnecting(false);
  };
  const reportServerReachableError = (title: string) => {
    noteConnectivityRecovered();
    setError(title);
  };
  const reportConnectivityFailure = () => {
    clearConnectivityRetry();
    if (getRelaunchInFlightSnapshot()) {
      setError(null);
      setReconnecting(true);
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        refreshDocsScheduleRef.current?.();
      }, CONNECTIVITY_RECONNECT_RETRY_MS);
      return;
    }
    setReconnecting(false);
    setError(unreachableMessage);
  };
  const firstRelaunchEffectRunRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: relaunch is a transition trigger; the scheduler is intentionally read through its stable ref.
  useEffect(() => {
    if (firstRelaunchEffectRunRef.current) {
      firstRelaunchEffectRunRef.current = false;
      return;
    }
    refreshDocsScheduleRef.current?.();
  }, [relaunchInFlight]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount/unmount cleanup reads a stable timer ref.
  useEffect(() => clearConnectivityRetry, []);
  return {
    reconnecting,
    relaunchInFlight,
    noteConnectivityRecovered,
    reportServerReachableError,
    reportConnectivityFailure,
  };
}
