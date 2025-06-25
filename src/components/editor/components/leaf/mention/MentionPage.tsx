import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Element, Text } from 'slate';
import { ReactEditor, useReadOnly, useSlate } from 'slate-react';
import smoothScrollIntoViewIfNeeded from 'smooth-scroll-into-view-if-needed';

import { APP_EVENTS } from '@/application/constants';
import { YjsEditor } from '@/application/slate-yjs';
import { CustomEditor } from '@/application/slate-yjs/command';
import { traverseBlock } from '@/application/slate-yjs/utils/convert';
import { findSlateEntryByBlockId } from '@/application/slate-yjs/utils/editor';
import { MentionType, UIVariant, View, ViewLayout, YjsEditorKey, YSharedRoot } from '@/application/types';
import { ReactComponent as LinkArrowOverlay } from '@/assets/icons/link_arrow.svg';
import { ReactComponent as ParagraphIcon } from '@/assets/icons/paragraph.svg';
import { useEditorContext } from '@/components/editor/EditorContext';
import { findView } from '@/components/_shared/outline/utils';
import PageIcon from '@/components/_shared/view-icon/PageIcon';

import './style.css';

function MentionPage({
  text,
  pageId,
  blockId,
  type,
}: {
  text: Text | Element;
  pageId: string;
  blockId?: string;
  type?: MentionType;
}) {
  const context = useEditorContext();
  const editor = useSlate();
  const selection = editor.selection;
  const variant = context.variant;
  const currentViewId = context.viewId;
  const eventEmitter = context.eventEmitter;

  const { navigateToView, loadViewMeta, loadView, openPageModal } = context;
  const [noAccess, setNoAccess] = useState(false);
  const [meta, setMeta] = useState<View | null>(null);
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    void (async () => {
      if (loadViewMeta) {
        setNoAccess(false);
        try {
          const meta = await loadViewMeta(pageId);

          setMeta(meta);
        } catch (e) {
          setNoAccess(true);
          if (e && (e as View).name) {
            setMeta(e as View);
          }
        }
      }
    })();
  }, [loadViewMeta, pageId]);

  useEffect(() => {
    const handleOutlineLoaded = (outline: View[]) => {
      const view = findView(outline, pageId);

      if (view) {
        setMeta(view);
      }
    };

    if (eventEmitter) {
      eventEmitter.on(APP_EVENTS.OUTLINE_LOADED, handleOutlineLoaded);
    }

    return () => {
      if (eventEmitter) {
        eventEmitter.off(APP_EVENTS.OUTLINE_LOADED, handleOutlineLoaded);
      }
    };
  }, [eventEmitter, pageId]);

  const icon = useMemo(() => {
    return meta?.icon;
  }, [meta?.icon]);

  const { t } = useTranslation();

  useEffect(() => {
    void (async () => {
      const pageName = meta?.name || t('menuAppHeader.defaultNewPageName');

      if (blockId) {
        if (currentViewId === pageId) {
          const entry = findSlateEntryByBlockId(editor as YjsEditor, blockId);

          if (entry) {
            const [node] = entry;
            const text = CustomEditor.getBlockTextContent(node, 2);

            setContent(text || pageName);
            return;
          }
        } else {
          try {
            const otherDoc = await loadView?.(pageId);

            if (!otherDoc) return;

            const sharedRoot = otherDoc.getMap(YjsEditorKey.data_section) as YSharedRoot;

            const handleBlockChange = () => {
              const node = traverseBlock(blockId, sharedRoot);

              if (!node) {
                setContent(pageName);
                return;
              }

              const text = CustomEditor.getBlockTextContent(node, 2);

              setContent(`${pageName}${text ? ` - ${text}` : ''}`);
            };

            handleBlockChange();

            return;
          } catch (e) {
            // do nothing
          }
        }
      }

      setContent(pageName);
    })();
  }, [selection, blockId, currentViewId, editor, loadView, meta?.name, pageId, t]);

  const mentionIcon = useMemo(() => {
    if (pageId === currentViewId && blockId) {
      return <ParagraphIcon className={'h-[1.25em] w-[1.25em] text-icon-primary opacity-70'} />;
    }

    return (
      <>
        <PageIcon
          view={{
            icon: icon,
            layout: meta?.layout || ViewLayout.Document,
          }}
          className={'ml-0.5 flex h-[1.25em] w-[1.25em] items-center text-text-primary'}
        />

        {type === MentionType.PageRef && (
          <span className={`absolute left-0 top-0 ml-0.5 `}>
            <LinkArrowOverlay className={' link-arrow-overlay h-[1.25em] w-[1.25em]'} />
          </span>
        )}
      </>
    );
  }, [blockId, currentViewId, icon, meta?.layout, pageId, type]);

  const readOnly = useReadOnly() || editor.isElementReadOnly(text as unknown as Element);

  const handleScrollToBlock = useCallback(async () => {
    if (blockId) {
      const entry = findSlateEntryByBlockId(editor as YjsEditor, blockId);

      if (entry) {
        const [node] = entry;
        const dom = ReactEditor.toDOMNode(editor, node);

        await smoothScrollIntoViewIfNeeded(dom, {
          behavior: 'smooth',
          scrollMode: 'if-needed',
        });

        dom.className += ' highlight-block';
        setTimeout(() => {
          dom.className = dom.className.replace('highlight-block', '');
        }, 5000);
      }
    }
  }, [blockId, editor]);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        if (readOnly || meta?.layout === ViewLayout.AIChat) {
          void navigateToView?.(pageId, blockId);
        } else {
          if (noAccess) return;
          if (pageId === currentViewId) {
            void handleScrollToBlock();
            return;
          }

          openPageModal?.(pageId);
        }
      }}
      style={{
        cursor: noAccess ? 'default' : undefined,
      }}
      className={`mention-inline cursor-pointer pr-1 underline`}
      contentEditable={false}
      data-mention-id={pageId}
    >
      {noAccess ? (
        <span className={'mention-unpublished font-semibold text-text-secondary'}>
          {variant === UIVariant.App ? `${content}${t('document.mention.trashHint')}` : t('document.mention.noAccess')}
        </span>
      ) : (
        <>
          <span className={`mention-icon`}>{mentionIcon}</span>

          <span className={'mention-content max-w-[330px] truncate opacity-80'}>{content}</span>
        </>
      )}
    </span>
  );
}

export default MentionPage;
