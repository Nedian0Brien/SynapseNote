// replaces morrow's src/app/components/Sidebar.tsx for the modules that only need a page's icon, such as the
// database views; the sidebar itself is the native app's, and morrow's module brings in code the editor
// bundle leaves out. same output as morrow's pageIcon and PageIcon
import { BookOpen, CalendarDays, FileText, LayoutDashboard, LayoutTemplate, Lock, Table2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PageMeta } from '../../vendor/morrow/src/core/model';
import { Emoji } from '../../vendor/morrow/src/app/components/Emoji';

export function pageIcon(page: PageMeta): LucideIcon {
  if (page.kind === 'journal') return BookOpen;
  if (page.kind === 'database') return Table2;
  if (page.kind === 'canvas') return LayoutDashboard;
  if (page.kind === 'templates') return LayoutTemplate;
  if (page.dailyDate) return CalendarDays;
  return FileText;
}

export function PageIcon({ page }: { page: PageMeta }) {
  if (page.encrypted) return <Lock size={15} strokeWidth={1.75} className="icon-kind-locked" />;
  if (page.icon) return <Emoji emoji={page.icon} />;
  // each kind of page has its own colour when colourful pages are on
  const kind = page.dailyDate ? 'daily' : page.kind;
  const props = { size: 15, strokeWidth: 1.75, className: `icon-kind-${kind}` };
  if (page.kind === 'journal') return <BookOpen {...props} />;
  if (page.kind === 'database') return <Table2 {...props} />;
  if (page.kind === 'canvas') return <LayoutDashboard {...props} />;
  if (page.kind === 'templates') return <LayoutTemplate {...props} />;
  if (page.dailyDate) return <CalendarDays {...props} />;
  return <FileText {...props} />;
}
