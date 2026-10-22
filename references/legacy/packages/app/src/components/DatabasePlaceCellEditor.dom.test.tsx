import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabasePlaceCellEditor } from './DatabasePlaceCellEditor';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('DatabasePlaceCellEditor', () => {
  test('keeps manual editing offline and requires consent for each submitted search', async () => {
    const onDraftChange = mock(() => {});
    let requests = 0;
    globalThis.fetch = mock(async () => {
      requests += 1;
      return Response.json({
        status: 'unavailable',
        providerId: null,
        candidates: [],
        attribution: null,
        offlineFallback: true,
      });
    }) as typeof fetch;

    render(
      <DatabasePlaceCellEditor
        draft={JSON.stringify({
          label: 'City Hall',
          address: 'Seoul',
          lat: 37.57,
          lon: 126.98,
          precision: 'approximate',
          source: 'manual',
        })}
        property={{
          id: 'prop_place',
          key: 'place',
          name: 'Place',
          type: 'place',
          externalSearch: 'explicit',
          externalMap: 'disabled',
        }}
        onDraftChange={onDraftChange}
      />,
    );

    expect(screen.getByText(/No address or coordinate leaves this device/)).toBeTruthy();
    const search = screen.getByRole('button', { name: 'Search address' });
    expect((search as HTMLButtonElement).disabled).toBe(true);
    expect(requests).toBe(0);

    fireEvent.change(screen.getByLabelText('Place latitude'), { target: { value: '' } });
    expect(JSON.parse(onDraftChange.mock.calls.at(-1)?.[0] as string).lat).toBeNull();
    expect(requests).toBe(0);

    fireEvent.click(screen.getByLabelText('Allow this address query to leave the device'));
    fireEvent.click(search);
    await waitFor(() => expect(requests).toBe(1));
    expect(screen.getByText(/No geocoder is configured/)).toBeTruthy();
    expect((search as HTMLButtonElement).disabled).toBe(true);
  });
});
