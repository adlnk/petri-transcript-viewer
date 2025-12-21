<script lang="ts">
  interface Props {
    column: any; // TanStack Column instance
    allModels: string[];
  }

  // Filter value format: { include: string[], exclude: string[] }
  export interface ModelFilterValue {
    include: string[];
    exclude: string[];
  }

  let { column, allModels = [] }: Props = $props();

  // Parse filter value - we only use exclude for checkbox mode
  let filterValue = $derived.by(() => {
    const v = column?.getFilterValue?.();
    if (v && typeof v === 'object' && ('include' in v || 'exclude' in v)) {
      return v as ModelFilterValue;
    }
    if (Array.isArray(v)) {
      return { include: v as string[], exclude: [] };
    }
    return { include: [], exclude: [] };
  });

  let excludedModels = $derived(filterValue.exclude || []);

  // A model is checked if it's NOT excluded
  function isModelChecked(model: string): boolean {
    return !excludedModels.includes(model);
  }

  function toggleModel(model: string) {
    if (!column) return;
    const currentlyExcluded = excludedModels.includes(model);
    let newExclude: string[];

    if (currentlyExcluded) {
      // Re-enable this model (remove from exclude)
      newExclude = excludedModels.filter(m => m !== model);
    } else {
      // Disable this model (add to exclude)
      newExclude = [...excludedModels, model];
    }

    if (newExclude.length === 0) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue({ include: [], exclude: newExclude });
    }
  }

  function selectAll() {
    column?.setFilterValue?.(undefined);
  }

  function selectNone() {
    if (!column || allModels.length === 0) return;
    column.setFilterValue({ include: [], exclude: [...allModels] });
  }

  // Shorten model name for display (remove date suffix like -20250514)
  function shortenModelName(model: string): string {
    return model.replace(/-\d{8}$/, '');
  }

  let hasFilters = $derived(excludedModels.length > 0);
  let visibleCount = $derived(allModels.length - excludedModels.length);
</script>

<div class="flex items-center gap-2 w-full">
  <span class="text-sm font-medium whitespace-nowrap">Model</span>
  <div class="flex-1 min-w-0">
    <span class="text-xs text-base-content/50">
      {#if hasFilters}
        {visibleCount}/{allModels.length} shown
      {:else}
        All models
      {/if}
    </span>
  </div>

  <!-- Dropdown with checkboxes -->
  <div class="dropdown dropdown-end">
    <div tabindex="0" role="button" class="btn btn-xs" aria-haspopup="listbox">
      Filter {#if hasFilters}<span class="badge badge-xs badge-accent ml-1">{excludedModels.length} hidden</span>{/if}
    </div>
    <div tabindex="-1" class="dropdown-content z-[9999] p-3 shadow bg-base-100 rounded-box border border-base-300">
      <!-- Select all/none buttons -->
      <div class="flex gap-2 mb-2 pb-2 border-b border-base-200">
        <button class="btn btn-ghost btn-xs" onclick={selectAll}>All</button>
        <button class="btn btn-ghost btn-xs" onclick={selectNone}>None</button>
        {#if hasFilters}
          <button class="btn btn-ghost btn-xs text-error ml-auto" onclick={selectAll}>Reset</button>
        {/if}
      </div>

      {#if allModels.length === 0}
        <div class="text-xs text-base-content/50 px-2 py-1">No models in data</div>
      {:else}
        <div class="flex flex-col gap-1">
          {#each allModels as model}
            <label class="flex items-center gap-2 cursor-pointer hover:bg-base-200 rounded px-2 py-1">
              <input
                type="checkbox"
                class="checkbox checkbox-sm"
                checked={isModelChecked(model)}
                onchange={() => toggleModel(model)}
              />
              <span class="text-sm whitespace-nowrap" title={model}>{shortenModelName(model)}</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>
