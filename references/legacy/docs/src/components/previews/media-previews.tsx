/**
 * Trivial previews for the media canonicals — `img`, `video`, `audio`,
 * `Pdf`, `Embed`. Each renders the native HTML element the app uses,
 * matching the app render's zero-chrome default. `Pdf` reuses a public
 * pdfjs-hosted document so the multi-page viewer is real.
 */

interface ImgPreviewProps {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  caption?: string;
}

export function ImgPreview({
  src,
  alt = 'Preview image',
  width,
  height,
  caption,
}: ImgPreviewProps) {
  return (
    <figure className="m-0 flex flex-col items-start gap-2">
      {/* biome-ignore lint/performance/noImgElement: docs demo mirrors the app's raw <img>; next/image would require domain allowlisting for every third-party demo URL. */}
      <img src={src} alt={alt} width={width} height={height} className="max-w-full rounded-md" />
      {caption ? (
        <figcaption className="text-fd-muted-foreground text-xs">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

interface VideoPreviewProps {
  src: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  width?: number;
  height?: number;
}

export function VideoPreview({
  src,
  controls = true,
  autoPlay,
  loop,
  muted,
  width,
  height,
}: VideoPreviewProps) {
  // No `<track>` child — a captionless <track> without src is invalid
  // and some browsers throw on it. Docs demos never need captions.
  return (
    <video
      src={src}
      controls={controls}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      width={width}
      height={height}
      className="max-w-full rounded-md"
      preload="metadata"
    >
      <p>Your browser doesn't support HTML5 video.</p>
    </video>
  );
}

interface AudioPreviewProps {
  src: string;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
}

export function AudioPreview({ src, controls = true, autoPlay, loop }: AudioPreviewProps) {
  return (
    // biome-ignore lint/a11y/useMediaCaption: docs demo clip has no caption track available; the app's <audio> render also passes through raw HTML attributes.
    <audio src={src} controls={controls} autoPlay={autoPlay} loop={loop} className="w-full">
      <p>Your browser doesn't support HTML5 audio.</p>
    </audio>
  );
}

/**
 * PDF preview via `<iframe>` — the app's `Pdf` uses pdfjs-dist for a
 * proper multi-page canvas viewer. Getting pdfjs to run in a docs context
 * requires shipping the worker bundle; the iframe shortcut is honest to
 * the "embedded PDF" idea without dragging pdfjs into the docs build.
 */
export function PdfPreview({ src, height = 480 }: { src: string; height?: number }) {
  return (
    <iframe
      src={src}
      title="PDF preview"
      className="w-full rounded-md border border-fd-border"
      style={{ height }}
    />
  );
}

/**
 * Generic sandboxed iframe embed. Same defaults as the app render:
 * `referrerpolicy="no-referrer"` + minimal sandbox that allows scripts,
 * same-origin, and popups needed for e.g. CodeSandbox demos.
 */
export function EmbedPreview({
  src,
  height = 400,
  title = 'Embedded content',
}: {
  src: string;
  height?: number;
  title?: string;
}) {
  return (
    <iframe
      src={src}
      title={title}
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-popups"
      className="w-full rounded-md border border-fd-border"
      style={{ height }}
    />
  );
}
