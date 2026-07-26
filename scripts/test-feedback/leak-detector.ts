type ActiveProcess = NodeJS.Process & {
  _getActiveHandles?: () => unknown[];
  _getActiveRequests?: () => unknown[];
};

export interface TestRuntimeState {
  activeHandleKinds: Record<string, number>;
  activeRequestCount: number;
  environment: Record<string, string | undefined>;
  resources: string[];
}

const liveResources = new Map<string, string>();
let resourceSequence = 0;

function activeProcess(): ActiveProcess {
  return process as ActiveProcess;
}

function activeHandleKinds(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const handle of activeProcess()._getActiveHandles?.() ?? []) {
    const kind =
      handle && typeof handle === 'object' && 'constructor' in handle
        ? String((handle as { constructor?: { name?: string } }).constructor?.name ?? 'unknown')
        : typeof handle;
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

export function trackTestResource(kind: string, label: string): () => void {
  const id = `${kind}:${label}:${resourceSequence++}`;
  liveResources.set(id, kind);
  return () => liveResources.delete(id);
}

export function captureTestRuntimeState(env: NodeJS.ProcessEnv = process.env): TestRuntimeState {
  return {
    environment: { ...env },
    activeHandleKinds: activeHandleKinds(),
    activeRequestCount: activeProcess()._getActiveRequests?.().length ?? 0,
    resources: [...liveResources.entries()].map(([id, kind]) => `${kind}:${id}`).sort(),
  };
}

export function restoreEnvironment(
  snapshot: Record<string, string | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  for (const key of Object.keys(env)) {
    if (!(key in snapshot)) delete env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
}

export function assertNoTestRuntimeLeaks(
  before: TestRuntimeState,
  after: TestRuntimeState,
  options: { allowedEnvironmentKeys?: string[]; label?: string } = {},
): void {
  const allowed = new Set(options.allowedEnvironmentKeys ?? []);
  const changedEnvironment = Object.keys({ ...before.environment, ...after.environment }).filter(
    (key) => !allowed.has(key) && before.environment[key] !== after.environment[key],
  );
  const newResources = after.resources.filter((resource) => !before.resources.includes(resource));
  const extraHandles = Object.entries(after.activeHandleKinds).filter(
    ([kind, count]) => count > (before.activeHandleKinds[kind] ?? 0),
  );
  const requestDelta = after.activeRequestCount - before.activeRequestCount;
  if (
    changedEnvironment.length > 0 ||
    newResources.length > 0 ||
    extraHandles.length > 0 ||
    requestDelta > 0
  ) {
    throw new Error(
      `${options.label ?? 'test'} leaked runtime state: ${JSON.stringify({
        changedEnvironment,
        newResources,
        extraHandles,
        requestDelta,
      })}`,
    );
  }
}
