<script lang="ts">
	import { onMount } from 'svelte';
	import { setUserNotes, getAnnotation } from '$lib/client/stores/annotation-store';
	import { reviewerStore } from '$lib/client/stores/reviewer.svelte';

	interface Props {
		filePath: string;
		bundledNotes: string; // Notes from bundled transcript
		onSave: () => void | Promise<void>;
		onCancel: () => void;
	}

	let { filePath, bundledNotes, onSave, onCancel }: Props = $props();

	// Local state for editing
	let editedNotes = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let originalNotes = $state('');

	// Load existing notes from IndexedDB on mount
	onMount(async () => {
		const annotation = await getAnnotation(filePath);
		// Start with annotation notes if any, otherwise bundled notes
		editedNotes = annotation?.userNotes ?? bundledNotes;
		originalNotes = editedNotes;
	});

	// Check if there are changes
	let hasChanges = $derived(editedNotes !== originalNotes);

	async function handleSave() {
		if (!reviewerStore.reviewerName) {
			error = 'Reviewer name not set';
			return;
		}

		saving = true;
		error = null;

		try {
			await setUserNotes(filePath, reviewerStore.reviewerName, editedNotes);
			await onSave();
		} catch (err: any) {
			error = err.message || 'Failed to save notes';
			saving = false;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			if (hasChanges) {
				handleSave();
			}
		} else if (e.key === 'Escape') {
			onCancel();
		}
	}
</script>

<div class="space-y-3">
	<textarea
		class="textarea textarea-bordered w-full h-32 font-mono text-sm"
		placeholder="Add notes about this transcript..."
		bind:value={editedNotes}
		onkeydown={handleKeyDown}
	></textarea>

	<p class="text-xs text-base-content/50">
		Ctrl+Enter to save, Escape to cancel
	</p>

	<!-- Error display -->
	{#if error}
		<div class="text-sm text-error">{error}</div>
	{/if}

	<!-- Actions -->
	<div class="flex justify-end gap-2">
		<button type="button" class="btn btn-sm btn-ghost" onclick={onCancel}>
			Cancel
		</button>
		<button
			type="button"
			class="btn btn-sm btn-primary"
			onclick={handleSave}
			disabled={saving || !hasChanges}
		>
			{#if saving}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			Save
		</button>
	</div>
</div>
