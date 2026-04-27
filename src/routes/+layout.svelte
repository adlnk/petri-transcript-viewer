<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { isDarkMode, initializeTheme, toggleTheme } from '$lib/shared/theme';
	import { onMount } from 'svelte';
	import PasswordGate from '$lib/client/components/auth/PasswordGate.svelte';
	import ReviewerGate from '$lib/client/components/auth/ReviewerGate.svelte';
	import TranscriptLoaderDialog from '$lib/client/components/annotator/TranscriptLoaderDialog.svelte';
	import ModeIndicator from '$lib/client/components/admin/ModeIndicator.svelte';
	import { reviewerStore } from '$lib/client/stores/reviewer.svelte';
	import { transcriptLoader } from '$lib/client/stores/transcript-loader.svelte';
	import { invalidateListDataCache } from '$lib/shared/services/transcript-data.svelte';

	const isStaticMode = import.meta.env.VITE_STATIC_MODE === 'true';
	let folderPickerSupported = $derived(browser && transcriptLoader.isSupported());

	async function handleLoadFolder() {
		await transcriptLoader.loadFromDirectory();
		if (transcriptLoader.loaded) {
			// Invalidate the list cache so it reloads from the transcript-loader store
			invalidateListDataCache();
			// Navigate to home to trigger reload
			if (browser) window.location.href = `${base}/`;
		}
	}

	let { children } = $props();

	// Get password from environment variable (set at build time)
	const sitePassword = import.meta.env.VITE_SITE_PASSWORD || '';

	// Initialize theme on mount
	onMount(() => {
		initializeTheme();
	});

	// Handle checkbox change
	function handleThemeToggle() {
		toggleTheme();
	}
</script>

<!-- Password gate first (if password is set) -->
<PasswordGate password={sitePassword}>
	{#snippet children()}
		<!-- Reviewer gate (only in reviewer mode) -->
		{#if reviewerStore.isReviewerMode}
			<ReviewerGate>
				{#snippet children()}
					{#if reviewerStore.isAnnotatorMode}
						<!-- Annotator: load transcripts from folder before showing main content -->
						<TranscriptLoaderDialog>
							{#snippet children()}
								{@render mainContent()}
							{/snippet}
						</TranscriptLoaderDialog>
					{:else}
						{@render mainContent()}
					{/if}
				{/snippet}
			</ReviewerGate>
		{:else}
			{@render mainContent()}
		{/if}
	{/snippet}
</PasswordGate>

{#snippet mainContent()}
	<div class="min-h-screen bg-base-200">
		<div class="navbar bg-base-100 shadow-sm">
			<div class="navbar-start">
				<a href="{base}/" class="btn btn-ghost text-xl">Petri Transcript Viewer</a>
			</div>
			<div class="navbar-end">
				{#if isStaticMode && folderPickerSupported}
					<button
						class="btn btn-ghost btn-sm mr-2"
						onclick={handleLoadFolder}
						disabled={transcriptLoader.loading}
						title={transcriptLoader.loaded ? `Loaded: ${transcriptLoader.folderName} (${transcriptLoader.transcriptCount} transcripts)` : 'Load transcript folder'}
					>
						{#if transcriptLoader.loading}
							<span class="loading loading-spinner loading-xs"></span>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
							</svg>
						{/if}
						{transcriptLoader.loaded ? transcriptLoader.folderName : 'Load Folder'}
					</button>
				{/if}
				<label class="swap swap-rotate mr-4">
					<input type="checkbox" class="hidden" checked={$isDarkMode} onchange={handleThemeToggle} />
					<!-- Sun icon for light mode -->
					<svg class="swap-off fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
						<path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
					</svg>
					<!-- Moon icon for dark mode -->
					<svg class="swap-on fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
						<path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/>
					</svg>
				</label>
			</div>
		</div>

		<!-- Mode indicator (shows in admin or reviewer mode) -->
		<ModeIndicator />

		<main>
			{@render children()}
		</main>
	</div>
{/snippet}
