import { Show } from 'solid-js';

const logoClasses: Record<string, string> = {
  github: 'service-logo-github', slack: 'service-logo-slack', gmail: 'service-logo-gmail',
  calendar: 'service-logo-calendar', drive: 'service-logo-drive',
};

/** Local SVG backgrounds keep repeated gradient IDs isolated and require no CDN requests. */
export function ServiceLogo(props: { service: string; label: string; decorative?: boolean }) {
  const logoClass = () => Object.prototype.hasOwnProperty.call(logoClasses, props.service) ? logoClasses[props.service] : '';
  return <Show when={logoClass()} fallback={props.label}>
    <span class={'service-logo ' + logoClass()} role={props.decorative ? undefined : 'img'}
      aria-label={props.decorative ? undefined : props.label} aria-hidden={props.decorative ? 'true' : undefined}
      title={props.decorative ? undefined : props.label}>
      <Show when={!props.decorative}><span class="visually-hidden" aria-hidden="true">{props.label}</span></Show>
    </span>
  </Show>;
}
