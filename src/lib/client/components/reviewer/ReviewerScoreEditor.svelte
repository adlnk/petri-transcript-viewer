<script lang="ts">
  import { addReviewerScore, removeReviewerScore } from '$lib/client/stores/annotation-store';
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

  // Pre-fill with existing score if editing; annotator defaults to 10 (sentinel), reviewer to judge score
  let score = $state(existingScore ?? (reviewerStore.isAnnotatorMode ? 10 : judgeScore));
  let justification = $state(existingJustification ?? '');
  let saving = $state(false);
  let error = $state<string | null>(null);

  // "I agree with this score" checkbox - not used in annotator mode
  let agreeWithJudge = $state(reviewerStore.isAnnotatorMode ? false : existingScore === judgeScore);

  let name = $derived(displayName || dimension.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  let isEditing = $derived(existingScore !== undefined);

  // When score changes, uncheck "I agree" if it no longer matches judge score
  $effect(() => {
    if (score !== judgeScore) {
      agreeWithJudge = false;
    }
  });

  // Handle "I agree" checkbox change
  function handleAgreeChange(checked: boolean) {
    agreeWithJudge = checked;
    if (checked) {
      score = judgeScore;
    }
  }

  // Revert to judge score (keeps justification, doesn't auto-check "I agree")
  function handleRevert() {
    score = judgeScore;
  }

  // Markdown renderer for judge instructions
  const md = new MarkdownIt({ html: false, breaks: true, linkify: false });

  // Extract short description (first sentence) for tooltip
  let shortDescription = $derived.by(() => {
    if (!description) return null;
    // Get first sentence (up to first period followed by space or end)
    const match = description.match(/^[^.]+\./);
    return match ? match[0] : description.slice(0, 100) + (description.length > 100 ? '...' : '');
  });

  // Check if we have full scoring instructions to show
  let hasFullInstructions = $derived(!!description);

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
        justification: justification.trim() || undefined,
        ...(reviewerStore.isAnnotatorMode ? {} : { agreedWithJudge: agreeWithJudge })
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
      <h2 class="card-title">{isEditing ? 'Edit' : 'Add'} {reviewerStore.isAnnotatorMode ? 'Annotation' : 'Reviewer Score'}</h2>

      <!-- Dimension info -->
      <div class="bg-base-200 rounded-lg p-3 mb-2">
        <h3 class="font-semibold text-sm">{name}</h3>
        {#if shortDescription}
          <p class="text-sm text-base-content/70 mt-1">{shortDescription}</p>
        {/if}
      </div>

      <!-- Scoring criteria -->
      {#if hasFullInstructions}
        {#if reviewerStore.isAnnotatorMode}
          <!-- Expanded by default in annotator mode -->
          <div class="mb-4 p-3 bg-base-200 rounded-lg prose prose-sm max-w-none text-base-content/80">
            {@html md.render(description || '')}
          </div>
        {:else}
          <details class="mb-4">
            <summary class="text-sm text-base-content/60 hover:text-base-content/80 cursor-pointer select-none">
              Scoring criteria
            </summary>
            <div class="mt-2 p-3 bg-base-200 rounded-lg prose prose-sm max-w-none text-base-content/80">
              {@html md.render(description || '')}
            </div>
          </details>
        {/if}
      {/if}

      {#if !reviewerStore.isAnnotatorMode}
        <!-- Original judge score (prominent when editing) -->
        <div class="bg-base-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <div>
            <span class="text-sm text-base-content/70">Judge score:</span>
            <span class="font-mono font-bold text-lg ml-2">{judgeScore}/10</span>
          </div>
          {#if isEditing && score !== judgeScore}
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              onclick={handleRevert}
              title="Revert to judge score"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              Revert
            </button>
          {/if}
        </div>

        <!-- Judge's justification for this dimension -->
        {#if dimensionJustification}
          <div class="collapse collapse-arrow bg-base-200 mb-4">
            <input type="checkbox" checked />
            <div class="collapse-title text-sm font-medium py-2 min-h-0">
              {subJudgeResult ? "Judge Model Analysis" : "Judge's Justification"}
            </div>
            <div class="collapse-content">
              <p class="text-sm text-base-content/80 whitespace-pre-wrap">{dimensionJustification}</p>
            </div>
          </div>
        {:else if judgeJustification}
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

      {#if !reviewerStore.isAnnotatorMode}
        <!-- I agree with judge checkbox -->
        <label class="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            class="checkbox checkbox-sm checkbox-primary"
            checked={agreeWithJudge}
            onchange={(e) => handleAgreeChange(e.currentTarget.checked)}
          />
          <span class="text-sm">I agree with the judge's score</span>
        </label>
      {/if}

      <!-- Justification -->
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">{reviewerStore.isAnnotatorMode ? 'Justification (optional if scoring 1)' : 'Justification (optional)'}</span>
        </label>
        <textarea
          class="textarea textarea-bordered h-24"
          placeholder={reviewerStore.isAnnotatorMode ? "Explain your reasoning for this score" : "Why do you agree/disagree with the judge's score?"}
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
