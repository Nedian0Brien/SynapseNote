import { describe, expect, test } from 'bun:test';
import { DATABASE_BOARD_CARD_COLORS } from './DatabaseBoard';
import { DATABASE_CALENDAR_COLORS } from './DatabaseCalendar';
import { DATABASE_GALLERY_COLORS } from './DatabaseGallery';
import { DATABASE_LIST_COLORS } from './DatabaseList';
import { DATABASE_CONDITIONAL_COLOR_CLASSES } from './DatabaseTableDialog';
import { DATABASE_TIMELINE_COLORS } from './DatabaseTimeline';

function channel(value: string): number {
  const normalized = value.length === 2 ? value : `0${value}`;
  const component = Number.parseInt(normalized, 16) / 255;
  return component <= 0.03928 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex.slice(1, 3)) +
    0.7152 * channel(hex.slice(3, 5)) +
    0.0722 * channel(hex.slice(5, 7))
  );
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('database color contrast contracts', () => {
  test('timeline labels meet WCAG AA against every conditional color', () => {
    const backgrounds = {
      gray: '#4b5563',
      brown: '#92400e',
      orange: '#9a3412',
      yellow: '#facc15',
      green: '#15803d',
      blue: '#1d4ed8',
      purple: '#7e22ce',
      pink: '#be185d',
      red: '#b91c1c',
    } as const;

    for (const [name, classes] of Object.entries(DATABASE_TIMELINE_COLORS)) {
      const foreground = name === 'yellow' ? '#000000' : '#ffffff';
      expect(
        contrastRatio(backgrounds[name as keyof typeof backgrounds], foreground),
      ).toBeGreaterThanOrEqual(4.5);
      expect(classes).toContain(name === 'yellow' ? 'text-black' : 'text-white');
    }
  });

  test('tinted conditional-color surfaces keep semantic foreground and dark-theme variants', () => {
    const maps = [
      DATABASE_BOARD_CARD_COLORS,
      DATABASE_CALENDAR_COLORS,
      DATABASE_GALLERY_COLORS,
      DATABASE_LIST_COLORS,
    ];
    for (const map of maps) {
      for (const classes of Object.values(map)) {
        expect(classes).toContain('text-foreground');
        expect(classes).toContain('dark:bg-');
      }
    }
    for (const classes of Object.values(DATABASE_CONDITIONAL_COLOR_CLASSES)) {
      expect(classes).toContain('dark:bg-');
    }
  });
});
