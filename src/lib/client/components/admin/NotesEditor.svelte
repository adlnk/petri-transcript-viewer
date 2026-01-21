<script lang="ts">
	interface Props {
		filePath: string;
		notes: string;
		onSave: () => void | Promise<void>;
		onCancel: () => void;
	}

	let { filePath, notes, onSave, onCancel }: Props = $props();

	// Local state for editing
	let editedNotes = $state(notes);
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Check if there are changes
	let hasChanges = $derived(editedNotes !== notes);

	async function handleSave() {
		saving = true;
		error = null;

		try {
			const response = await fetch('/api/transcripts/metadata', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath,
					user_notes: editedNotes
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to save');
			}

			// Call onSave callback - parent will close editor and use {#key} to force remount
			await onSave();
		} catch (err: any) {
			error = err.message || 'Failed to save notes';
			saving = false;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		// Ctrl/Cmd+Enter to save
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
