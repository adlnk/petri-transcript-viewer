<script lang="ts">
  import type { ReviewerScore } from '$lib/shared/types';

  interface Props {
    score: ReviewerScore;
    displayName?: string;
    onRemove?: () => void;
  }

  let { score, displayName, onRemove }: Props = $props();

  // Score badge color based on value (same logic as judge scores)
  function getScoreBadgeClass(value: number): string {
    if (value >= 8) return 'badge-error';
    if (value >= 6) return 'badge-warning';
    if (value >= 4) return 'badge-info';
    if (value >= 2) return 'badge-neutral';
    return 'badge-ghost';
  }

  let badgeClass = $derived(getScoreBadgeClass(score.score));
  let name = $derived(displayName || score.dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
</script>

<div
  class="inline-flex items-center gap-1 px-2 py-1 rounded border-2 border-dashed border-secondary/40 bg-secondary/5"
  title={score.justification ? `${score.reviewerName}: ${score.justification}` : `Scored by ${score.reviewerName}`}
>
  <!-- Reviewer icon -->
  <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>

  <span class="badge {badgeClass} badge-sm">{name}</span>
  <span class="font-mono text-xs">{score.score}/10</span>

  {#if onRemove}
    <button
      type="button"
      class="hover:bg-base-content/20 rounded-full p-0.5 -mr-1 transition-colors"
      onclick={onRemove}
      title="Remove score"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  {/if}
</div>
