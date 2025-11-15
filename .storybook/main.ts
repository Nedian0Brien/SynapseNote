import type { StorybookConfig } from '@storybook/react-vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      propFilter: (prop) => {
        if (prop.parent) {
          return !prop.parent.fileName.includes('node_modules');
        }
        return true;
      },
      shouldRemoveUndefinedFromOptional: true,
    },
  },
  // Exclude plugin files and other non-component files from react-docgen
  features: {
    buildStoriesJson: true,
  },
  async viteFinal(config) {
    if (config.resolve) {
      const existingAlias = Array.isArray(config.resolve.alias)
        ? config.resolve.alias
        : config.resolve.alias
          ? Object.entries(config.resolve.alias).map(([find, replacement]) => ({
            find,
            replacement: replacement as string,
          }))
          : [];

      config.resolve.alias = [
        ...existingAlias,
        { find: 'src/', replacement: path.resolve(__dirname, '../src/') },
        { find: '@/', replacement: path.resolve(__dirname, '../src/') },
      ];
    }

    // PostCSS config is automatically picked up from postcss.config.cjs
    // No need to configure it explicitly, but ensure CSS processing is enabled

    return config;
  },
};
export default config;