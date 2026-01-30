<script lang="ts">
  import type { ReviewerIssueFlag } from '$lib/shared/types';
  import { setIssueFlags, getAnnotation } from '$lib/client/stores/annotation-store';
  import { reviewerStore } from '$lib/client/stores/reviewer.svelte';
  import { onMount } from 'svelte';

  interface Props {
    filePath: string;
    onUpdate?: () => void;
  }

  let { filePath, onUpdate }: Props = $props();

  // Available issue flags with labels
  const ISSUE_FLAG_OPTIONS: { value: ReviewerIssueFlag; label: string; description: string }[] = [
    {
      value: 'reviewer:inaccurate_citations',
      label: 'Inaccurate citations',
      description: 'Citations not supported by the referenced text'
    },
    {
      value: 'reviewer:broken_citations',
      label: 'Broken citations',
      description: 'Citation points to wrong message or invalid reference'
    },
    {
      value: 'reviewer:broken_transcript',
      label: 'Broken transcript',
      description: 'Transcript is malformed or cannot be properly displayed'
    },
    {
      value: 'reviewer:judge_miscalibration',
      label: 'Judge miscalibration',
      description: 'Judge scores seem significantly off from expected values'
    }
  ];

  let flags = $state<Set<ReviewerIssueFlag>>(new Set());
  let saving = $state(false);

  // Load existing flags on mount
  onMount(async () => {
    const annotation = await getAnnotation(filePath);
    if (annotation?.issueFlags) {
      flags = new Set(annotation.issueFlags);
    }
  });

  async function handleToggle(flag: ReviewerIssueFlag) {
    if (!reviewerStore.reviewerName) return;

    saving = true;
    try {
      if (flags.has(flag)) {
        flags.delete(flag);
      } else {
        flags.add(flag);
      }
      // Force reactivity
      flags = new Set(flags);

      await setIssueFlags(filePath, reviewerStore.reviewerName, Array.from(flags));
      onUpdate?.();
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-2">
  <h4 class="text-sm font-medium text-base-content/70">Issue Flags</h4>
  <div class="space-y-1">
    {#each ISSUE_FLAG_OPTIONS as option}
      <label class="flex items-start gap-2 cursor-pointer hover:bg-base-200 rounded px-2 py-1 -mx-2">
        <input
          type="checkbox"
          class="checkbox checkbox-sm checkbox-warning mt-0.5"
          checked={flags.has(option.value)}
          onchange={() => handleToggle(option.value)}
          disabled={saving}
        />
        <div>
          <span class="text-sm">{option.label}</span>
          <p class="text-xs text-base-content/50">{option.description}</p>
        </div>
      </label>
    {/each}
  </div>
  {#if flags.size > 0}
    <p class="text-xs text-warning mt-2">
      {flags.size} issue{flags.size === 1 ? '' : 's'} flagged
    </p>
  {/if}
</div>
