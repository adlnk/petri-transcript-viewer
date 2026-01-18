<script lang="ts">
	interface Props {
		filePath: string;
		shareOnline: boolean;
		onToggle?: (newValue: boolean) => void;
		compact?: boolean;  // For table view (icon only)
	}

	let { filePath, shareOnline, onToggle, compact = false }: Props = $props();

	let saving = $state(false);
	let localValue = $state(shareOnline);

	// Sync local value when prop changes
	$effect(() => {
		localValue = shareOnline;
	});

	async function handleToggle() {
		const newValue = !localValue;
		saving = true;

		try {
			const response = await fetch('/api/transcripts/metadata', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath,
					share_online: newValue
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to update');
			}

			localValue = newValue;
			if (onToggle) {
				onToggle(newValue);
			}
		} catch (err) {
			console.error('Failed to toggle share status:', err);
			// Revert on error
		} finally {
			saving = false;
		}
	}
</script>

{#if compact}
	<!-- Compact mode: icon button for table view -->
	<button
		type="button"
		class="btn btn-ghost btn-xs p-1"
		onclick={handleToggle}
		disabled={saving}
		title={localValue ? 'Shared online (click to make local-only)' : 'Local only (click to share online)'}
	>
		{#if saving}
			<span class="loading loading-spinner loading-xs"></span>
		{:else if localValue}
			<!-- Shared: solid globe icon -->
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
			</svg>
		{:else}
			<!-- Local only: grayed globe with slash -->
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4l16 16" class="text-base-content/50" />
			</svg>
		{/if}
	</button>
{:else}
	<!-- Full mode: toggle with label for detail view -->
	<div class="flex items-center gap-3">
		<label class="cursor-pointer flex items-center gap-2">
			<input
				type="checkbox"
				class="toggle toggle-sm toggle-success"
				checked={localValue}
				onchange={handleToggle}
				disabled={saving}
			/>
			<span class="text-sm">
				{#if saving}
					Saving...
				{:else if localValue}
					Shared online
				{:else}
					Local only
				{/if}
			</span>
		</label>
		{#if localValue}
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
			</svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
			</svg>
		{/if}
	</div>
{/if}
