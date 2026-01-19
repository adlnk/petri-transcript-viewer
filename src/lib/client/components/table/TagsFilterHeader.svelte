<script lang="ts">
  import { portal } from '$lib/client/actions/portal';

  interface Props {
    column: any; // TanStack Column instance
    allTags: string[];
  }

  // Filter value format: { include: string[], exclude: string[] }
  export interface TagFilterValue {
    include: string[];
    exclude: string[];
  }

  let { column, allTags = [] }: Props = $props();

  // Dropdown state
  let isOpen = $state(false);
  let buttonElement: HTMLButtonElement | null = $state(null);
  let dropdownElement: HTMLDivElement | null = $state(null);
  let dropdownPosition = $state({ top: 0, left: 0 });
  let searchQuery = $state('');
  let searchInput: HTMLInputElement | null = $state(null);

  // Parse filter value
  let filterValue = $derived.by(() => {
    const v = column?.getFilterValue?.();
    if (v && typeof v === 'object' && ('include' in v || 'exclude' in v)) {
      return v as TagFilterValue;
    }
    // Legacy: plain array means include
    if (Array.isArray(v)) {
      return { include: v as string[], exclude: [] };
    }
    return { include: [], exclude: [] };
  });

  let includedTags = $derived(filterValue.include || []);
  let excludedTags = $derived(filterValue.exclude || []);

  function updateFilter(include: string[], exclude: string[]) {
    if (!column) return;
    if (include.length === 0 && exclude.length === 0) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue({ include, exclude });
    }
  }

  function includeTag(tag: string) {
    const newInclude = Array.from(new Set([...includedTags, tag]));
    const newExclude = excludedTags.filter(t => t !== tag);
    updateFilter(newInclude, newExclude);
  }

  function excludeTag(tag: string) {
    const newExclude = Array.from(new Set([...excludedTags, tag]));
    const newInclude = includedTags.filter(t => t !== tag);
    updateFilter(newInclude, newExclude);
  }

  function removeTag(tag: string) {
    const newInclude = includedTags.filter(t => t !== tag);
    const newExclude = excludedTags.filter(t => t !== tag);
    updateFilter(newInclude, newExclude);
  }

  function clearAll() {
    column?.setFilterValue?.(undefined);
  }

  // Get state of a tag: 'include', 'exclude', or 'none'
  function getTagState(tag: string): 'include' | 'exclude' | 'none' {
    if (includedTags.includes(tag)) return 'include';
    if (excludedTags.includes(tag)) return 'exclude';
    return 'none';
  }

  let hasFilters = $derived(includedTags.length > 0 || excludedTags.length > 0);

  // Filter tags by search query
  let filteredTags = $derived.by(() => {
    if (!searchQuery.trim()) return allTags;
    const query = searchQuery.toLowerCase();
    return allTags.filter(tag => tag.toLowerCase().includes(query));
  });

  // Group tags by namespace for organized display
  let groupedTags = $derived.by(() => {
    const groups: Record<string, string[]> = {
      'strategy': [],
      'target': [],
      'wave': [],
      'other': [],
    };

    for (const tag of filteredTags) {
      if (tag.startsWith('strategy:')) {
        groups['strategy'].push(tag);
      } else if (tag.startsWith('target:')) {
        groups['target'].push(tag);
      } else if (tag.startsWith('wave')) {
        groups['wave'].push(tag);
      } else {
        groups['other'].push(tag);
      }
    }

    // Filter out empty groups and sort each group
    return Object.entries(groups)
      .filter(([_, tags]) => tags.length > 0)
      .map(([name, tags]) => ({ name, tags: tags.sort() }));
  });

  // Get display name for group
  function getGroupDisplayName(name: string): string {
    switch (name) {
      case 'strategy': return 'Strategy';
      case 'target': return 'Target Behavior';
      case 'wave': return 'Wave';
      case 'other': return 'Other';
      default: return name;
    }
  }

  function toggleDropdown() {
    if (!isOpen && buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      dropdownPosition = {
        top: rect.bottom + 4,
        left: rect.right
      };
      searchQuery = '';  // Clear search when opening
      // Focus search input after dropdown renders
      setTimeout(() => searchInput?.focus(), 0);
    }
    isOpen = !isOpen;
  }

  function handleClickOutside(event: MouseEvent) {
    if (!isOpen) return;
    const target = event.target as Node;
    if (buttonElement?.contains(target) || dropdownElement?.contains(target)) return;
    isOpen = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      isOpen = false;
    }
  }
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="flex items-center gap-2 w-full">
  <span class="text-sm font-medium whitespace-nowrap">Tags</span>
  <div class="flex-1 min-w-0">
    <!-- Active tag filters -->
    <div class="flex flex-wrap gap-1">
      {#each includedTags as tag}
        <span class="badge badge-success badge-outline gap-1 text-xs">
          <span>+{tag}</span>
          <button class="hover:text-error" aria-label="Remove filter" onclick={() => removeTag(tag)}>✕</button>
        </span>
      {/each}
      {#each excludedTags as tag}
        <span class="badge badge-error badge-outline gap-1 text-xs">
          <span>-{tag}</span>
          <button class="hover:text-base-content" aria-label="Remove filter" onclick={() => removeTag(tag)}>✕</button>
        </span>
      {/each}
      {#if !hasFilters}
        <span class="text-xs text-base-content/50">No filter</span>
      {/if}
    </div>
  </div>

  <!-- Filter button -->
  <button
    bind:this={buttonElement}
    class="btn btn-xs"
    onclick={toggleDropdown}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
  >
    Filter {#if hasFilters}<span class="badge badge-xs badge-accent ml-1">{includedTags.length + excludedTags.length}</span>{/if}
  </button>
</div>

<!-- Fixed-position dropdown (portaled to body for proper z-index) -->
{#if isOpen}
  <div
    bind:this={dropdownElement}
    use:portal
    class="fixed z-[9999] shadow-lg bg-base-100 rounded-box border border-base-300 w-72 flex flex-col"
    style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; transform: translateX(-100%); max-height: 320px;"
  >
    <!-- Search input (sticky at top) -->
    <div class="p-2 border-b border-base-200 sticky top-0 bg-base-100">
      <input
        bind:this={searchInput}
        type="text"
        placeholder="Search tags..."
        class="input input-sm input-bordered w-full"
        bind:value={searchQuery}
      />
    </div>

    <!-- Scrollable content -->
    <div class="p-2 overflow-auto flex-1">
      {#if hasFilters}
        <div class="mb-1 pb-1 border-b border-base-200">
          <button class="btn btn-ghost btn-xs w-full text-error" onclick={() => clearAll()}>
            Reset all tag filters
          </button>
        </div>
      {/if}
      {#if allTags.length === 0}
        <div class="text-xs text-base-content/50 px-2 py-1">No tags in data</div>
      {:else if filteredTags.length === 0}
        <div class="text-xs text-base-content/50 px-2 py-1">No tags match "{searchQuery}"</div>
      {:else}
        {#each groupedTags as group}
          <div class="mb-2">
            <div class="text-xs font-semibold text-base-content/60 px-1 mb-1 uppercase tracking-wide">
              {getGroupDisplayName(group.name)}
            </div>
            {#each group.tags as tag}
              {@const state = getTagState(tag)}
              {@const displayTag = tag.includes(':') ? tag.split(':')[1] : tag}
              <div class="flex w-full gap-1 p-1 items-center hover:bg-base-200 rounded">
                <span class="flex-1 text-sm truncate" title={tag}>{displayTag}</span>
                <button
                  class="btn btn-xs {state === 'include' ? 'btn-success' : 'btn-ghost'}"
                  title="Include: show only rows with this tag"
                  onclick={() => state === 'include' ? removeTag(tag) : includeTag(tag)}
                >+</button>
                <button
                  class="btn btn-xs {state === 'exclude' ? 'btn-error' : 'btn-ghost'}"
                  title="Exclude: hide rows with this tag"
                  onclick={() => state === 'exclude' ? removeTag(tag) : excludeTag(tag)}
                >-</button>
              </div>
            {/each}
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}
