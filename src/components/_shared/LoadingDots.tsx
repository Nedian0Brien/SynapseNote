export default function LoadingDots({
  className,
  colors = ['var(--sn-primary)', 'var(--sn-on-variant)', 'var(--sn-muted)'],
}: {
  className?: string;
  colors?: [string, string, string];
}) {
  return (
    <div className={className}>
      <div
        style={{
          width: `30px`,
          aspectRatio: '2',
          background: `
            radial-gradient(circle closest-side, ${colors[0]} 90%, transparent) 0% 50%,
            radial-gradient(circle closest-side, ${colors[1]} 90%, transparent) 50% 50%,
            radial-gradient(circle closest-side, ${colors[2]} 90%, transparent) 100% 50%
          `,
          backgroundSize: 'calc(100%/3) 50%',
          backgroundRepeat: 'no-repeat',
          animation: 'dots-loading 1s infinite linear',
        }}
      />
    </div>
  );
}
