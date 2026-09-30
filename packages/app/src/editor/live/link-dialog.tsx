import { usePageList } from '@/components/PageListContext';
import { EditMarkdownLinkDialog } from '../extensions/InternalLinkPropPanel';

export function LiveLinkDialog({
  href,
  label,
  onSave,
  onClose,
  onRemove,
}: {
  href: string;
  label: string;
  onSave: (href: string, label?: string) => void;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const { pages, folderPaths, loading } = usePageList();
  return (
    <EditMarkdownLinkDialog
      open
      href={href}
      text={label}
      pages={pages}
      folderPaths={folderPaths}
      loading={loading}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onSave={(target, text, changed) => onSave(target, changed ? text : undefined)}
      onRemove={onRemove}
    />
  );
}
