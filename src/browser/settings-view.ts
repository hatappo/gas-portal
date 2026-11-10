import { createCell, mountView } from './view';
import SettingsFields from './SettingsFields.svelte';
export function mountSettingsFields(form: HTMLFormElement, reset: () => void) {
  const read = (): PortalSettings =>
    Object.fromEntries(
      Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[name]'),
        (input) => [input.name, input.value],
      ),
    ) as unknown as PortalSettings;
  const [draft, setValues] = createCell(read());
  const [busy, setBusy] = createCell(false);
  const host = document.createElement('div');
  form.querySelector('#portal-settings-fields')!.replaceWith(host);
  const update = (key: keyof PortalSettings, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));
  mountView(SettingsFields, host, { draft, busy, update, reset });
  return { read, setValues, setBusy, busy };
}
