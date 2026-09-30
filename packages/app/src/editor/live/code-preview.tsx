import { t } from '@lingui/core/macro';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodePreviewEditModal } from '../components/CodePreviewEditModal';
import { HtmlPreviewLightbox } from '../components/HtmlPreviewLightbox';
import { PreviewBlockedNotice } from '../components/PreviewBlockedNotice';
import { ResizeHandles } from '../components/ResizeHandles';
import { normalizeCodeLanguage } from '../extensions/code-block-languages';
import {
  addMetaToken,
  getMetaTitle,
  metaHasToken,
  PREVIEWABLE_LANGUAGES,
  parsePreviewHeight,
  parsePreviewWidth,
  removeMetaToken,
  setMetaKeyValue,
  setMetaTitle,
  shouldShowPreview,
} from '../extensions/code-block-meta';
import {
  buildPreviewIframeHeader,
  buildPreviewThemeMessage,
  type PreviewTheme,
  parsePreviewCspViolationMessage,
  parsePreviewHeightMessage,
} from '../extensions/preview-iframe-header';

export function LiveCodePreview({
  language,
  body,
  meta,
  onBody,
  onMeta,
  onMeasure,
}: {
  language: string;
  body: string;
  meta: string;
  onBody: (body: string) => void;
  onMeta: (meta: string) => void;
  onMeasure: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const theme: PreviewTheme =
    resolvedTheme === 'dark' ||
    (!resolvedTheme && document.documentElement.classList.contains('dark'))
      ? 'dark'
      : 'light';
  const [bakedTheme] = useState(theme);
  const [height, setHeight] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<ReturnType<typeof parsePreviewCspViolationMessage>>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const normalized = normalizeCodeLanguage(language);
  const active = shouldShowPreview(normalized, meta);
  const title = getMetaTitle(meta) ?? '';
  const srcDoc = buildPreviewIframeHeader(bakedTheme) + body;
  const sendTheme = (target: HTMLIFrameElement) =>
    target.contentWindow?.postMessage(buildPreviewThemeMessage(theme), '*');
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(buildPreviewThemeMessage(theme), '*');
  }, [theme]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const reported = parsePreviewHeightMessage(event.data);
      if (reported !== null)
        setHeight((previous) =>
          previous !== null && Math.abs(previous - reported) <= 2 ? previous : reported,
        );
      const violation = parsePreviewCspViolationMessage(event.data);
      if (violation) setBlocked(violation);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => {
    onMeasure();
  });
  return (
    <div className="cm-live-code-preview">
      <div className="flex flex-wrap items-center gap-2 py-1" contentEditable={false}>
        {normalized && PREVIEWABLE_LANGUAGES.has(normalized) ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onMeta(
                (metaHasToken(meta, 'preview')
                  ? removeMetaToken(meta, 'preview')
                  : addMetaToken(meta, 'preview')) ?? '',
              )
            }
          >
            {active ? t`Hide preview` : t`Show preview`}
          </Button>
        ) : null}
        {active ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >{t`Edit source`}</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(true)}
            >{t`Expand preview`}</Button>
            <Input
              className="h-8 w-48"
              aria-label={t`Preview title`}
              placeholder={t`Preview title`}
              value={title}
              onChange={(event) => onMeta(setMetaTitle(meta, event.target.value) ?? '')}
            />
          </>
        ) : null}
      </div>
      {active ? (
        <>
          <div
            ref={wrapper}
            className="relative min-h-20 max-w-full"
            style={{
              height: parsePreviewHeight(meta) ?? (height ? `${height}px` : '320px'),
              width: parsePreviewWidth(meta) ?? '100%',
            }}
          >
            <iframe
              ref={frame}
              title={title || t`HTML preview`}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              srcDoc={srcDoc}
              className="h-full w-full border-0"
              onLoad={(event) => sendTheme(event.currentTarget)}
            />
            <ResizeHandles
              targetRef={wrapper}
              onResize={(size) => {
                if (wrapper.current) {
                  wrapper.current.style.width = `${size.width}px`;
                  wrapper.current.style.height = `${size.height}px`;
                }
              }}
              onResizeEnd={(size) =>
                onMeta(
                  setMetaKeyValue(
                    setMetaKeyValue(meta, 'w', `${Math.round(size.width)}px`),
                    'h',
                    `${Math.round(size.height)}px`,
                  ) ?? '',
                )
              }
            />
          </div>
          {blocked?.blocked.length ? (
            <PreviewBlockedNotice {...blocked} onDismiss={() => setBlocked(null)} />
          ) : null}
          <CodePreviewEditModal
            open={editing}
            onOpenChange={setEditing}
            initialValue={body}
            language="html"
            title={t`Edit HTML source`}
            onSave={onBody}
            renderPreview={(value) => (
              <iframe
                title={t`HTML preview`}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={buildPreviewIframeHeader(bakedTheme) + value}
                className="h-full w-full border-0"
              />
            )}
          />
          <HtmlPreviewLightbox
            open={expanded}
            onOpenChange={setExpanded}
            title={title || t`HTML preview`}
            srcDoc={srcDoc}
            onFrameLoad={sendTheme}
          />
        </>
      ) : null}
    </div>
  );
}
