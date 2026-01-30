<script lang="ts">
  import { onMount } from 'svelte';
  import type { ReviewerScore } from '$lib/shared/types';
  import { getAnnotation, removeReviewerScore } from '$lib/client/stores/annotation-store';
  import { reviewerStore } from '$lib/client/stores/reviewer.svelte';
  import ReviewerScoreBadge from './ReviewerScoreBadge.svelte';
  import ReviewerScoreEditor from './ReviewerScoreEditor.svelte';

  interface Props {
    filePath: string;
    dimension: string;
    judgeScore: number;
    displayName?: string;
    description?: string;
    judgeJustification?: string;
    subJudgeResults?: any[];
    onUpdate?: () => void;
  }

  let { filePath, dimension, judgeScore, displayName, description, judgeJustification, subJudgeResults, onUpdate }: Props = $props();

  let reviewerScore = $state<ReviewerScore | undefined>(undefined);
  let showEditor = $state(false);

  // Load existing reviewer score on mount
  onMount(async () => {
    await loadReviewerScore();
  });

  async function loadReviewerScore() {
    const annotation = await getAnnotation(filePath);
    reviewerScore = annotation?.reviewerScores?.find(s => s.dimension === dimension);
  }

  async function handleRemove() {
    if (!reviewerStore.reviewerName) return;
    await removeReviewerScore(filePath, reviewerStore.reviewerName, dimension);
    reviewerScore = undefined;
    onUpdate?.();
  }

  async function handleSave() {
    showEditor = false;
    await loadReviewerScore();
    onUpdate?.();
  }
</script>

{#if reviewerScore}
  <ReviewerScoreBadge
    score={reviewerScore}
    displayName={displayName}
    onEdit={() => showEditor = true}
    onRemove={handleRemove}
  />
{:else if reviewerStore.can('addReviewerScores')}
  <button
    type="button"
    class="btn btn-ghost btn-xs opacity-50 hover:opacity-100"
    onclick={() => showEditor = true}
    title="Add your score for this dimension"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
    </svg>
  </button>
{/if}

{#if showEditor}
  <ReviewerScoreEditor
    {filePath}
    {dimension}
    {displayName}
    {description}
    {judgeScore}
    {judgeJustification}
    {subJudgeResults}
    existingScore={reviewerScore?.score}
    existingJustification={reviewerScore?.justification}
    onSave={handleSave}
    onCancel={() => showEditor = false}
  />
{/if}
