export async function bootstrapDevTools({
  isDev = import.meta.env.DEV,
  isTopLevelWindow = typeof window === 'undefined' ? true : window.top === window,
  loadReactGrab = () => import('react-grab'),
} = {}) {
  if (!isDev || !isTopLevelWindow) return;

  const reactGrabModule = await loadReactGrab();
  const api = typeof reactGrabModule?.init === 'function' ? reactGrabModule.init() : null;

  if (api?.setEnabled) api.setEnabled(true);
  if (api?.activate) api.activate();
}
