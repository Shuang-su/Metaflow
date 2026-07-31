import type { StorybookConfig } from '@storybook/react-vite';
import remarkGfm from 'remark-gfm';
import rehypeWrapTables from './rehype-wrap-tables.mjs';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/0-Research.stories.tsx',
    '../src/1-Components.stories.tsx',
    '../src/1-components/**/*.stories.tsx',
    '../src/2-Playground.stories.tsx'
  ],
  addons: [
    {
      name: '@storybook/addon-docs',
      options: {
        mdxPluginOptions: {
          mdxCompileOptions: {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [rehypeWrapTables]
          }
        }
      }
    }
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  staticDirs: [
    { from: '../../design', to: '/design' },
    { from: '../../reference', to: '/reference' }
  ],
  core: {
    disableWhatsNewNotifications: true
  },
  docs: {
    defaultName: 'README'
  },
  features: {
    sidebarOnboardingChecklist: false,
    controls: false,
    actions: false,
    interactions: false
  },
  viteFinal: async viteConfig => {
    viteConfig.server = {
      ...viteConfig.server,
      watch: {
        ...viteConfig.server?.watch,
        ignored: ['**/.cache/**', '**/output/**', '**/storybook-static/**']
      }
    };
    return viteConfig;
  }
};

export default config;
