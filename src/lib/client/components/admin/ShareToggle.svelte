<script lang="ts">
	import { invalidateListDataCache } from '$lib/shared/services/transcript-data.svelte';

	interface Props {
		filePath: string;
		shareOnline: boolean;
		onToggle?: (newValue: boolean) => void | Promise<void>;
		compact?: boolean;  // For table view (icon only)
	}

	let { filePath, shareOnline, onToggle, compact = false }: Props = $props();

	let saving = $state(false);

	// Track pending value during async save operations (optimistic UI)
	let pendingValue = $state<boolean | null>(null);

	// Display value: show pending value if we have one, otherwise use prop
	// This pattern avoids the "state_referenced_locally" warning
	let localValue = $derived(pendingValue !== null ? pendingValue : shareOnline);

	async function handleToggle(e?: Event) {
		// Stop propagation and prevent default to avoid row navigation
		e?.stopPropagation();
		e?.preventDefault();

		const newValue = !localValue;
		console.log('[ShareToggle] Toggle clicked:', { currentValue: localValue, newValue, filePath });
		saving = true;
		pendingValue = newValue;  // Show optimistic update immediately

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

			console.log('[ShareToggle] API success');

			// Call onToggle and wait for reload to complete (if handler provided)
			if (onToggle) {
				await onToggle(newValue);
				// After reload completes, prop should match our pending value, so clear it
				console.log('[ShareToggle] Reload complete, clearing pending value');
				pendingValue = null;
			} else {
				// No onToggle (table view) - invalidate list cache so it refreshes on next load
				// Keep pendingValue to maintain correct display for this component instance
				invalidateListDataCache();
			}
		} catch (err) {
			console.error('[ShareToggle] Failed to toggle share status:', err);
			// Revert on error - clear pending to show prop value
			pendingValue = null;
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
		onclick={(e) => handleToggle(e)}
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
				onchange={(e) => handleToggle(e)}
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
			<!-- Local only: grayed globe with slash -->
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4l16 16" class="text-base-content/50" />
			</svg>
		{/if}
	</div>
{/if}
