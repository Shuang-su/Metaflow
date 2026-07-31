import manifest from '../generated/origin-manifest.json';
import type { OriginCaseId, OriginRuntimeBridge } from './types';

type TurbopackEntry = unknown[];

interface TurbopackQueue extends Array<TurbopackEntry> {
  push(...entries: TurbopackEntry[]): number;
}

interface TurbopackRuntime {
  push(entry: TurbopackEntry): unknown;
}

declare global {
  interface Window {
    TURBOPACK?: TurbopackQueue | TurbopackRuntime;
    __AAVE_ORIGIN_RUNTIME__?: OriginRuntimeBridge;
    __AAVE_ORIGIN_RUNTIME_ERROR__?: Error;
  }
}

const BRIDGE_CHUNK = 'static/chunks/storybook-aave-origin-bridge.js';
const SCRIPT_ATTRIBUTE = 'data-aave-origin-runtime';
const STYLE_ATTRIBUTE = 'data-aave-origin-style';
const RUNTIME_TIMEOUT_MS = 15_000;

let runtimePromise: Promise<OriginRuntimeBridge> | undefined;

function isRuntimeDescriptor(entry: TurbopackEntry): boolean {
  if (entry.length !== 2) return false;
  const descriptor = entry[1] as { runtimeModuleIds?: unknown[] } | undefined;
  return descriptor?.runtimeModuleIds?.includes(manifest.blockedRuntimeModuleId) ?? false;
}

function installBootstrapQueue(): void {
  if (window.TURBOPACK) return;

  const queue: TurbopackQueue = [];
  queue.push = function push(...entries: TurbopackEntry[]): number {
    const accepted = entries.filter(entry => !isRuntimeDescriptor(entry));
    return Array.prototype.push.apply(this, accepted);
  };
  window.TURBOPACK = queue;
}

function guardRuntimePush(): TurbopackRuntime {
  const runtime = window.TURBOPACK;
  if (!runtime || Array.isArray(runtime) || typeof runtime.push !== 'function') {
    throw new Error('Aave Turbopack runtime did not initialise');
  }

  const originalPush = runtime.push.bind(runtime);
  runtime.push = entry => {
    if (isRuntimeDescriptor(entry)) return undefined;
    return originalPush(entry);
  };
  return runtime;
}

function ensureOriginStyles(): void {
  for (const href of manifest.stylesheetUrls) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(STYLE_ATTRIBUTE, '');
    document.head.append(link);
  }
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === 'true') return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    const onError = () => reject(new Error(`Failed to load Aave origin chunk: ${src}`));

    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });

    if (!existing) {
      script.src = src;
      script.async = false;
      script.setAttribute(SCRIPT_ATTRIBUTE, '');
      document.head.append(script);
    }
  });
}

function registerBridge(runtime: TurbopackRuntime): void {
  const bridgeFactory = (context: {
    i(moduleId: number): Record<string, unknown>;
  }) => {
    const jsxRuntime = context.i(manifest.modules.jsxRuntime) as {
      jsx(type: unknown, props: Record<string, unknown>): unknown;
    };
    const react = context.i(66606) as {
      useEffect(effect: () => void | (() => void), dependencies: unknown[]): void;
    };
    const reactDom = context.i(manifest.modules.reactDomClient) as {
      createRoot(host: HTMLElement): {
        render(node: unknown): void;
        unmount(): void;
      };
    };
    const themeModule = context.i(manifest.modules.themeProvider) as {
      ThemeProvider: unknown;
      useTheme(): { setTheme(theme: 'light' | 'dark'): void };
    };
    const demoModule = context.i(manifest.modules.demoContainer) as {
      DemoContainer: unknown;
    };

    const moduleByCase: Record<
      OriginCaseId,
      {
        moduleId: number;
        exportName: string;
        props?: Record<string, unknown>;
        demoCaption?: string;
      }
    > = {
      hero: {
        moduleId: manifest.modules.hero,
        exportName: 'AaveGlassPlayground',
        props: { variant: 'primary' }
      },
      switch: {
        moduleId: manifest.modules.switch,
        exportName: 'default',
        demoCaption:
          'Even with a small component like this switch, the glass effect adds a sense of depth and tactility.'
      },
      slider: {
        moduleId: manifest.modules.slider,
        exportName: 'default',
        demoCaption: "Native <input type='range' /> elements are back-synced with our custom component."
      },
      toggle: {
        moduleId: manifest.modules.toggle,
        exportName: 'default',
        demoCaption: 'The glass effect helps visually highlight the selected option.'
      },
      qr: {
        moduleId: manifest.modules.qr,
        exportName: 'default',
        demoCaption:
          'The QR code is fully interactive. Click the Aave logo to see the glass effect in action.'
      },
      video: { moduleId: manifest.modules.video, exportName: 'default' },
      'how-it-works': {
        moduleId: manifest.modules.howItWorks,
        exportName: 'DisplacementMapPlayground'
      }
    };

    const readTheme = (): 'light' | 'dark' =>
      window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';

    const ThemeSync = ({ children }: { children: unknown }) => {
      const { setTheme } = themeModule.useTheme();
      react.useEffect(() => {
        const applyTheme = () => setTheme(readTheme());
        window.addEventListener('storage', applyTheme);
        window.addEventListener('web-liquid-glass-theme', applyTheme);
        applyTheme();
        return () => {
          window.removeEventListener('storage', applyTheme);
          window.removeEventListener('web-liquid-glass-theme', applyTheme);
        };
      }, [setTheme]);
      return children;
    };

    window.__AAVE_ORIGIN_RUNTIME__ = {
      mount(caseId, host) {
        const target = moduleByCase[caseId];
        const originModule = context.i(target.moduleId);
        const Component = originModule[target.exportName];
        if (!Component) {
          throw new Error(`Aave origin export is missing: ${caseId} · ${target.exportName}`);
        }

        host.replaceChildren();
        const root = reactDom.createRoot(host);
        const rawComponent = jsxRuntime.jsx(Component, target.props ?? {});
        const component = target.demoCaption
          ? jsxRuntime.jsx(demoModule.DemoContainer, {
              caption: target.demoCaption,
              children: rawComponent
            })
          : rawComponent;
        const syncedComponent = jsxRuntime.jsx(ThemeSync, { children: component });
        const tree = jsxRuntime.jsx(themeModule.ThemeProvider, {
          attribute: 'class',
          defaultTheme: 'light',
          enableSystem: false,
          storageKey: 'theme',
          themes: ['light', 'dark'],
          children: syncedComponent
        });
        root.render(tree);
        return () => root.unmount();
      }
    };
  };

  runtime.push([BRIDGE_CHUNK, manifest.bridgeModuleId, bridgeFactory]);
  runtime.push([
    BRIDGE_CHUNK,
    {
      otherChunks: [],
      runtimeModuleIds: [manifest.bridgeModuleId]
    }
  ]);
}

function waitForBridge(): Promise<OriginRuntimeBridge> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const check = () => {
      if (window.__AAVE_ORIGIN_RUNTIME__) {
        resolve(window.__AAVE_ORIGIN_RUNTIME__);
        return;
      }
      if (window.__AAVE_ORIGIN_RUNTIME_ERROR__) {
        reject(window.__AAVE_ORIGIN_RUNTIME_ERROR__);
        return;
      }
      if (performance.now() - start > RUNTIME_TIMEOUT_MS) {
        reject(new Error('Timed out while initialising the Aave origin runtime'));
        return;
      }
      window.requestAnimationFrame(check);
    };
    check();
  });
}

async function initialiseRuntime(): Promise<OriginRuntimeBridge> {
  ensureOriginStyles();
  installBootstrapQueue();
  await loadScript(manifest.runtimeUrl);
  const runtime = guardRuntimePush();
  await Promise.all(manifest.scriptUrls.map(loadScript));
  registerBridge(runtime);
  return waitForBridge();
}

export function ensureOriginRuntime(): Promise<OriginRuntimeBridge> {
  runtimePromise ??= initialiseRuntime().catch(error => {
    const runtimeError = error instanceof Error ? error : new Error(String(error));
    window.__AAVE_ORIGIN_RUNTIME_ERROR__ = runtimeError;
    throw runtimeError;
  });
  return runtimePromise;
}
