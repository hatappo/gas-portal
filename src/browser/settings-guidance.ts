import { createCell, mountView } from './view';
import GuidanceHost from './GuidanceHost.svelte';
export function mountSettingsGuidance(host: HTMLElement) {
  const [state, setState] = createCell({ message: '', language: document.documentElement.lang });
  mountView(GuidanceHost, host, { state });
  return (message: string, language: string) => setState({ message, language });
}
