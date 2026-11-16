import { readable } from 'svelte/store';
export const language = readable(document.documentElement.lang, (set) => {
  const update = () => set(document.documentElement.lang);
  // Language initialization can finish before the first view subscribes.
  update();
  document.addEventListener('portal:languagechange', update);
  return () => document.removeEventListener('portal:languagechange', update);
});
