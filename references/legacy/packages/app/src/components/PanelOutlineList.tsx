// biome-ignore-all lint/plugin/no-raw-html-interactive-element: shared outline rows intentionally preserve the existing native-button navigation primitive.

import type { ReactNode } from 'react';
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelEmpty,
  PanelError,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel';
import { cn } from '@/lib/utils';

const ITEM_HEIGHT = 32;
const LEVEL_WIDTH = 12;
const MARKER_SIZE = 6;

export interface PanelOutlineItem {
  key: string;
  title: string;
  depth: number;
  disabled?: boolean;
  onSelect: () => void;
}

interface PanelOutlineListProps {
  title: ReactNode;
  items: PanelOutlineItem[];
  activeIndex: number;
  ariaLabel: string;
  loading?: boolean;
  error?: string | null;
  emptyText: ReactNode;
  className?: string;
}

/** Shared right-rail outline presentation for Markdown headings and PDF bookmarks. */
export function PanelOutlineList({
  title,
  items,
  activeIndex,
  ariaLabel,
  loading = false,
  error = null,
  emptyText,
  className,
}: PanelOutlineListProps) {
  const activeDepth = activeIndex >= 0 ? (items[activeIndex]?.depth ?? 0) : 0;
  const markerX = activeDepth * LEVEL_WIDTH + (LEVEL_WIDTH - MARKER_SIZE) / 2;
  const markerY = activeIndex * ITEM_HEIGHT + (ITEM_HEIGHT - MARKER_SIZE) / 2;

  return (
    <Panel className={className}>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
        {!loading && <PanelCount>{items.length}</PanelCount>}
      </PanelHeader>
      <PanelBody className="px-3 py-2" aria-busy={loading}>
        {error ? (
          <PanelError className="px-2">{error}</PanelError>
        ) : items.length === 0 && !loading ? (
          <PanelEmpty className="px-2">{emptyText}</PanelEmpty>
        ) : (
          <nav aria-label={ariaLabel} className="relative">
            {activeIndex >= 0 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 top-0 rounded-full bg-primary motion-safe:[transition:transform_0.25s_var(--ease-out-strong)]"
                style={{
                  width: MARKER_SIZE,
                  height: MARKER_SIZE,
                  transform: `translate(${markerX}px, ${markerY}px)`,
                }}
              />
            )}
            {items.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={item.onSelect}
                  className={cn(
                    'w-full cursor-pointer truncate py-1.5 pe-2 text-left text-sm transition-colors disabled:cursor-default',
                    isActive
                      ? 'font-medium text-primary'
                      : 'text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground',
                  )}
                  style={{ paddingLeft: `${item.depth * LEVEL_WIDTH + 20}px` }}
                  title={item.title}
                >
                  {item.title}
                </button>
              );
            })}
          </nav>
        )}
      </PanelBody>
    </Panel>
  );
}
