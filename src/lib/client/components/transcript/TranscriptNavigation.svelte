<script lang="ts">
  import { base } from '$app/paths';
  import { transcriptNavigation } from '$lib/client/stores/navigation.svelte';

  interface Props {
    currentFilePath: string;
  }

  let { currentFilePath }: Props = $props();

  // Get navigation state for current transcript
  let navInfo = $derived(transcriptNavigation.getNavigation(currentFilePath));

  // Check if we have a valid navigation context
  let hasNavContext = $derived(navInfo.totalCount > 0 && navInfo.currentIndex !== -1);

  // Build URL for a transcript path
  function buildUrl(path: string): string {
    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `${base}/transcript/${encodedPath}`;
  }

  // Tooltip for disabled state when no nav context
  let noContextTooltip = "Navigate from list view to enable";
</script>

<div class="flex items-center gap-2">
  <!-- Previous button -->
  {#if navInfo.hasPrev && navInfo.prevPath}
    <a
      href={buildUrl(navInfo.prevPath)}
      class="btn btn-sm btn-ghost gap-1"
      title="Previous transcript"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Prev
    </a>
  {:else}
    <button
      class="btn btn-sm btn-ghost gap-1"
      disabled
      title={hasNavContext ? "At first transcript" : noContextTooltip}
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Prev
    </button>
  {/if}

  <!-- Position indicator -->
  {#if hasNavContext}
    <span class="text-sm text-base-content/70 min-w-[4rem] text-center">
      {navInfo.currentIndex + 1} / {navInfo.totalCount}
    </span>
  {:else}
    <span class="text-sm text-base-content/40 min-w-[4rem] text-center" title={noContextTooltip}>
      — / —
    </span>
  {/if}

  <!-- Next button -->
  {#if navInfo.hasNext && navInfo.nextPath}
    <a
      href={buildUrl(navInfo.nextPath)}
      class="btn btn-sm btn-ghost gap-1"
      title="Next transcript"
    >
      Next
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </a>
  {:else}
    <button
      class="btn btn-sm btn-ghost gap-1"
      disabled
      title={hasNavContext ? "At last transcript" : noContextTooltip}
    >
      Next
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  {/if}
</div>
