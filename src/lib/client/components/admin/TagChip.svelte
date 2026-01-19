<script lang="ts">
	interface Props {
		tag: string;
		isUserTag?: boolean;
		removable?: boolean;
		onRemove?: (tag: string) => void;
	}

	let { tag, isUserTag = false, removable = false, onRemove }: Props = $props();

	function handleRemove() {
		if (onRemove) {
			onRemove(tag);
		}
	}

	// Determine tag type for styling
	function getTagType(tag: string): 'strategy' | 'target' | 'wave' | 'other' {
		if (tag.startsWith('strategy:')) return 'strategy';
		if (tag.startsWith('target:')) return 'target';
		if (tag.match(/^wave\d+$/)) return 'wave';
		return 'other';
	}

	let tagType = $derived(getTagType(tag));
</script>

<span
	class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
		{tagType === 'strategy' ? 'bg-primary/20 text-primary' : ''}
		{tagType === 'target' ? 'bg-secondary/20 text-secondary' : ''}
		{tagType === 'wave' ? 'bg-accent/20 text-accent' : ''}
		{tagType === 'other' ? 'bg-base-300 text-base-content' : ''}
		{isUserTag ? 'border border-dashed border-current/30' : ''}"
	title={isUserTag ? 'User-added tag' : tag}
>
	{#if isUserTag}
		<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
		</svg>
	{/if}
	<span class="truncate max-w-32">{tag}</span>
	{#if removable}
		<button
			type="button"
			class="hover:bg-base-content/20 rounded-full p-0.5 -mr-1 transition-colors"
			onclick={handleRemove}
			title="Remove tag"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	{/if}
</span>
