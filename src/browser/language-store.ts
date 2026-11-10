import { readable } from 'svelte/store';
export const language = readable(document.documentElement.lang, (set) => {
  const update = () => set(document.documentElement.lang);
  document.addEventListener('portal:languagechange', update);
  return () => document.removeEventListener('portal:languagechange', update);
});
