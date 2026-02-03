<script lang="ts">
  /**
   * Sticky navigation sidebar for transcript pages
   * Shows icon links to jump to different sections
   */

  interface NavItem {
    id: string;
    label: string;
  }

  interface Props {
    hasCharacterAnalysis?: boolean;
    hasSeedPrompt?: boolean;
    hasSubJudgeResults?: boolean;
  }

  let {
    hasCharacterAnalysis = false,
    hasSeedPrompt = false,
    hasSubJudgeResults = false,
  }: Props = $props();

  // Navigation items (filter reactively based on props)
  let visibleItems = $derived.by(() => {
    const items: NavItem[] = [
      { id: 'top', label: 'Top' },
      { id: 'section-scores', label: 'Scores' },
    ];

    if (hasSeedPrompt) {
      items.push({ id: 'section-seed-prompt', label: 'Seed Prompt' });
    }

    items.push({ id: 'section-tags', label: 'Tags' });
    items.push({ id: 'section-judge-summary', label: 'Summary' });

    if (hasSubJudgeResults) {
      items.push({ id: 'section-dimensions', label: 'Dimensions' });
    }

    if (hasCharacterAnalysis) {
      items.push({ id: 'section-character', label: 'Character' });
    }

    items.push({ id: 'section-transcript', label: 'Transcript' });

    return items;
  });

  function scrollToSection(id: string) {
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
</script>

<nav class="fixed left-0 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-0.5 py-2 px-1 bg-base-200/95 backdrop-blur-sm rounded-r-lg shadow-lg border border-base-300 border-l-0">
  {#each visibleItems as item}
    <button
      class="px-2 py-1.5 text-xs font-medium text-left rounded hover:bg-primary/20 hover:text-primary transition-colors whitespace-nowrap"
      onclick={() => scrollToSection(item.id)}
    >
      {item.label}
    </button>
  {/each}
</nav>
