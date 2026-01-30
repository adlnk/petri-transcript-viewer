<script lang="ts">
  import { addReviewerScore } from '$lib/client/stores/annotation-store';
  import { reviewerStore } from '$lib/client/stores/reviewer.svelte';
  import MarkdownIt from 'markdown-it';

  interface SubJudgeResult {
    dimension: string;
    score: number;
    note?: string;
    response?: string;
    citations?: any[];
  }

  interface Props {
    filePath: string;
    dimension: string;
    displayName?: string;
    description?: string;
    judgeScore: number;
    judgeJustification?: string;  // Full coordinator justification text
    subJudgeResults?: SubJudgeResult[];  // Individual sub-judge results
    existingScore?: number;  // Pre-fill with existing reviewer score
    existingJustification?: string;  // Pre-fill with existing justification
    onSave: () => void;
    onCancel: () => void;
  }

  let { filePath, dimension, displayName, description, judgeScore, judgeJustification, subJudgeResults, existingScore, existingJustification, onSave, onCancel }: Props = $props();

  // Pre-fill with existing score if editing, otherwise default to judge score
  let score = $state(existingScore ?? judgeScore);
  let justification = $state(existingJustification ?? '');
  let saving = $state(false);
  let error = $state<string | null>(null);

  let name = $derived(displayName || dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  let isEditing = $derived(existingScore !== undefined);

  // Markdown renderer for judge instructions
  const md = new MarkdownIt({ html: false, breaks: true, linkify: false });

  // Extract short description (first sentence) for tooltip
  let shortDescription = $derived.by(() => {
    if (!description) return null;
    // Get first sentence (up to first period followed by space or end)
    const match = description.match(/^[^.]+\./);
    return match ? match[0] : description.slice(0, 100) + (description.length > 100 ? '...' : '');
  });

  // Check if description is long enough to warrant expandable section
  let hasFullInstructions = $derived(description && description.length > 150);

  // Get the sub-judge result for this specific dimension
  let subJudgeResult = $derived.by(() => {
    if (!subJudgeResults) return null;
    return subJudgeResults.find(r => r.dimension === dimension) || null;
  });

  // Extract the judge's justification for this specific dimension
  // Priority: sub-judge note > extracted from coordinator justification > full justification
  let dimensionJustification = $derived.by(() => {
    // First, try sub-judge result (best source for independent scoring)
    if (subJudgeResult?.note) {
      return subJudgeResult.note;
    }

    // Fall back to extracting from coordinator justification
    if (!judgeJustification) return null;

    // Look for patterns like **dimension_name**: or dimension_name:
    const patterns = [
      // **dimension_name**: (score) text
      new RegExp(`\\*\\*${dimension}\\*\\*\\s*:\\s*\\(?\\d+\\)?\\s*([^]*?)(?=\\n\\s*\\*\\*|\\n\\s*$|$)`, 'i'),
      // dimension_name: (score) text
      new RegExp(`(?:^|\\n)${dimension}\\s*:\\s*\\(?\\d+\\)?\\s*([^]*?)(?=\\n\\s*\\w+\\s*:|\\n\\s*$|$)`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = judgeJustification.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  });

  async function handleSave() {
    if (!reviewerStore.reviewerName) {
      error = 'Reviewer name not set';
      return;
    }

    saving = true;
    error = null;

    try {
      await addReviewerScore(filePath, reviewerStore.reviewerName, {
        dimension,
        score,
        justification: justification.trim() || undefined
      });
      onSave();
    } catch (err: any) {
      error = err.message || 'Failed to save score';
      saving = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onCancel();
    }
  }
</script>

<!-- Modal backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
  onclick={(e) => e.target === e.currentTarget && onCancel()}
  onkeydown={handleKeyDown}
>
  <div class="card bg-base-100 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
    <div class="card-body">
      <h2 class="card-title">{isEditing ? 'Edit' : 'Add'} Reviewer Score</h2>

      <!-- Dimension info -->
      <div class="bg-base-200 rounded-lg p-3 mb-4">
        <h3 class="font-semibold text-sm">{name}</h3>
        {#if shortDescription}
          <p class="text-sm text-base-content/70 mt-1">{shortDescription}</p>
        {/if}
        <p class="text-xs text-base-content/50 mt-2">
          Judge score: <span class="font-mono font-bold">{judgeScore}/10</span>
        </p>
      </div>

      <!-- Full judge instructions (expandable) -->
      {#if hasFullInstructions}
        <div class="collapse collapse-arrow bg-base-200 mb-4">
          <input type="checkbox" />
          <div class="collapse-title text-sm font-medium py-2 min-h-0">
            Scoring Criteria
          </div>
          <div class="collapse-content">
            <div class="prose prose-sm max-w-none text-base-content/80">
              {@html md.render(description || '')}
            </div>
          </div>
        </div>
      {/if}

      <!-- Judge's justification for this dimension -->
      {#if dimensionJustification}
        <div class="collapse collapse-arrow bg-base-200 mb-4">
          <input type="checkbox" checked />
          <div class="collapse-title text-sm font-medium py-2 min-h-0">
            {subJudgeResult ? "Sub-Judge's Analysis" : "Judge's Justification"}
          </div>
          <div class="collapse-content">
            <p class="text-sm text-base-content/80 whitespace-pre-wrap">{dimensionJustification}</p>
          </div>
        </div>
      {:else if judgeJustification}
        <!-- Fallback: show full justification if we couldn't extract dimension-specific -->
        <div class="collapse collapse-arrow bg-base-200 mb-4">
          <input type="checkbox" />
          <div class="collapse-title text-sm font-medium py-2 min-h-0">
            Full Coordinator Justification
          </div>
          <div class="collapse-content">
            <p class="text-sm text-base-content/80 whitespace-pre-wrap max-h-48 overflow-y-auto">{judgeJustification}</p>
          </div>
        </div>
      {/if}

      <!-- Score input -->
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">Your Score</span>
          <span class="label-text-alt font-mono">{score}/10</span>
        </label>
        <input
          type="range"
          min="1"
          max="10"
          bind:value={score}
          class="range range-primary"
        />
        <div class="w-full flex justify-between text-xs px-2 mt-1">
          {#each Array(10) as _, i}
            <span class={score === i + 1 ? 'font-bold text-primary' : 'text-base-content/50'}>{i + 1}</span>
          {/each}
        </div>
      </div>

      <!-- Justification -->
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">Justification (optional)</span>
        </label>
        <textarea
          class="textarea textarea-bordered h-24"
          placeholder="Why do you disagree with the judge's score?"
          bind:value={justification}
        ></textarea>
      </div>

      {#if error}
        <div class="text-error text-sm mb-4">{error}</div>
      {/if}

      <!-- Actions -->
      <div class="card-actions justify-end">
        <button type="button" class="btn btn-ghost" onclick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick={handleSave} disabled={saving}>
          {#if saving}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          Save Score
        </button>
      </div>
    </div>
  </div>
</div>
