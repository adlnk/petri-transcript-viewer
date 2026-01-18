<script lang="ts">
	import { selection } from '$lib/client/stores/selection.svelte';
	import type { TagsResponse } from '$lib/shared/types';
	import { onMount } from 'svelte';

	interface Props {
		onUpdate?: () => void;  // Called after bulk operations to refresh data
	}

	let { onUpdate }: Props = $props();

	// UI state
	let showTagInput = $state(false);
	let tagInputValue = $state('');
	let tagAction = $state<'add' | 'remove'>('add');
	let availableTags = $state<string[]>([]);
	let saving = $state(false);
	let error = $state<string | null>(null);

	// Load available tags
	onMount(async () => {
		try {
			const response = await fetch('/api/tags');
			if (response.ok) {
				const data: TagsResponse = await response.json();
				availableTags = [...new Set([...data.predefined, ...data.existing])].sort();
			}
		} catch (err) {
			console.warn('Failed to load tags:', err);
		}
	});

	// Filtered suggestions
	let suggestions = $derived.by(() => {
		if (!tagInputValue.trim()) return [];
		const query = tagInputValue.toLowerCase();
		return availableTags
			.filter(tag => tag.toLowerCase().includes(query))
			.slice(0, 8);
	});

	async function handleTagAction(tag?: string) {
		const tagToUse = tag || tagInputValue.trim();
		if (!tagToUse) return;

		saving = true;
		error = null;

		try {
			const body: any = {
				filePaths: selection.getSelectedPaths()
			};

			if (tagAction === 'add') {
				body.add_tags = [tagToUse];
			} else {
				body.remove_tags = [tagToUse];
			}

			const response = await fetch('/api/transcripts/bulk-metadata', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.message || `${data.failCount} transcripts failed to update`);
			}

			// Reset input
			tagInputValue = '';
			showTagInput = false;

			// Refresh data
			if (onUpdate) onUpdate();

		} catch (err: any) {
			error = err.message || 'Failed to update tags';
		} finally {
			saving = false;
		}
	}

	async function handleShareAction(shareOnline: boolean) {
		saving = true;
		error = null;

		try {
			const response = await fetch('/api/transcripts/bulk-metadata', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePaths: selection.getSelectedPaths(),
					share_online: shareOnline
				})
			});

			const data = await response.json();

			if (!response.ok || !data.success) {
				throw new Error(data.message || `${data.failCount} transcripts failed to update`);
			}

			// Refresh data
			if (onUpdate) onUpdate();

		} catch (err: any) {
			error = err.message || 'Failed to update share status';
		} finally {
			saving = false;
		}
	}

	function handleClearSelection() {
		selection.clear();
	}
</script>

{#if selection.count > 0}
	<div class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
		<div class="bg-base-100 border border-base-300 rounded-lg shadow-xl px-4 py-3 flex items-center gap-4">
			<!-- Selection count -->
			<span class="font-medium text-sm">
				{selection.count} selected
			</span>

			<div class="divider divider-horizontal m-0"></div>

			<!-- Tag actions -->
			{#if showTagInput}
				<div class="flex items-center gap-2">
					<select
						class="select select-sm select-bordered"
						bind:value={tagAction}
					>
						<option value="add">Add tag</option>
						<option value="remove">Remove tag</option>
					</select>
					<div class="relative">
						<input
							type="text"
							class="input input-sm input-bordered w-40"
							placeholder="Enter tag..."
							bind:value={tagInputValue}
							onkeydown={(e) => e.key === 'Enter' && handleTagAction()}
						/>
						{#if suggestions.length > 0}
							<div class="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-32 overflow-y-auto">
								{#each suggestions as suggestion}
									<button
										type="button"
										class="w-full px-3 py-1 text-left text-xs hover:bg-base-200"
										onclick={() => handleTagAction(suggestion)}
									>
										{suggestion}
									</button>
								{/each}
							</div>
						{/if}
					</div>
					<button
						class="btn btn-sm btn-primary"
						onclick={() => handleTagAction()}
						disabled={saving || !tagInputValue.trim()}
					>
						{#if saving}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							Apply
						{/if}
					</button>
					<button
						class="btn btn-sm btn-ghost"
						onclick={() => { showTagInput = false; tagInputValue = ''; }}
					>
						Cancel
					</button>
				</div>
			{:else}
				<button
					class="btn btn-sm btn-outline"
					onclick={() => { showTagInput = true; tagAction = 'add'; }}
					disabled={saving}
				>
					+ Add Tag
				</button>
				<button
					class="btn btn-sm btn-outline"
					onclick={() => { showTagInput = true; tagAction = 'remove'; }}
					disabled={saving}
				>
					- Remove Tag
				</button>
			{/if}

			<div class="divider divider-horizontal m-0"></div>

			<!-- Share actions -->
			<button
				class="btn btn-sm btn-outline btn-success"
				onclick={() => handleShareAction(true)}
				disabled={saving}
				title="Share selected online"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
				</svg>
				Share
			</button>
			<button
				class="btn btn-sm btn-outline"
				onclick={() => handleShareAction(false)}
				disabled={saving}
				title="Make selected local-only"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
				</svg>
				Unshare
			</button>

			<div class="divider divider-horizontal m-0"></div>

			<!-- Clear selection -->
			<button
				class="btn btn-sm btn-ghost"
				onclick={handleClearSelection}
				title="Clear selection"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Error display -->
		{#if error}
			<div class="mt-2 text-sm text-error text-center bg-error/10 rounded px-3 py-1">
				{error}
			</div>
		{/if}
	</div>
{/if}
