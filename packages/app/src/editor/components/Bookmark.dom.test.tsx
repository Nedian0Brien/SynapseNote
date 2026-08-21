/**
 * RTL behavioral tests for the `Bookmark` card.
 *
 * The card's job is to stay readable no matter how much of the metadata
 * is missing or broken, and to open its URL through the desktop bridge
 * rather than an in-app window. Those are the two things pinned here.
 *
 * Runs under `bun run test:dom` (jsdom substrate per precedent #43).
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const openExternalUrl = mock((_url: string) => {});
mock.module('@/lib/external-link', () => ({ openExternalUrl }));

const { Bookmark, bookmarkLocation } = await import('./Bookmark.tsx');

afterEach(() => {
  cleanup();
  openExternalUrl.mockClear();
});

describe('bookmarkLocation', () => {
  test('reads as a location, not a URL', () => {
    expect(bookmarkLocation('https://www.example.com/docs/intro?x=1')).toBe('example.com/docs/intro');
    expect(bookmarkLocation('https://example.com/')).toBe('example.com');
  });

  test('falls back to the raw value for anything unparseable', () => {
    expect(bookmarkLocation('not a url')).toBe('not a url');
    expect(bookmarkLocation(undefined)).toBe('');
  });
});

describe('Bookmark', () => {
  test('renders the captured metadata', () => {
    render(
      <Bookmark
        src="https://example.com/docs"
        title="Example Domain"
        description="Reserved for documentation."
        image="https://cdn.example.com/og.png"
        favicon="https://example.com/favicon.ico"
      />,
    );
    expect(screen.getByText('Example Domain')).toBeTruthy();
    expect(screen.getByText('Reserved for documentation.')).toBeTruthy();
    expect(screen.getByText('example.com/docs')).toBeTruthy();
    const images = document.querySelectorAll('img');
    expect(images.length).toBe(2);
    // Withheld from the remote host on both loads.
    for (const img of images) expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  test('a URL-only bookmark still reads as a link to that site', () => {
    render(<Bookmark src="https://example.com/docs" />);
    // Title falls back to the location, so the card is never blank.
    expect(screen.getAllByText('example.com/docs').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('img').length).toBe(0);
  });

  test('a broken thumbnail drops out instead of leaving a torn-image box', () => {
    render(<Bookmark src="https://example.com" image="https://cdn.example.com/gone.png" />);
    const image = document.querySelector('.ok-bookmark-thumb img');
    expect(image).toBeTruthy();
    fireEvent.error(image as Element);
    expect(document.querySelector('.ok-bookmark-thumb')).toBeNull();
  });

  test('a broken favicon falls back to the globe glyph', () => {
    render(<Bookmark src="https://example.com" favicon="https://example.com/gone.ico" />);
    const favicon = document.querySelector('.ok-bookmark-favicon');
    expect(favicon).toBeTruthy();
    fireEvent.error(favicon as Element);
    expect(document.querySelector('.ok-bookmark-favicon')).toBeNull();
    expect(document.querySelector('.ok-bookmark-favicon-fallback')).toBeTruthy();
  });

  test('click opens through the external-link route, not the anchor default', () => {
    render(<Bookmark src="https://example.com/docs" title="Example" />);
    fireEvent.click(screen.getByRole('link'));
    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/docs');
  });

  test('a non-http src renders but is not openable', () => {
    render(<Bookmark src="javascript:alert(1)" title="Nope" />);
    const card = document.querySelector('.ok-bookmark');
    expect(card?.getAttribute('data-bookmark-openable')).toBe('false');
    expect(card?.getAttribute('href')).toBeNull();
    fireEvent.click(card as Element);
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  test('a data: image is refused — bookmarks never inline a payload', () => {
    render(<Bookmark src="https://example.com" image="data:image/png;base64,AAAA" />);
    expect(document.querySelector('.ok-bookmark-thumb')).toBeNull();
  });
});
