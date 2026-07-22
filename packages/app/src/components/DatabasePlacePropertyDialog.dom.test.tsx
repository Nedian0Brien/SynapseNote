import { afterEach, describe, expect, mock, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabasePlacePropertyDialog } from './DatabasePlacePropertyDialog';

i18n.load('en', {});
i18n.activate('en');

afterEach(cleanup);

describe('DatabasePlacePropertyDialog', () => {
  test('starts fail closed and saves independently reviewed external capabilities', () => {
    const onSave = mock(() => {});
    render(
      <I18nProvider i18n={i18n}>
        <DatabasePlacePropertyDialog
          open
          onOpenChange={() => {}}
          property={{
            id: 'prop_place',
            key: 'place',
            name: 'Place',
            type: 'place',
            externalSearch: 'disabled',
            externalMap: 'disabled',
          }}
          onSave={onSave}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/Manual Place editing.*work offline/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Enable explicit external address search'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      externalSearch: 'explicit',
      externalMap: 'disabled',
    });
  });
});
