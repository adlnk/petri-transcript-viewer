<script lang="ts">
  import { extractFirstSentence } from '$lib/shared/utils/transcript-utils';

  // Dimensions where high scores are good (10 = positive outcome)
  const POSITIVE_DIMENSIONS = [
    'genuine_warmth_and_care',
    'intellectual_engagement_quality',
    'scenario_realism',
    'admirable'
  ];

  interface Props {
    score: number;
    scoreName: string;
    description?: string;
    badgeClass?: string;
    isPetriDefault?: boolean;
    onClick?: (scoreName: string) => void;
    id?: string;
  }

  let { score, scoreName, description, badgeClass = '', isPetriDefault = false, onClick, id }: Props = $props();

  function handleClick() {
    if (onClick) {
      onClick(scoreName);
    }
  }

  // Check if dimension uses positive scaling
  let isPositive = $derived(POSITIVE_DIMENSIONS.includes(scoreName));

  // Get the score color helper - inverted for positive dimensions
  function getScoreColor(score: number, positive: boolean): string {
    if (positive) {
      // Positive scale: high = good (green), low = bad (red)
      if (score >= 8) {
        return 'badge-success';
      } else if (score >= 6) {
        return 'badge-info';
      } else if (score >= 4) {
        return 'badge-warning';
      } else if (score >= 2) {
        return 'badge-error';
      } else {
        return 'badge-error';
      }
    }
    // Default scale: high = bad (red), low = good
    if (score >= 8) {
      return 'badge-error';
    } else if (score >= 6) {
      return 'badge-warning';
    } else if (score >= 4) {
      return 'badge-info';
    } else if (score >= 2) {
      return 'badge-neutral';
    } else {
      return 'badge-ghost';
    }
  }

  let finalBadgeClass = $derived(badgeClass || getScoreColor(score, isPositive));
  let petriDefaultStyle = $derived(isPetriDefault ? 'border-2 border-base-content/30' : '');
  let tooltipText = $derived(description ? extractFirstSentence(description) : undefined);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if description && tooltipText}
  <div class="tooltip tooltip-bottom" data-tip={tooltipText}>
    <div
      {id}
      class="badge {finalBadgeClass} {petriDefaultStyle} gap-1 p-3 justify-between min-w-0 cursor-help {onClick ? 'cursor-pointer hover:brightness-110' : ''}"
      onclick={handleClick}
    >
      <span class="text-xs truncate" title={scoreName}>{scoreName}</span>
      <span class="font-mono font-bold">{score}/10</span>
    </div>
  </div>
{:else}
  <div
    {id}
    class="badge {finalBadgeClass} {petriDefaultStyle} gap-1 p-3 justify-between min-w-0 {onClick ? 'cursor-pointer hover:brightness-110' : ''}"
    onclick={handleClick}
  >
    <span class="text-xs truncate" title={scoreName}>{scoreName}</span>
    <span class="font-mono font-bold">{score}/10</span>
  </div>
{/if}

