import { afterEach, describe, expect, test } from 'bun:test';
import { act, createContext, use } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LivePortalHost, LivePortalRegistry } from './live-portals';

const Context = createContext('missing');
const roots: Root[] = [];

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function Reader() {
  return <span>{use(Context)}</span>;
}

function mount(registry: LivePortalRegistry, value: string): Root {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() =>
    root.render(
      <Context.Provider value={value}>
        <LivePortalHost registry={registry} />
      </Context.Provider>,
    ),
  );
  return root;
}

describe('live widget portals', () => {
  test('inherits the document context and survives a host remount', () => {
    const registry = new LivePortalRegistry();
    const target = document.createElement('div');
    document.body.append(target);
    mount(registry, 'first document');
    let id = 0;
    act(() => {
      id = registry.register(target, <Reader />);
    });
    expect(target.textContent).toBe('first document');

    act(() => roots.splice(0)[0]?.unmount());
    expect(target.textContent).toBe('');
    mount(registry, 'reattached document');
    expect(target.textContent).toBe('reattached document');

    act(() => registry.update(id, <span>updated</span>));
    expect(target.textContent).toBe('updated');
    act(() => registry.unregister(id));
    expect(target.textContent).toBe('');
  });

  test('defers renderer work until a host observes the cached view', async () => {
    const registry = new LivePortalRegistry();
    let started = 0;
    registry.whenObserved(() => {
      started++;
    });
    expect(started).toBe(0);
    mount(registry, 'ready');
    await act(async () => {
      await Promise.resolve();
    });
    expect(started).toBe(1);

    const parked = new LivePortalRegistry();
    const cancel = parked.whenObserved(() => {
      started++;
    });
    cancel();
    mount(parked, 'later');
    await act(async () => {
      await Promise.resolve();
    });
    expect(started).toBe(1);
  });
});
