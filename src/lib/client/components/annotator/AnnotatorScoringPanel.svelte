<script lang="ts">
  import { addReviewerScore } from '$lib/client/stores/annotation-store';
  import { reviewerStore } from '$lib/client/stores/reviewer.svelte';
  import { ANNOTATOR_DIMENSIONS } from '$lib/shared/annotator-dimensions';
  import { base } from '$app/paths';
  import type { ReviewerAnnotations } from '$lib/shared/types';

  interface Props {
    filePath: string;
    dimensionDisplayNames: Record<string, string>;
    scoreDescriptions: Record<string, string>;
    scoreInstructions: Record<string, string>;
    reviewerAnnotations?: ReviewerAnnotations;
    onOpenScoreEditor: (dimension: string, judgeScore: number, displayName?: string, description?: string) => void;
    onAnnotationChange: () => Promise<void>;
  }

  let { filePath, dimensionDisplayNames, scoreDescriptions, scoreInstructions, reviewerAnnotations, onOpenScoreEditor, onAnnotationChange }: Props = $props();

  // Load Petri default descriptions (standardized, not judge-specific)
  let petriDefaults = $state<Record<string, { description: string; instruction: string }>>({});

  $effect(() => {
    fetch(`${base}/data/petri-default-dimensions.json`)
      .then(r => r.ok ? r.json() : {})
      .then(data => { petriDefaults = data; })
      .catch(() => {});
  });

  // Track which criteria sections are expanded
  let expandedDimensions = $state<Set<string>>(new Set());

  function toggleCriteria(dim: string) {
    if (expandedDimensions.has(dim)) {
      expandedDimensions.delete(dim);
    } else {
      expandedDimensions.add(dim);
    }
    expandedDimensions = new Set(expandedDimensions);
  }

  // Get display name for a dimension
  function getDisplayName(dim: string): string {
    return dimensionDisplayNames[dim] || dim.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Get scoring criteria: Petri defaults take priority over transcript-embedded descriptions
  function getCriteria(dim: string): string | undefined {
    return petriDefaults[dim]?.instruction || scoreInstructions[dim] || scoreDescriptions[dim];
  }

  // Get short description
  function getShortDescription(dim: string): string | undefined {
    return petriDefaults[dim]?.description || scoreDescriptions[dim];
  }

  // Get existing reviewer score for a dimension
  function getScore(dim: string) {
    return reviewerAnnotations?.reviewerScores?.find(s => s.dimension === dim);
  }

  let scoredCount = $derived(
    ANNOTATOR_DIMENSIONS.filter(d => getScore(d)).length
  );

  async function quickDismiss(dim: string) {
    if (!reviewerStore.reviewerName) return;
    await addReviewerScore(filePath, reviewerStore.reviewerName, {
      dimension: dim,
      score: 1,
    });
    await onAnnotationChange();
  }

  function openEditor(dim: string) {
    const criteria = getCriteria(dim);
    onOpenScoreEditor(dim, 0, getDisplayName(dim), criteria);
  }
</script>

<div id="section-scores" class="mb-6 space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold">Annotation</h3>
    <span class="badge badge-outline">{scoredCount}/{ANNOTATOR_DIMENSIONS.length} scored</span>
  </div>

  <!-- Progress bar -->
  <progress
    class="progress progress-primary w-full"
    value={scoredCount}
    max={ANNOTATOR_DIMENSIONS.length}
  ></progress>

  <!-- Dimension list -->
  <div class="space-y-1">
    {#each ANNOTATOR_DIMENSIONS as dim}
      {@const existing = getScore(dim)}
      {@const shortDesc = getShortDescription(dim)}
      <div class="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-base-200 group {existing ? 'bg-base-200/50' : ''}">
        <!-- Status indicator -->
        {#if existing}
          {#if existing.score === 1 && !existing.justification}
            <!-- Quick-dismissed -->
            <span class="text-base-content/30 text-sm w-5 text-center" title="Not observed">—</span>
          {:else}
            <!-- Fully scored -->
            <span class="text-success text-sm w-5 text-center" title="Scored">&#10003;</span>
          {/if}
        {:else}
          <!-- Unscored -->
          <span class="w-5"></span>
        {/if}

        <!-- Dimension name + short description -->
        <div class="flex-1 min-w-0">
          <button
            class="text-left text-sm font-medium hover:underline cursor-pointer"
            onclick={() => toggleCriteria(dim)}
            title="Show scoring criteria"
          >
            {getDisplayName(dim)}
          </button>
          {#if existing}
            <span class="badge badge-sm ml-2 {existing.score >= 6 ? 'badge-warning' : existing.score >= 3 ? 'badge-info' : 'badge-ghost'}">{existing.score}</span>
          {/if}
          {#if shortDesc && !expandedDimensions.has(dim)}
            <span class="text-xs text-base-content/50 ml-2 hidden sm:inline">{shortDesc}</span>
          {/if}
        </div>

        <!-- Action buttons -->
        <div class="flex gap-1 shrink-0">
          {#if !existing}
            <button
              class="btn btn-ghost btn-xs text-base-content/50 hover:text-base-content"
              onclick={() => quickDismiss(dim)}
              title="Not observed (score = 1)"
            >
              N/A
            </button>
            <button
              class="btn btn-primary btn-xs"
              onclick={() => openEditor(dim)}
            >
              Score
            </button>
          {:else}
            <button
              class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100"
              onclick={() => openEditor(dim)}
              title="Edit score"
            >
              Edit
            </button>
          {/if}
        </div>
      </div>

      <!-- Expanded scoring criteria -->
      {#if expandedDimensions.has(dim)}
        {@const criteria = getCriteria(dim)}
        {#if criteria}
          <div class="ml-7 mb-2 p-3 bg-base-200 rounded-lg text-sm text-base-content/80 whitespace-pre-wrap">
            {criteria}
          </div>
        {:else}
          <div class="ml-7 mb-2 p-3 bg-base-200 rounded-lg text-sm text-base-content/50 italic">
            No scoring criteria available
          </div>
        {/if}
      {/if}
    {/each}
  </div>
</div>
