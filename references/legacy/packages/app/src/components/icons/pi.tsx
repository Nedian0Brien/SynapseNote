import type { SVGProps } from 'react';

// Pi brand mark (the blocky "P" + square "i" dot from pi.dev/logo-auto.svg),
// rendered monochrome via `currentColor` so the dropdown row's color cascade
// (and the optional `--ok-brand-color` override in `TargetIcon`) tints it per
// theme — the upstream SVG ships its own light/dark media query, which can't
// participate in the app's theme toggle.
export function PiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      role="img"
      aria-label="Pi icon"
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      fill="none"
      viewBox="0 0 800 800"
      {...props}
    >
      <title>Pi icon</title>
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
      />
      <path fill="currentColor" d="M517.36 400H634.72V634.72H517.36Z" />
    </svg>
  );
}
