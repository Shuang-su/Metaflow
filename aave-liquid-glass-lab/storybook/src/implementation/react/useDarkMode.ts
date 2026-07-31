import { useEffect, useState } from 'react';

function readDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * Keeps the readable material parameters in sync with Storybook's global
 * theme. Aave changes the displacement-map specular channels between light and
 * dark; changing only CSS colors would leave the glass optics incorrect.
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() =>
    typeof document === 'undefined' ? false : readDarkMode()
  );

  useEffect(() => {
    const update = () => setDark(readDarkMode());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
    update();
    return () => observer.disconnect();
  }, []);

  return dark;
}
