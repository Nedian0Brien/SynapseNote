import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { GitHubIcon } from '@/components/icons/github';
import { SynapseNoteWordmark } from '@/components/synapsenote-wordmark';
import { GITHUB_URL } from '@/lib/site';

export function baseOptions({
  wordmarkClassName = 'h-8 w-auto text-(--slide-text)',
}: {
  wordmarkClassName?: string;
} = {}): BaseLayoutProps {
  return {
    nav: {
      title: <SynapseNoteWordmark aria-label="SynapseNote" className={wordmarkClassName} />,
    },
    // Icon links render in the docs sidebar footer. GitHub lives here (not via
    // the `githubUrl` shortcut, which Fumadocs appends last) so the order stays
    // GitHub is the public source and support entry point.
    links: [
      {
        type: 'icon',
        url: GITHUB_URL,
        label: 'GitHub',
        text: 'GitHub',
        icon: <GitHubIcon className="size-full" />,
        external: true,
      },
    ],
  };
}
