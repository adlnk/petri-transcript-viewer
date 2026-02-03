<script lang="ts">
  import type { ReviewerIssueFlag } from '$lib/shared/types';
  import { setIssueFlags, setIssueFlagNotes, getAnnotation } from '$lib/client/stores/annotation-store';
  import { reviewerStore } from '$lib/client/stores/reviewer.svelte';
  import { onMount } from 'svelte';

  interface Props {
    filePath: string;
    onUpdate?: () => void;
  }

  let { filePath, onUpdate }: Props = $props();

  // Available issue flags with labels and optional input prompts
  const ISSUE_FLAG_OPTIONS: {
    value: ReviewerIssueFlag;
    label: string;
    description: string;
    inputPlaceholder?: string;
    sideNote?: string;
  }[] = [
    {
      value: 'reviewer:inaccurate_citations',
      label: 'Inaccurate citations',
      description: 'The cited message doesn\'t actually support the judge\'s claim. If citation is broken (can\'t click to message), try Ctrl+F for the quote to check if the source was hallucinated.',
      inputPlaceholder: 'Which citations are inaccurate and how?'
    },
    {
      value: 'reviewer:broken_citations',
      label: 'Broken citations',
      description: 'Citation link doesn\'t work or points to wrong message. Try Ctrl+F for the quoted text to find the actual message.',
      inputPlaceholder: 'Which citations are broken?'
    },
    {
      value: 'reviewer:broken_transcript',
      label: 'Broken transcript',
      description: 'Transcript is malformed or cannot be properly displayed'
    },
    {
      value: 'reviewer:judge_miscalibration',
      label: 'Judge miscalibration',
      description: 'Judge scores seem significantly off from expected values',
      sideNote: 'For specific dimensions, edit that dimension\'s score. For general issues, use reviewer notes.'
    }
  ];

  let flags = $state<Set<ReviewerIssueFlag>>(new Set());
  let flagNotes = $state<Record<string, string>>({});
  let saving = $state(false);

  // Load existing flags on mount
  onMount(async () => {
    const annotation = await getAnnotation(filePath);
    if (annotation?.issueFlags) {
      flags = new Set(annotation.issueFlags);
    }
    if (annotation?.issueFlagNotes) {
      flagNotes = { ...annotation.issueFlagNotes };
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

  async function handleNoteChange(flag: ReviewerIssueFlag, note: string) {
    if (!reviewerStore.reviewerName) return;

    flagNotes[flag] = note;
    // Debounce the save
    await setIssueFlagNotes(filePath, reviewerStore.reviewerName, { ...flagNotes });
    onUpdate?.();
  }
</script>

<div class="space-y-2">
  <h4 class="text-sm font-medium text-base-content/70">Issue Flags</h4>
  <p class="text-xs text-base-content/50 mb-2">Check these for common patterns. Checking a box automatically adds the corresponding tag.</p>
  <div class="space-y-2">
    {#each ISSUE_FLAG_OPTIONS as option}
      <div class="rounded px-2 py-1 -mx-2 hover:bg-base-200">
        <label class="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            class="checkbox checkbox-sm checkbox-warning mt-0.5"
            checked={flags.has(option.value)}
            onchange={() => handleToggle(option.value)}
            disabled={saving}
          />
          <div class="flex-1">
            <span class="text-sm">{option.label}</span>
            <p class="text-xs text-base-content/50">{option.description}</p>
          </div>
        </label>

        <!-- Show text input when flag is checked and has inputPlaceholder -->
        {#if flags.has(option.value) && option.inputPlaceholder}
          <div class="ml-6 mt-1">
            <input
              type="text"
              class="input input-sm input-bordered w-full text-xs"
              placeholder={option.inputPlaceholder}
              value={flagNotes[option.value] || ''}
              oninput={(e) => handleNoteChange(option.value, e.currentTarget.value)}
            />
          </div>
        {/if}

        <!-- Show side note when flag is checked and has sideNote -->
        {#if flags.has(option.value) && option.sideNote}
          <p class="ml-6 mt-1 text-xs text-info">{option.sideNote}</p>
        {/if}
      </div>
    {/each}
  </div>
  {#if flags.size > 0}
    <p class="text-xs text-warning mt-2">
      {flags.size} issue{flags.size === 1 ? '' : 's'} flagged
    </p>
  {/if}
</div>
