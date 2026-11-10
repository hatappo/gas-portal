<script lang="ts">
  import { onDestroy } from 'svelte';
  let props: { text: string } = $props();
  let element = $state<HTMLSpanElement>(null!);
  let previous: string | undefined, animation: Animation | undefined;
  $effect(() => {
    const value = props.text;
    if (previous !== undefined && previous !== value) {
      animation?.cancel();
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && element.animate)
        animation = element.animate(
          [
            { transform: 'translateX(0)', opacity: 1 },
            {
              transform: 'translateX(-2px) skewX(-9deg)',
              opacity: 0.65,
              textShadow: '2px 0 currentColor',
              offset: 0.15,
            },
            {
              transform: 'translateX(2px) skewX(7deg)',
              opacity: 1,
              textShadow: '-2px 0 currentColor',
              offset: 0.35,
            },
            { transform: 'translateX(-1px)', opacity: 0.8, offset: 0.55 },
            { transform: 'none', opacity: 1, textShadow: 'none' },
          ],
          { duration: 320, easing: 'steps(1, end)' },
        );
    }
    previous = value;
  });
  onDestroy(() => animation?.cancel());
</script>

<span bind:this={element} class="calendar-changing-time">{props.text}</span>
