import { FileUp } from 'lucide-react';

/**
 * Preview clone of the app `File` — inline Notion-style attachment row.
 * `size` is a raw human string ("124 KB") since the app takes a
 * pre-formatted `size` prop off the descriptor. `href` is optional; when
 * absent the row renders as a plain span so demo cards don't drive
 * navigation.
 */
export function FilePreview({ name, size, href }: { name: string; size?: string; href?: string }) {
  const inner = (
    <>
      <FileUp size={16} className="text-fd-muted-foreground" aria-hidden />
      <span className="flex-1 font-medium">{name}</span>
      {size ? <span className="text-fd-muted-foreground text-xs">{size}</span> : null}
    </>
  );
  const rootClass =
    'inline-flex w-full items-center gap-2 rounded-md border border-fd-border bg-fd-card/50 px-3 py-2 text-fd-foreground text-sm';
  if (href) {
    return (
      <a href={href} className={rootClass}>
        {inner}
      </a>
    );
  }
  return <span className={rootClass}>{inner}</span>;
}
