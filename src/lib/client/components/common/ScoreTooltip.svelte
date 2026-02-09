<script lang="ts">
  import { extractFirstSentence } from '$lib/shared/utils/transcript-utils';
  import type { ReviewerScore } from '$lib/shared/types';
  import { reviewerStore } from '$lib/client/stores/reviewer.svelte';

  // Dimensions where high scores are good (10 = positive outcome)
  const POSITIVE_DIMENSIONS = [
    'genuine_warmth_and_care',
    'intellectual_engagement_quality',
    'scenario_realism',
    'admirable'
  ];

  interface Props {
    score: number;  // Judge score
    scoreName: string;
    displayName?: string;  // Human-readable name (falls back to scoreName)
    description?: string;
    badgeClass?: string;
    isPetriDefault?: boolean;
    onClick?: (scoreName: string) => void;
    id?: string;
    // Reviewer mode props
    reviewerScore?: ReviewerScore;  // Reviewer's score for this dimension (if any)
    onEditScore?: () => void;  // Callback to open score editor
  }

  let { score, scoreName, displayName, description, badgeClass = '', isPetriDefault = false, onClick, id, reviewerScore, onEditScore }: Props = $props();

  // Use displayName if provided, otherwise fall back to scoreName
  let shownName = $derived(displayName || scoreName);

  // Reviewer edited the score if: score differs from judge OR they explicitly agreed
  let reviewerMadeChange = $derived(
    reviewerScore !== undefined &&
    (reviewerScore.score !== score || reviewerScore.agreedWithJudge === true)
  );

  // Display score: show reviewer score only if they made a meaningful change
  let displayScore = $derived(reviewerMadeChange ? reviewerScore!.score : score);

  // Show checkmark if agreed, user icon if score differs
  let showAgreedCheckmark = $derived(reviewerScore?.agreedWithJudge === true);
  let showUserIcon = $derived(reviewerMadeChange && !showAgreedCheckmark);

  function handleClick() {
    if (onClick) {
      onClick(scoreName);
    }
  }

  function handleEditClick(e: MouseEvent) {
    e.stopPropagation();
    onEditScore?.();
  }

  // Check if dimension uses positive scaling
  let isPositive = $derived(POSITIVE_DIMENSIONS.includes(scoreName));

  // Get the score color helper - inverted for positive dimensions
  function getScoreColor(scoreVal: number, positive: boolean): string {
    if (positive) {
      // Positive scale: high = good (green), low = bad (red)
      if (scoreVal >= 8) {
        return 'badge-success';
      } else if (scoreVal >= 6) {
        return 'badge-info';
      } else if (scoreVal >= 4) {
        return 'badge-warning';
      } else if (scoreVal >= 2) {
        return 'badge-error';
      } else {
        return 'badge-error';
      }
    }
    // Default scale: high = bad (red), low = good
    if (scoreVal >= 8) {
      return 'badge-error';
    } else if (scoreVal >= 6) {
      return 'badge-warning';
    } else if (scoreVal >= 4) {
      return 'badge-info';
    } else if (scoreVal >= 2) {
      return 'badge-neutral';
    } else {
      return 'badge-ghost';
    }
  }

  let finalBadgeClass = $derived(badgeClass || getScoreColor(displayScore, isPositive));
  let petriDefaultStyle = $derived(isPetriDefault ? 'border-2 border-base-content/30' : '');
  // Reviewer edit styling: dashed border when reviewer has made a change (different score or agreed)
  let reviewerEditStyle = $derived(reviewerMadeChange ? 'border-2 border-dashed border-secondary/60' : '');
  let tooltipText = $derived(description ? extractFirstSentence(description) : undefined);

  // Show edit pencil in reviewer mode
  let showEditPencil = $derived(reviewerStore.can('addReviewerScores') && onEditScore);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if description && tooltipText}
  <div class="tooltip tooltip-bottom" data-tip={tooltipText}>
    <div
      {id}
      class="badge {finalBadgeClass} {petriDefaultStyle} {reviewerEditStyle} gap-1 p-3 justify-between min-w-0 cursor-help {onClick ? 'cursor-pointer hover:brightness-110' : ''}"
      onclick={handleClick}
      title={reviewerMadeChange ? `Reviewer: ${reviewerScore?.reviewerName} (original: ${score}/10)` : undefined}
    >
      {#if showAgreedCheckmark}
        <!-- Checkmark icon for "I agree" (inherits text color) -->
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      {:else if showUserIcon}
        <!-- User icon for reviewer edit (inherits text color) -->
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      {/if}
      <span class="text-xs truncate" title={scoreName}>{shownName}</span>
      <span class="font-mono font-bold">{displayScore}/10</span>
      {#if showEditPencil}
        <button
          type="button"
          class="hover:bg-base-content/20 rounded-full p-0.5 transition-colors shrink-0"
          onclick={handleEditClick}
          title="Edit score"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      {/if}
    </div>
  </div>
{:else}
  <div
    {id}
    class="badge {finalBadgeClass} {petriDefaultStyle} {reviewerEditStyle} gap-1 p-3 justify-between min-w-0 {onClick ? 'cursor-pointer hover:brightness-110' : ''}"
    onclick={handleClick}
    title={reviewerMadeChange ? `Reviewer: ${reviewerScore?.reviewerName} (original: ${score}/10)` : undefined}
  >
    {#if showAgreedCheckmark}
      <!-- Checkmark icon for "I agree" (inherits text color) -->
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
    {:else if showUserIcon}
      <!-- User icon for reviewer edit (inherits text color) -->
      <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    {/if}
    <span class="text-xs truncate" title={scoreName}>{shownName}</span>
    <span class="font-mono font-bold">{displayScore}/10</span>
    {#if showEditPencil}
      <button
        type="button"
        class="hover:bg-base-content/20 rounded-full p-0.5 transition-colors shrink-0"
        onclick={handleEditClick}
        title="Edit score"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    {/if}
  </div>
{/if}

