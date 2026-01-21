<script lang="ts">
	import { onMount } from 'svelte';
	import TagChip from './TagChip.svelte';
	import type { TagsResponse } from '$lib/shared/types';

	interface Props {
		filePath: string;
		tags: string[];          // Original tags (read-only)
		userTags: string[];      // User-added tags (editable)
		onSave: (userTags: string[]) => void | Promise<void>;
		onCancel: () => void;
	}

	let { filePath, tags, userTags, onSave, onCancel }: Props = $props();

	// Local state for editing - initialize directly from props
	// Parent uses {#key} block to force remount after save, so we get fresh props
	let editedUserTags = $state<string[]>([...userTags]);
	let inputValue = $state('');
	let availableTags = $state<string[]>([]);
	let showDropdown = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let selectedIndex = $state(-1);  // -1 means no selection

	// Load available tags for autocomplete
	onMount(async () => {
		try {
			const response = await fetch('/api/tags');
			if (response.ok) {
				const data: TagsResponse = await response.json();
				// Combine predefined and existing tags
				availableTags = [...new Set([...data.predefined, ...data.existing])].sort();
			}
		} catch (err) {
			console.warn('Failed to load tags:', err);
		}
	});

	// Filtered suggestions based on input
	let suggestions = $derived.by(() => {
		if (!inputValue.trim()) return [];
		const query = inputValue.toLowerCase();
		// Filter out tags that are already used (original or user)
		const usedTags = new Set([...tags, ...editedUserTags]);
		return availableTags
			.filter(tag => tag.toLowerCase().includes(query) && !usedTags.has(tag))
			.slice(0, 10);
	});

	// Reset selection when suggestions change
	$effect(() => {
		// Access suggestions to create dependency
		const _ = suggestions;
		selectedIndex = -1;
	});

	function addTag(tag: string) {
		const trimmed = tag.trim();
		if (!trimmed) return;
		// Don't add duplicates
		if (tags.includes(trimmed) || editedUserTags.includes(trimmed)) return;
		editedUserTags = [...editedUserTags, trimmed];
		inputValue = '';
		showDropdown = false;
	}

	function removeUserTag(tag: string) {
		editedUserTags = editedUserTags.filter(t => t !== tag);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === 'Tab') {
			if (suggestions.length > 0 && showDropdown) {
				e.preventDefault();
				// Select highlighted item, or first item if none highlighted
				const indexToUse = selectedIndex >= 0 ? selectedIndex : 0;
				addTag(suggestions[indexToUse]);
			} else if (e.key === 'Enter' && inputValue.trim()) {
				e.preventDefault();
				// Create new tag
				addTag(inputValue);
			}
			// Let Tab proceed normally if no suggestions
		} else if (e.key === 'ArrowDown') {
			if (suggestions.length > 0) {
				e.preventDefault();
				selectedIndex = (selectedIndex + 1) % suggestions.length;
			}
		} else if (e.key === 'ArrowUp') {
			if (suggestions.length > 0) {
				e.preventDefault();
				selectedIndex = selectedIndex <= 0 ? suggestions.length - 1 : selectedIndex - 1;
			}
		} else if (e.key === 'Escape') {
			showDropdown = false;
			inputValue = '';
			selectedIndex = -1;
		}
	}

	async function handleSave() {
		saving = true;
		error = null;

		try {
			const response = await fetch('/api/transcripts/metadata', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					filePath,
					user_tags: editedUserTags
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.message || 'Failed to save');
			}

			// Call onSave callback - parent will close editor and use {#key} to force remount
			await onSave(editedUserTags);
		} catch (err: any) {
			error = err.message || 'Failed to save tags';
			saving = false;
		}
		// Note: don't set saving=false in finally - component may unmount before this runs
	}

	// Check if there are changes (use spread to avoid mutating arrays during comparison)
	let hasChanges = $derived(
		JSON.stringify([...editedUserTags].sort()) !== JSON.stringify([...userTags].sort())
	);
</script>

<div class="space-y-3">
	<!-- Current tags display -->
	<div class="flex flex-wrap gap-1.5">
		<!-- Original tags (not removable) -->
		{#each tags as tag}
			<TagChip {tag} />
		{/each}
		<!-- User tags (removable) -->
		{#each editedUserTags as tag}
			<TagChip {tag} isUserTag removable onRemove={removeUserTag} />
		{/each}
		{#if tags.length === 0 && editedUserTags.length === 0}
			<span class="text-sm text-base-content/50 italic">No tags</span>
		{/if}
	</div>

	<!-- Add tag input -->
	<div class="relative">
		<div class="flex gap-2">
			<input
				type="text"
				class="input input-sm input-bordered flex-1"
				placeholder="Add tag..."
				bind:value={inputValue}
				onfocus={() => showDropdown = true}
				onblur={() => setTimeout(() => showDropdown = false, 200)}
				onkeydown={handleKeyDown}
			/>
			<button
				type="button"
				class="btn btn-sm btn-ghost"
				onclick={() => inputValue.trim() && addTag(inputValue)}
				disabled={!inputValue.trim()}
			>
				Add
			</button>
		</div>

		<!-- Autocomplete dropdown -->
		{#if showDropdown && suggestions.length > 0}
			<div class="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
				{#each suggestions as suggestion, i}
					<button
						type="button"
						class="w-full px-3 py-1.5 text-left text-sm transition-colors {i === selectedIndex ? 'bg-primary/20 text-primary-content' : 'hover:bg-base-200'}"
						onmousedown={() => addTag(suggestion)}
						onmouseenter={() => selectedIndex = i}
					>
						{suggestion}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Create new tag hint -->
		{#if showDropdown && inputValue.trim() && suggestions.length === 0}
			<div class="absolute z-50 w-full mt-1 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2 text-sm text-base-content/70">
				Press Enter to create "{inputValue.trim()}"
			</div>
		{/if}
	</div>

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
