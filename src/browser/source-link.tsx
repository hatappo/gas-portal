import { type JSX } from 'solid-js';

export function SourceLink(props: { url: string; class?: string; children: JSX.Element }) {
  const href = () => {
    try {
      const url = new URL(props.url);
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch { /* Invalid destinations stay inert. */ }
    return undefined;
  };
  const icon = document.querySelector<HTMLTemplateElement>('#action-external-icon')!.content.cloneNode(true);
  return <a href={href()} target={href() ? '_blank' : undefined} rel={href() ? 'noopener noreferrer' : undefined} class={props.class}>{props.children}{icon}</a>;
}
