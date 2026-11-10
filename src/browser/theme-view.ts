import { createCell, mountView } from './view';
import ThemePicker from './ThemePicker.svelte';
export function mountThemePicker(initialTheme: string, onChange: (theme: string) => void) {
  const [theme, setTheme] = createCell(initialTheme);
  const [busy, setBusy] = createCell(false);
  mountView(ThemePicker, document.getElementById('theme-picker')!, { theme, busy, onChange });
  return { setTheme, setBusy };
}
