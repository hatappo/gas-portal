<script lang="ts">
  import Hint from './Hint.svelte';
  import AdoptTrigger from './AdoptTrigger.svelte';
  import { language } from './language-store';
  let {
    button,
    text,
    description,
  }: { button: HTMLElement; text: string; description: string | null } = $props();
</script>

<Hint triggerId={button.id} text={PortalI18n.t(text, $language)}>
  {#snippet children(attributes)}<AdoptTrigger
      node={button}
      attributes={attributes as Record<string, unknown>}
      {description}
    />{/snippet}
</Hint>
