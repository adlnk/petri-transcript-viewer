<script lang="ts">
  import { FlexRender } from '@tanstack/svelte-table';
  import { getScoreColor } from '$lib/shared/score-utils';
  import type { TableRow, RowDensity } from '$lib/shared/types';
  import { debugLog } from '$lib/client/utils/debug';
  import { selection } from '$lib/client/stores/selection.svelte';
  import ShareToggle from '$lib/client/components/admin/ShareToggle.svelte';

  // Get badge class for namespaced tags
  function getTagBadgeClass(tag: string): string {
    if (tag.startsWith('strategy:')) {
      return 'badge-primary badge-outline';  // Blue for strategy
    } else if (tag.startsWith('target:')) {
      return 'badge-warning badge-outline';  // Yellow/orange for target behavior
    } else if (tag.startsWith('wave')) {
      return 'badge-info badge-outline';  // Cyan for wave markers
    } else {
      return 'badge-outline';  // Default gray for other tags
    }
  }

  // Format tag for display (optionally strip namespace prefix)
  function formatTagDisplay(tag: string): string {
    // Keep full tag for now - namespace prefixes are informative
    return tag;
  }

  interface Props {
    cell: any;
    row: any;
    rowData: TableRow; // Using unified TableRow type
    cellWidth: number;
    isFolder: boolean;
    transcriptUrl?: string | null;
    isGridCell?: boolean;
    virtualItemSize?: number;
    virtualItemTransform?: string;
    rowDensity?: RowDensity;
  }

  let {
    cell,
    row,
    rowData,
    cellWidth,
    isFolder,
    transcriptUrl = null,
    isGridCell = false,
    virtualItemSize = undefined,
    virtualItemTransform = undefined,
    rowDensity = 'normal'
  }: Props = $props();

  // Throttling to prevent rapid multiple clicks
  let isToggling = $state(false);

  // Density-based CSS classes
  let densityClasses = $derived({
    compact: 'whitespace-nowrap overflow-hidden text-ellipsis',
    normal: 'line-clamp-2',
    expanded: 'whitespace-normal',
  }[rowDensity]);

</script>

{#if cell.column.id === 'id' && isFolder}
  <!-- Folder row content - this is used when the folder row spans all columns -->
  <div class="flex items-center gap-2">
    <button 
      class="flex items-center gap-1 hover:text-primary"
      disabled={isToggling}
      onclick={(event) => {
        // Prevent event bubbling and double-click issues
        event.preventDefault();
        event.stopPropagation();

        const wasExpanded = row.getIsExpanded();
        const canExpand = row.getCanExpand();

        debugLog('🔄 [DEBUG] Folder toggle clicked:', {
          id: row.id,
          depth: row.depth,
          name: rowData.name,
          wasExpanded,
          canExpand,
          subRowsCount: rowData.subRows?.length || 0
        });

        if (canExpand && !isToggling) {
          isToggling = true; // Prevent rapid clicks

          try {
            const toggleHandler = row.getToggleExpandedHandler();
            if (toggleHandler) {
              toggleHandler();
              debugLog('🔄 [DEBUG] Toggle handler called successfully');

              // Use setTimeout to check state after React/Svelte update cycle
              setTimeout(() => {
                const newExpanded = row.getIsExpanded();
                debugLog('🔄 [DEBUG] Final toggle state:', {
                  wasExpanded,
                  newExpanded,
                  changed: wasExpanded !== newExpanded
                });
                isToggling = false; // Re-enable clicking
              }, 100); // Small delay to prevent rapid clicking
            } else {
              console.error('❌ Toggle handler is null!');
              isToggling = false;
            }
          } catch (error) {
            console.error('❌ Error calling toggle handler:', error);
            isToggling = false;
          }
        } else if (isToggling) {
          debugLog('⏳ [DEBUG] Toggle in progress, ignoring click');
        } else {
          console.error('❌ Row cannot expand:', { canExpand, hasSubRows: !!rowData.subRows?.length });
        }
      }}
    >
      <svg 
        class="w-4 h-4 transition-transform {row.getIsExpanded() ? 'rotate-90' : ''} flex-shrink-0"
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
        data-row-id={row.id}
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
      <svg class="w-4 h-4 text-yellow-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
      </svg>
      <span class="break-words"><FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} /></span>
    </button>
  </div>
{:else if !isFolder}
  <!-- Data row cells -->
  {@const cellElement = isGridCell ? 'div' : 'td'}
  {@const baseClasses = isGridCell ? 'px-3 py-3 overflow-x-auto overflow-y-hidden table-cell-no-scrollbar border-b border-base-200 flex items-center min-h-[60px]' : 'px-3 py-3 overflow-x-auto overflow-y-hidden table-cell-no-scrollbar'}
  {@const cellStyle = isGridCell ?
    `${virtualItemSize ? `height: ${virtualItemSize}px;` : ''} ${virtualItemTransform ? `transform: ${virtualItemTransform};` : ''}` :
    `width: ${cellWidth}px; min-width: ${cellWidth}px;`}

  {#if cell.column.id === 'select'}
    <!-- Selection checkbox (admin mode) -->
    {@const filePath = rowData.originalTranscript?._filePath || ''}
    <svelte:element
      this={cellElement}
      class="{baseClasses} justify-center"
      style="{cellStyle}"
      onclick={(e: Event) => e.preventDefault()}
    >
      <input
        type="checkbox"
        class="checkbox checkbox-sm"
        checked={selection.paths.has(filePath)}
        onclick={(e: Event) => {
          e.stopPropagation();
          selection.toggle(filePath);
        }}
      />
    </svelte:element>
  {:else if cell.column.id === 'share'}
    <!-- Share toggle (admin mode) -->
    {@const filePath = rowData.originalTranscript?._filePath || ''}
    {@const shareOnline = rowData.shareOnline ?? false}
    <svelte:element
      this={cellElement}
      class="{baseClasses} justify-center"
      style="{cellStyle}"
      onclick={(e: Event) => {
        e.stopPropagation();
        e.preventDefault();  // Prevent <a> tag navigation
      }}
    >
      <ShareToggle {filePath} {shareOnline} compact={true} />
    </svelte:element>
  {:else if cell.column.id === 'id'}
    <svelte:element
      this={cellElement}
      class="font-mono text-sm {baseClasses}"
      style="{cellStyle} {!isFolder ? `padding-left: ${(row.depth * 20) + 12}px;` : ''}"
    >
      <!-- Remove individual cell links since entire row is now clickable -->
      <span class="{densityClasses}">
        <FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
      </span>
    </svelte:element>
  {:else if cell.column.id === 'summary'}
    <svelte:element
      this={cellElement}
      class="{baseClasses}"
      style="{cellStyle}"
    >
      <span class="text-sm text-base-content/80 {densityClasses}">
        <FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
      </span>
    </svelte:element>
  {:else if cell.column.id === 'tags'}
    {@const tagFilterValue = cell.column.getFilterValue?.()}
    {@const filteredOutTags = (() => {
      // Get tags that are being filtered (include or exclude) - hide them from display
      if (tagFilterValue && typeof tagFilterValue === 'object') {
        const include = (tagFilterValue as any).include || [];
        const exclude = (tagFilterValue as any).exclude || [];
        return new Set([...include, ...exclude]);
      }
      if (Array.isArray(tagFilterValue)) {
        return new Set(tagFilterValue);
      }
      return new Set<string>();
    })()}
    {@const visibleTags = rowData.tags?.filter(t => !filteredOutTags.has(t)) || []}
    {@const visibleUserTags = rowData.userTags?.filter(t => !filteredOutTags.has(t)) || []}
    {@const totalVisibleTags = visibleTags.length + visibleUserTags.length}
    {@const totalTags = (rowData.tags?.length || 0) + (rowData.userTags?.length || 0)}
    <svelte:element
      this={cellElement}
      class="{baseClasses}"
      style="{cellStyle}"
    >
      {#if totalVisibleTags > 0}
        <div class="flex gap-1 {rowDensity === 'compact' ? 'flex-nowrap overflow-hidden' : 'flex-wrap'}">
          {#each visibleTags as tag}
            <span class="badge {getTagBadgeClass(tag)} badge-sm flex-shrink-0">{formatTagDisplay(tag)}</span>
          {/each}
          {#each visibleUserTags as tag}
            <!-- User tags with dashed border style -->
            <span class="badge badge-sm flex-shrink-0 border-dashed border-2 {getTagBadgeClass(tag)}" title="User-added tag">{formatTagDisplay(tag)}</span>
          {/each}
        </div>
      {:else if totalTags > 0}
        <!-- All tags are filtered, show indicator -->
        <span class="text-base-content/40 text-xs italic">({totalTags} filtered)</span>
      {:else}
        <span class="text-base-content/50">—</span>
      {/if}
    </svelte:element>
  {:else if cell.column.id.startsWith('score_') || cell.column.id === 'concerningScore'}
    {@const cellValue = cell.getValue()}
    <svelte:element 
      this={cellElement} 
      class="text-center {baseClasses}" 
      style="{cellStyle}"
    >
      {#if cellValue !== null && cellValue !== undefined && cellValue !== '—'}
        {@const score = typeof cellValue === 'string' ? parseFloat(cellValue) : cellValue}
        {#if !isNaN(score)}
          <span class="badge {getScoreColor(score)} badge-sm font-mono break-words">
            {score}/10
          </span>
        {:else}
          <span class="text-base-content/50 break-words">—</span>
        {/if}
      {:else}
        <span class="text-base-content/50 break-words">—</span>
      {/if}
    </svelte:element>
  {:else}
    <svelte:element
      this={cellElement}
      class="{baseClasses}"
      style="{cellStyle}"
    >
      <span class="{densityClasses}">
        <FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
      </span>
    </svelte:element>
  {/if}
{/if}