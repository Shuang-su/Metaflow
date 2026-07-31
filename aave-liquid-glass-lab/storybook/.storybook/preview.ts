import type { Preview } from '@storybook/react-vite';
import { ensureOriginRuntime } from '../src/origin/runtime';
import '../src/origin/origin-case-page.css';
import '../src/docs/readme.css';

const applyStoredTheme = () => {
  const theme = window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
  document.documentElement.style.colorScheme = theme;
};

applyStoredTheme();
window.addEventListener('storage', applyStoredTheme);
window.addEventListener('web-liquid-glass-theme', applyStoredTheme);
void ensureOriginRuntime();

const preview: Preview = {
  parameters: {
    controls: {
      disable: true
    },
    actions: {
      disable: true
    },
    layout: 'fullscreen',
    backgrounds: {
      disable: true
    },
    options: {
      showPanel: false,
      storySort: {
        method: 'alphabetical',
        order: [
          '0. Web Liquid Glass：原理与实现',
          ['README', '*'],
          '1. 组件案例',
          ['README', '*'],
          '2. Playground',
          ['README', '*']
        ]
      }
    }
  }
};

export default preview;
