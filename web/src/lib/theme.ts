export type Theme = 'light' | 'dark';

export const THEME_KEY = 'ls-color-mode';

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle('dark', theme === 'dark');
  window.localStorage.setItem(THEME_KEY, theme);
}

export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light')t='dark';var r=document.documentElement;r.dataset.theme=t;r.style.colorScheme=t;if(t==='dark')r.classList.add('dark');else r.classList.remove('dark');}catch(e){var d=document.documentElement;d.dataset.theme='dark';d.style.colorScheme='dark';d.classList.add('dark');}})();`;
