import { addons, type State } from 'storybook/manager-api';
import { create } from 'storybook/theming';
import './style.css';

type ThemeName = 'light' | 'dark';

const lightTheme = create({
  base: 'light',
  brandTitle: 'Web Liquid Glass：原理与实现',
  brandUrl: '/',
  colorPrimary: '#8b7cff',
  colorSecondary: '#2ebac6',
  appBg: '#f7f7f9',
  appContentBg: '#ffffff',
  appBorderColor: '#e7e7ee',
  textColor: '#0f1117',
  textInverseColor: '#ffffff',
  barTextColor: '#62677b',
  barSelectedColor: '#0f1117',
  barBg: '#ffffff'
});

const darkTheme = create({
  base: 'dark',
  brandTitle: 'Web Liquid Glass：原理与实现',
  brandUrl: '/',
  colorPrimary: '#a69cff',
  colorSecondary: '#55cbd3',
  appBg: '#111216',
  appContentBg: '#17181d',
  appBorderColor: '#2c2e36',
  textColor: '#f6f6f8',
  textInverseColor: '#0f1117',
  barTextColor: '#a5a8b4',
  barSelectedColor: '#ffffff',
  barBg: '#17181d'
});

const readTheme = (): ThemeName =>
  window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';

const setManagerConfig = (theme: ThemeName) => {
  addons.setConfig({
    initialActive: 'canvas',
    sidebar: {
      showRoots: false
    },
    layoutCustomisations: {
      showPanel: (_state: State, _defaultValue: boolean) => false
    },
    theme: theme === 'dark' ? darkTheme : lightTheme
  });
};

const sunIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3.75" fill="currentColor"/>
    <circle cx="12" cy="3.25" r="1.25" fill="currentColor"/>
    <circle cx="12" cy="20.75" r="1.25" fill="currentColor"/>
    <circle cx="3.25" cy="12" r="1.25" fill="currentColor"/>
    <circle cx="20.75" cy="12" r="1.25" fill="currentColor"/>
    <circle cx="5.81" cy="5.81" r="1.25" fill="currentColor"/>
    <circle cx="18.19" cy="18.19" r="1.25" fill="currentColor"/>
    <circle cx="18.19" cy="5.81" r="1.25" fill="currentColor"/>
    <circle cx="5.81" cy="18.19" r="1.25" fill="currentColor"/>
  </svg>
`;

const moonIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 4.75C10 6.75 10 10 12 12C14 14 17.25 14 19.25 12C19.25 16 16 19.25 12 19.25C8 19.25 4.75 16 4.75 12C4.75 8 8 4.75 12 4.75Z"
    />
  </svg>
`;

const syncPreviewTheme = (theme: ThemeName) => {
  const preview = document.getElementById('storybook-preview-iframe') as HTMLIFrameElement | null;
  const previewWindow = preview?.contentWindow;
  const previewDocument = preview?.contentDocument;
  if (previewDocument) {
    previewDocument.documentElement.classList.remove('light', 'dark');
    previewDocument.documentElement.classList.add(theme);
    previewDocument.documentElement.style.colorScheme = theme;
  }
  previewWindow?.dispatchEvent(new Event('web-liquid-glass-theme'));
};

const updateThemeButton = (button: HTMLButtonElement, theme: ThemeName) => {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  button.dataset.theme = theme;
  button.setAttribute('aria-label', `切换到${nextTheme === 'dark' ? '深色' : '浅色'}模式`);
  button.title = `切换到${nextTheme === 'dark' ? '深色' : '浅色'}模式`;
  button.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
};

const applyTheme = (theme: ThemeName, persist = false) => {
  if (persist) window.localStorage.setItem('theme', theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  setManagerConfig(theme);
  const button = document.querySelector<HTMLButtonElement>('#web-liquid-glass-theme-control button');
  if (button) updateThemeButton(button, theme);
  syncPreviewTheme(theme);
};

const positionThemeControl = (control: HTMLElement) => {
  const sidebar = document.getElementById('storybook-sidebar-region');
  if (!sidebar) {
    control.hidden = true;
    return;
  }

  const bounds = sidebar.getBoundingClientRect();
  control.hidden = bounds.width < 80 || bounds.height < 80;
  control.style.left = `${Math.round(bounds.left + 16)}px`;
  control.style.bottom = `${Math.round(window.innerHeight - bounds.bottom + 16)}px`;
  control.style.width = `${Math.max(40, Math.round(bounds.width - 32))}px`;

  const navigation = sidebar.querySelector<HTMLElement>('nav');
  if (navigation) navigation.style.paddingBottom = '72px';
};

const mountThemeControl = () => {
  if (document.getElementById('web-liquid-glass-theme-control')) return;

  const control = document.createElement('div');
  control.id = 'web-liquid-glass-theme-control';
  const button = document.createElement('button');
  button.type = 'button';
  updateThemeButton(button, readTheme());
  control.append(button);
  document.body.append(control);

  const sound = new Audio('/design/sounds/click.wav');
  sound.preload = 'auto';
  button.addEventListener('click', () => {
    const nextTheme: ThemeName = readTheme() === 'dark' ? 'light' : 'dark';
    sound.currentTime = 0;
    void sound.play().catch(() => undefined);
    button.dataset.animating = 'true';
    window.setTimeout(() => delete button.dataset.animating, 440);
    applyTheme(nextTheme, true);
  });

  const observer = new ResizeObserver(() => positionThemeControl(control));
  const observeSidebar = () => {
    const sidebar = document.getElementById('storybook-sidebar-region');
    if (!sidebar) {
      window.requestAnimationFrame(observeSidebar);
      return;
    }
    observer.observe(sidebar);
    positionThemeControl(control);
  };
  observeSidebar();
  window.addEventListener('resize', () => positionThemeControl(control));
};

applyTheme(readTheme());
window.addEventListener('storage', event => {
  if (event.key === 'theme') applyTheme(readTheme());
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountThemeControl, { once: true });
} else {
  mountThemeControl();
}
