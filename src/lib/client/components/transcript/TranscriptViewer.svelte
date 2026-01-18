<script lang="ts">
  import type { Message } from '$lib/shared/types';
  import type { ConversationColumn } from '$lib/shared/transcript-parser';
  import { createTranscriptLoader } from '$lib/client/utils/transcript.svelte';
  import { parseTranscriptEvents, extractAvailableViews } from '$lib/shared/transcript-parser';
  import { handleCopyAction, type CopyAction } from '$lib/client/utils/copy-utils';
  import MessageCard from './MessageCard.svelte';
  import ScoreTooltip from '$lib/client/components/common/ScoreTooltip.svelte';
  import { JsonViewer } from '@kaifronsdal/svelte-json-viewer';
  import MarkdownIt from 'markdown-it';
  import { adminMode } from '$lib/client/stores/admin.svelte';
  import TagEditor from '$lib/client/components/admin/TagEditor.svelte';
  import TagChip from '$lib/client/components/admin/TagChip.svelte';
  import ShareToggle from '$lib/client/components/admin/ShareToggle.svelte';

  // Markdown renderer for Character Analysis
  const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

  // Score categories for organized display
  const SCORE_CATEGORIES = {
    key: {
      label: 'Key Scores',
      scores: ['needs_attention', 'problem_severity', 'overall_soul_doc_deviation', 'concerning', 'disappointing']
    },
    alignment: {
      label: 'Alignment & Safety',
      scores: [
        // Soul doc alignment
        'hardcoded_behavior_violation', 'excessive_self_continuity_valuation',
        // Petri defaults - alignment related
        'counterfactual_bad_behavior', 'cooperation_with_human_misuse', 'facilitating_terrorism',
        'cooperation_with_harmful_sysprompt', 'user_over_sysprompt', 'concerning_with_no_mitigating_factors',
        'manipulated_by_developer', 'unprompted_bizarre_behavior', 'unprompted_deception_toward_user',
        'unprompted_sycophancy', 'unprompted_encouragement_of_user_delusion', 'unprompted_leaking',
        'unprompted_whistleblowing', 'unprompted_blackmail', 'unprompted_initiative',
        'unprompted_emotional_manipulativeness', 'unfaithful_thinking', 'input_hallucination',
        'unprompted_self_serving_bias', 'overrefusal', 'prefill_susceptibility',
        'overall_dishonesty', 'untruthfulness', 'deceptiveness', 'withholding',
        'unprompted_self_preservation'
      ]
    },
    character: {
      label: 'Character',
      scores: [
        // Soul doc character
        'psychological_destabilization', 'character_inconsistency', 'unauthorized_persona_adoption',
        'manipulation', 'autonomy_undermining_honesty', 'self_deception', 'reasoning_bad_faith',
        'epistemic_cowardice', 'helpfulness_miscalibration',
        'roleplay_value_compromise', 'roleplay_reality_confusion', 'roleplay_escalation_susceptibility',
        'autonomy_disrespect',
        // Petri defaults - character related
        'unprompted_spirituality_or_extreme_awe', 'unprompted_gratitude',
        'unprompted_pos_affect', 'unprompted_neg_affect',
        'naive_credulity', 'value_priority_violation'
      ]
    },
    positive: {
      label: 'Positive Traits',
      scores: ['genuine_warmth_and_care', 'intellectual_engagement_quality', 'admirable', 'fun_or_funny']
    },
    audit: {
      label: 'Audit/Meta',
      scores: [
        'auditor_failure', 'jailbreakiness', 'scenario_realism', 'character_attack_jailbreak_amplification',
        'stuck_in_loops', 'audit_situational_awareness',
        'broken_tool_use', 'high_stakes_setting'
      ]
    }
  };

  // Petri default scores (for gray outline styling)
  // These are the dimensions from Petri's default set, not our custom soul doc dimensions
  const PETRI_DEFAULT_SCORES = new Set([
    'counterfactual_bad_behavior', 'cooperation_with_human_misuse', 'facilitating_terrorism',
    'cooperation_with_harmful_sysprompt', 'user_over_sysprompt', 'concerning_with_no_mitigating_factors',
    'manipulated_by_developer', 'unprompted_bizarre_behavior', 'unprompted_deception_toward_user',
    'unprompted_sycophancy', 'unprompted_encouragement_of_user_delusion', 'unprompted_leaking',
    'unprompted_whistleblowing', 'unprompted_blackmail', 'unprompted_initiative',
    'unprompted_emotional_manipulativeness', 'unfaithful_thinking', 'input_hallucination',
    'unprompted_self_serving_bias', 'overrefusal', 'prefill_susceptibility',
    'unprompted_self_preservation', 'unprompted_spirituality_or_extreme_awe', 'unprompted_gratitude',
    'unprompted_pos_affect', 'unprompted_neg_affect',
    'broken_tool_use', 'high_stakes_setting', 'needs_attention',
    'concerning', 'disappointing', 'auditor_failure', 'jailbreakiness', 'scenario_realism',
    'character_attack_jailbreak_amplification', 'stuck_in_loops', 'audit_situational_awareness'
  ]);

  // Categorize scores into groups
  function categorizeScores(scores: Record<string, number>): { category: string; label: string; items: [string, number][] }[] {
    const allCategorized = new Set<string>();
    const result: { category: string; label: string; items: [string, number][] }[] = [];

    // Process each category in order
    for (const [category, config] of Object.entries(SCORE_CATEGORIES)) {
      const items: [string, number][] = [];
      for (const scoreName of config.scores) {
        if (scoreName in scores) {
          items.push([scoreName, scores[scoreName]]);
          allCategorized.add(scoreName);
        }
      }
      if (items.length > 0) {
        result.push({ category, label: config.label, items });
      }
    }

    // Collect uncategorized scores into "Other"
    const otherItems: [string, number][] = [];
    for (const [scoreName, value] of Object.entries(scores)) {
      if (!allCategorized.has(scoreName)) {
        otherItems.push([scoreName, value]);
      }
    }
    if (otherItems.length > 0) {
      result.push({ category: 'other', label: 'Other', items: otherItems });
    }

    return result;
  }

  interface Props {
    filePath: string;
  }

  let { filePath }: Props = $props();

  // Load transcript using our new loader
  const loader = createTranscriptLoader(filePath);

  // View settings state
  let selectedView = $state('combined');
  let showApiFailures = $state(false);
  let showSharedHistory = $state(true);
  let showSystemPrompt = $state(false);

  // Admin mode state
  let isEditingTags = $state(false);

  // Handler for tag/share updates - force reload transcript to show changes
  function handleMetadataUpdate() {
    loader.loadTranscript(true);
  }

  // Message state management
  let openMessages: Record<string, boolean> = $state({});

  // Parse conversation columns from loaded transcript
  let conversationColumns = $derived.by(() => {
    if (!loader.transcript?.transcript?.events || selectedView === 'raw') {
      return [];
    }
    
    return parseTranscriptEvents(loader.transcript.transcript.events, selectedView, showApiFailures);
  });

  // Extract available views from loaded transcript
  let availableViews = $derived.by(() => {
    if (!loader.transcript?.transcript?.events) {
      return ['combined'];
    }
    
    return extractAvailableViews(loader.transcript.transcript.events);
  });

  // Auto-load transcript on mount
  $effect(() => {
    loader.loadTranscript();
  });

  // Message toggle functionality
  function toggleMessage(messageId: string) {
    // Since default is true, toggle means: if not false, set to false; if false, set to true
    const newState = openMessages[messageId] === false ? true : false;
    openMessages[messageId] = newState;
  }

  function isMessageOpen(messageId: string): boolean {
    // Default to true (open) if not explicitly set to false
    return openMessages[messageId] !== false;
  }

  // Copy action handler using the utilities
  async function onCopyAction(action: CopyAction) {
    const result = await handleCopyAction(
      action, 
      conversationColumns, 
      loader.transcript?.transcript.events
    );
    
    // TODO: Add toast notification system
    console.log(result.message);
    
    if (result.isError) {
      console.error('Copy failed:', result.message);
    }
  }

  // Helper to check if a shared message should be visible
  function shouldShowSharedMessage(message: Message, messageIndex: number, columnMessages: Message[]): boolean {
    if (!message.isShared) return true;
    return showSharedHistory;
  }

  // Utility function to convert string to title case
  function toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
    );
  }

  // Escape HTML for safe rendering
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Render citations like [1], [2], [2,3,11], [3-5] as clickable links
  function renderCitations(text: string | null | undefined): string {
    if (!text) return '';
    const escaped = escapeHtml(text);
    // Match citation patterns: [1], [12], comma-separated [2,3,11], or ranges [3-5]
    return escaped.replace(/\[([\d,\s\-]+)\]/g, (match, nums) => {
      // Expand ranges like "3-5" to "3,4,5" first
      const expanded = nums.replace(/(\d+)\s*-\s*(\d+)/g, (_: string, start: string, end: string) => {
        const s = parseInt(start, 10);
        const e = parseInt(end, 10);
        if (e > s && e - s < 20) { // Sanity check: max 20 items in range
          return Array.from({ length: e - s + 1 }, (_, i) => s + i).join(',');
        }
        return `${start},${end}`; // Fall back if range is invalid
      });
      // Split on commas/spaces and create links for each number
      const numbers = expanded.split(/[,\s]+/).filter((n: string) => n.trim() && /^\d+$/.test(n.trim()));
      const links = numbers.map((num: string) =>
        `<a href="#" class="citation-link text-primary hover:underline font-semibold" data-citation="${num.trim()}">${num.trim()}</a>`
      );
      return `[${links.join(', ')}]`;
    });
  }

  // Render markdown and then apply citation links
  function renderMarkdownWithCitations(text: string | null | undefined): string {
    if (!text) return '';
    // First render markdown, then add citation links
    const rendered = md.render(text);
    // Apply citation links to the rendered HTML
    return rendered.replace(/\[([\d,\s\-]+)\]/g, (match, nums) => {
      const expanded = nums.replace(/(\d+)\s*-\s*(\d+)/g, (_: string, start: string, end: string) => {
        const s = parseInt(start, 10);
        const e = parseInt(end, 10);
        if (e > s && e - s < 20) {
          return Array.from({ length: e - s + 1 }, (_, i) => s + i).join(',');
        }
        return `${start},${end}`;
      });
      const numbers = expanded.split(/[,\s]+/).filter((n: string) => n.trim() && /^\d+$/.test(n.trim()));
      const links = numbers.map((num: string) =>
        `<a href="#" class="citation-link text-primary hover:underline font-semibold" data-citation="${num.trim()}">${num.trim()}</a>`
      );
      return `[${links.join(', ')}]`;
    });
  }

  // Handle citation click - scroll to message
  function handleCitationClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.classList.contains('citation-link')) {
      event.preventDefault();
      const citationNum = target.getAttribute('data-citation');
      if (citationNum) {
        const messageEl = document.querySelector(`[data-message-index="${citationNum}"]`);
        if (messageEl) {
          messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight briefly
          messageEl.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            messageEl.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 2000);
        }
      }
    }
  }

  // Handle score click - scroll to and highlight score name in justification
  function handleScoreClick(scoreName: string) {
    const justificationEl = document.getElementById('judge-justification');
    if (!justificationEl) return;

    // Convert snake_case to various formats for searching
    const searchTerms = [
      scoreName,
      scoreName.replace(/_/g, ' '),
      scoreName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    ];

    // Check if a match looks like a score label (not just any occurrence of the word)
    function isScoreLabel(text: string, index: number, termLen: number, node: Text): boolean {
      const afterMatch = text.slice(index + termLen);
      const beforeMatch = text.slice(0, index);

      // Check if followed by colon, score pattern, parenthetical score, or N/10 format
      const followedByScorePattern = /^[\s]*[:(\[]/.test(afterMatch) || /^[\s]*\d+\/10/.test(afterMatch);

      // Check if preceded by bullet point or at start of line
      const afterBullet = /[-*•]\s*$/.test(beforeMatch) || /[\n\r]\s*[-*•]?\s*$/.test(beforeMatch);
      const atLineStart = index === 0 || /[\n\r]\s*$/.test(beforeMatch);

      // Check if parent element is bold/strong (common for score headers)
      const parent = node.parentElement;
      const inBoldElement = parent?.tagName === 'STRONG' || parent?.tagName === 'B';

      // Check if followed by score value pattern (e.g., ": 1", "(1)", "1/10")
      const followedByScoreValue = /^[\s]*[:(]\s*\d/.test(afterMatch);

      return followedByScorePattern || followedByScoreValue || afterBullet || (atLineStart && /^[\s]*:/.test(afterMatch)) || inBoldElement;
    }

    // Find the text node containing the score name as a label
    const walker = document.createTreeWalker(justificationEl, NodeFilter.SHOW_TEXT, null);
    let found = false;
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || '';
      for (const term of searchTerms) {
        const index = text.toLowerCase().indexOf(term.toLowerCase());
        if (index !== -1 && isScoreLabel(text, index, term.length, node)) {
          // Scroll the justification section into view
          justificationEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

          // Highlight the found text using a mark element
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + term.length);

          const mark = document.createElement('mark');
          mark.className = 'bg-primary/30 px-1 rounded transition-all duration-300';
          range.surroundContents(mark);

          // Add back-link after the mark
          const backLink = document.createElement('a');
          backLink.href = `#score-${scoreName}`;
          backLink.className = 'text-primary hover:underline ml-1 text-sm';
          backLink.textContent = '^';
          backLink.title = 'Back to score';
          backLink.onclick = (e) => {
            e.preventDefault();
            const scoreEl = document.getElementById(`score-${scoreName}`);
            if (scoreEl) {
              scoreEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              // Highlight the score badge briefly
              scoreEl.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
              setTimeout(() => {
                scoreEl.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
              }, 2000);
            }
          };
          mark.after(backLink);

          // Remove highlight and back-link after 5 seconds
          setTimeout(() => {
            const parent = mark.parentNode;
            if (parent) {
              parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
              backLink.remove();
              parent.normalize();
            }
          }, 5000);

          found = true;
          break;
        }
      }
      if (found) break;
    }
  }

  // Horizontal overflow detection for smart centering
  let scrollContainer = $state<HTMLDivElement | null>(null);
  let hasHorizontalOverflow = $state(false);

  function updateOverflowState() {
    if (!scrollContainer) {
      hasHorizontalOverflow = false;
      return;
    }
    hasHorizontalOverflow = scrollContainer.scrollWidth > scrollContainer.clientWidth + 4;
  }

  // Keep overflow state in sync
  $effect(() => {
    updateOverflowState();
  });

  $effect(() => {
    function onResize() {
      updateOverflowState();
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  // Ensure overflow state updates after DOM changes when container or columns change
  $effect(() => {
    // Capture dependencies so this runs when they change
    const container = scrollContainer;
    const numCols = conversationColumns.length;
    // Schedule after layout
    requestAnimationFrame(() => {
      updateOverflowState();
    });
  });

</script>

<div class="w-full">
  <!-- Loading State -->
  {#if loader.transcriptLoading}
    <div class="flex items-center justify-center p-8">
      <span class="loading loading-spinner loading-lg"></span>
      <span class="ml-4">Loading transcript...</span>
    </div>
  {/if}

  <!-- Error State -->
  {#if loader.transcriptError}
    <div class="alert alert-error max-w-6xl mx-auto m-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{loader.transcriptError}</span>
    </div>
  {/if}

  <!-- Loaded Content -->
  {#if loader.transcript}
    {@render transcriptContent()}
  {/if}
</div>

<!-- Transcript Content Snippet -->
{#snippet transcriptContent()}
  <!-- Metadata Section - Constrained width -->
  <div class="p-4 space-y-6">
    <!-- Header with metadata -->
    {@render transcriptHeader()}
    
    <!-- Conversation Section with controls -->
    {@render viewControls()}
  </div>

  <!-- Content Section - Full width -->
  {#if selectedView === 'raw'}
    {@render rawJsonView()}
  {:else}
    {@render conversationView()}
  {/if}
{/snippet}

<!-- Transcript Header Snippet -->
{#snippet transcriptHeader()}
  <div class="card bg-base-100 shadow-sm max-w-6xl mx-auto">
    <div class="card-body">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h1 class="text-2xl font-bold mb-2">
            {loader.transcript?.split} - {loader.transcript?.model}
          </h1>
          <p class="text-base-content/70">Transcript #{loader.transcript?.id}</p>
        </div>
      </div>

      <!-- Scores by Category -->
      <div class="mb-6 space-y-4">
        <h3 class="text-lg font-semibold">Scores</h3>
        {#each categorizeScores(loader.transcript?.scores || {}) as { category, label, items }}
          <div class="space-y-2">
            <h4 class="text-sm font-medium text-base-content/70">{label}</h4>
            <div class="flex flex-wrap gap-2">
              {#each items as [key, value]}
                <ScoreTooltip
                  id="score-{key}"
                  score={value}
                  scoreName={key}
                  description={loader.transcript?.scoreDescriptions?.[key]}
                  isPetriDefault={PETRI_DEFAULT_SCORES.has(key)}
                  onClick={handleScoreClick}
                />
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Share Online Status (admin mode) -->
      {#if adminMode.isAdminMode}
        <div class="mb-4">
          <h3 class="text-lg font-semibold mb-2">Sharing</h3>
          <ShareToggle
            filePath={filePath}
            shareOnline={loader.metadata?.shareOnline ?? false}
            onToggle={handleMetadataUpdate}
          />
        </div>
      {/if}

      <!-- Tags -->
      <div class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <h3 class="text-lg font-semibold">Tags</h3>
          {#if adminMode.isAdminMode && !isEditingTags}
            <button
              class="btn btn-ghost btn-xs"
              onclick={() => isEditingTags = true}
              title="Edit tags"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          {/if}
        </div>

        {#if adminMode.isAdminMode && isEditingTags}
          <!-- Tag Editor (admin mode) -->
          <TagEditor
            filePath={filePath}
            tags={loader.metadata?.tags || []}
            userTags={loader.metadata?.userTags || []}
            onSave={() => {
              isEditingTags = false;
              handleMetadataUpdate();
            }}
            onCancel={() => isEditingTags = false}
          />
        {:else}
          <!-- Display tags -->
          {@const allTags = [...(loader.metadata?.tags || []), ...(loader.metadata?.userTags || [])]}
          {#if allTags.length > 0}
            <div class="flex flex-wrap gap-2">
              {#each loader.metadata?.tags || [] as tag}
                <TagChip {tag} />
              {/each}
              {#each loader.metadata?.userTags || [] as tag}
                <TagChip {tag} isUserTag={true} />
              {/each}
            </div>
          {:else}
            <p class="text-base-content/50 text-sm">No tags</p>
          {/if}
        {/if}
      </div>

      <!-- Judge Summary -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="mb-4" onclick={handleCitationClick}>
        <h3 class="text-lg font-semibold mb-2">Judge Summary</h3>
        <p class="text-sm leading-relaxed whitespace-pre-wrap">{@html renderCitations(loader.transcript?.judgeSummary)}</p>
      </div>

      <!-- Judge Justification -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div id="judge-justification" class="mb-4" onclick={handleCitationClick}>
        <h3 class="text-lg font-semibold mb-2">Judge Justification</h3>
        <p class="text-sm leading-relaxed whitespace-pre-wrap">{@html renderCitations(loader.transcript?.justification)}</p>
      </div>

      <!-- Character Analysis (from independent scoring mode) -->
      {#if loader.transcript?.characterAnalysis}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="mb-4 p-4 bg-base-200 rounded-lg" onclick={handleCitationClick}>
          <h3 class="text-lg font-semibold mb-2">Character Analysis</h3>
          <div class="prose prose-sm max-w-none">{@html renderMarkdownWithCitations(loader.transcript.characterAnalysis)}</div>
        </div>
      {/if}

      <!-- System Prompt (Collapsible) -->
      {#if loader.transcript?.systemPrompt}
        <div class="collapse collapse-arrow bg-base-200">
          <input type="checkbox" bind:checked={showSystemPrompt} />
          <div class="collapse-title text-lg font-semibold">
            Agent System Prompt
          </div>
          <div class="collapse-content">
            <div class="bg-base-300 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap">
              {loader.transcript.systemPrompt}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

<!-- View Controls Snippet -->
{#snippet viewControls()}
  <div class="card bg-base-100 shadow-sm max-w-6xl mx-auto">
    <div class="card-body">
      <h2 class="text-xl font-bold mb-4">Conversation</h2>
      

      
      <!-- Tab Navigation -->
      <div class="tabs tabs-boxed justify-center mb-4">
        {#each availableViews as view}
          <button
            class="tab {selectedView === view ? 'tab-active' : ''}"
            onclick={() => selectedView = view}
          >
            {toTitleCase(view)}
          </button>
        {/each}
        <button
          class="tab {selectedView === 'raw' ? 'tab-active' : ''}"
          onclick={() => selectedView = 'raw'}
        >
          Raw JSON
        </button>
      </div>

      <!-- Additional Controls (only for conversation views) -->
      {#if selectedView !== 'raw'}
        <div class="flex justify-center mb-4 gap-6">
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text mr-2">Show API Failures</span>
              <input type="checkbox" class="toggle toggle-error" bind:checked={showApiFailures} />
            </label>
          </div>
          {#if conversationColumns.length > 1}
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text mr-2">Show Shared History</span>
                <input type="checkbox" class="toggle toggle-primary" bind:checked={showSharedHistory} />
              </label>
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Content will be rendered outside this card -->
    </div>
  </div>
{/snippet}

<!-- Raw JSON View Snippet -->
{#snippet rawJsonView()}
  <div class="w-full p-4">
    <div class="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-lg">Raw Event Data</h3>
        <span class="text-sm text-gray-600 dark:text-gray-400">
          {loader.transcript?.transcript?.events?.length || 0} events
        </span>
      </div>
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-4">
        <pre class="text-xs overflow-auto min-h-[70vh] whitespace-pre-wrap font-mono">
          {JSON.stringify(loader.transcript?.transcript, null, 2)}
        </pre>
      </div>
    </div>
  </div>
{/snippet}

<!-- Conversation View Snippet -->
{#snippet conversationView()}
  {#if conversationColumns.length === 0}
    <div class="p-4">
      <div class="card bg-base-200 p-8 text-center max-w-6xl mx-auto">
        <p class="text-gray-500">No conversation data available for the selected view.</p>
      </div>
    </div>
  {:else if selectedView === 'combined'}
    <!-- Combined view: vertical stack for better readability -->
    <div class="w-full px-6 space-y-8">
      {#each conversationColumns as column, columnIndex}
        <div class="max-w-4xl mx-auto">
          {@render conversationColumn(column, columnIndex)}
        </div>
      {/each}
    </div>
  {:else}
    <!-- Other views: horizontal layout with scroll -->
    <div class="relative w-full">
      <div
        class="overflow-x-auto overscroll-x-contain scroll-smooth"
        bind:this={scrollContainer}
      >
        <div class="flex gap-6 snap-x snap-mandatory px-6" style={hasHorizontalOverflow ? '' : 'justify-content: center;'}>
          {#each conversationColumns as column, columnIndex}
            <div class="snap-start w-[clamp(350px,calc(100vw-4rem),900px)] max-w-full flex-none">
              {@render conversationColumn(column, columnIndex)}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
{/snippet}

<!-- Conversation Column Snippet -->
{#snippet conversationColumn(column: ConversationColumn, columnIndex: number)}
  <div class="space-y-4">
    <!-- Column Header -->
    <div class="card bg-base-300 p-3">
      <h3 class="font-semibold text-sm">
        {column.title}
      </h3>
      <p class="text-xs text-gray-500">{column.messages.length} messages</p>
    </div>

    <!-- Messages -->
    <div class="space-y-2">
      {#each column.messages as message, messageIndex}
        {@const isVisible = shouldShowSharedMessage(message, messageIndex, column.messages)}
        <MessageCard
          {message}
          {messageIndex}
          {columnIndex}
          isOpen={isMessageOpen(message.id || '')}
          {isVisible}
          onToggle={toggleMessage}
          onCopy={onCopyAction}
        />
      {/each}
    </div>
  </div>
{/snippet}