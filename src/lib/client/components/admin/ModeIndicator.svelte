<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { adminMode } from '$lib/client/stores/admin.svelte';
	import { reviewerStore } from '$lib/client/stores/reviewer.svelte';
	import {
		exportAnnotationsAsJson,
		saveAnnotations,
		hasSaveLocation,
		setupSaveLocation,
		canUseSilentSave,
		getAnnotationCount,
		hasRecoverableBackup,
		getBackupInfo,
		recoverFromBackup,
		startAutoExport,
		stopAutoExport,
		getAutoExportInterval,
		setAutoExportInterval,
		getLastExportTime,
		getSecondsUntilNextExport,
		resetAutoExportCountdown,
		importAnnotationsFromJson,
		getLatestModificationTime
	} from '$lib/client/stores/annotation-store';

	let annotationCount = $state(0);
	let saving = $state(false);
	let exporting = $state(false);
	let showSettings = $state(false);
	let autoExportMinutes = $state(30);
	let lastExport = $state<string | null>(null);
	let showRecoveryPrompt = $state(false);
	let backupInfo = $state<{ timestamp: string; count: number } | null>(null);
	let recovering = $state(false);
	let secondsUntilExport = $state<number | null>(null);
	let importing = $state(false);
	let fileInput: HTMLInputElement;
	let saveLocationConfigured = $state(false);
	let hasUnsavedChanges = $state(false);
	let silentSaveSupported = $state(true); // Assume true until checked

	// Load admin info on mount (for admin mode)
	onMount(async () => {
		adminMode.loadAdminInfo();

		// In reviewer mode, initialize
		if (reviewerStore.isReviewerMode) {
			annotationCount = await getAnnotationCount();
			autoExportMinutes = Math.round(getAutoExportInterval() / 60000);
			lastExport = getLastExportTime();
			silentSaveSupported = canUseSilentSave();
			saveLocationConfigured = await hasSaveLocation();

			// Start auto-export timer (only if silent save is supported)
			if (reviewerStore.reviewerName && silentSaveSupported) {
				startAutoExport(reviewerStore.reviewerName);
			}

			// Check if we need to offer recovery
			if (annotationCount === 0 && hasRecoverableBackup()) {
				backupInfo = getBackupInfo();
				if (backupInfo && backupInfo.count > 0) {
					showRecoveryPrompt = true;
				}
			}
		}
	});

	onDestroy(() => {
		stopAutoExport();
	});

	// Periodically update annotation count and unsaved changes status
	$effect(() => {
		if (!reviewerStore.isReviewerMode) return;

		const checkStatus = async () => {
			annotationCount = await getAnnotationCount();
			// Check if there are unsaved changes
			const latestMod = await getLatestModificationTime();
			if (latestMod && lastExport) {
				hasUnsavedChanges = latestMod > lastExport;
			} else if (latestMod && !lastExport) {
				// Never saved, but have annotations
				hasUnsavedChanges = true;
			} else {
				hasUnsavedChanges = false;
			}
		};

		// Check immediately
		checkStatus();

		const interval = setInterval(checkStatus, 5000); // Every 5 seconds

		return () => clearInterval(interval);
	});

	// Update countdown every second
	$effect(() => {
		if (!reviewerStore.isReviewerMode || autoExportMinutes === 0) {
			secondsUntilExport = null;
			return;
		}

		const interval = setInterval(() => {
			secondsUntilExport = getSecondsUntilNextExport();
		}, 1000);

		// Initial value
		secondsUntilExport = getSecondsUntilNextExport();

		return () => clearInterval(interval);
	});

	// Shorten path for display
	function shortenPath(path: string | null): string {
		if (!path) return '';
		const parts = path.split('/').filter(Boolean);
		if (parts.length <= 3) return path;
		return '.../' + parts.slice(-3).join('/');
	}

	async function handleSave() {
		if (!reviewerStore.reviewerName) return;
		saving = true;
		try {
			// If File System Access API not supported, fall back to regular export
			if (!silentSaveSupported) {
				console.log('Silent save not supported, using export fallback');
				await exportAnnotationsAsJson(reviewerStore.reviewerName);
				lastExport = new Date().toISOString();
				hasUnsavedChanges = false;
				return;
			}

			// If no save location configured yet, set one up first
			if (!saveLocationConfigured) {
				console.log('Setting up save location...');
				const locationSet = await setupSaveLocation(reviewerStore.reviewerName);
				if (locationSet) {
					saveLocationConfigured = true;
					console.log('Save location configured');
				} else {
					console.log('Save location setup cancelled or failed');
					return;
				}
			}

			const success = await saveAnnotations(reviewerStore.reviewerName);
			if (success) {
				lastExport = new Date().toISOString();
				saveLocationConfigured = await hasSaveLocation();
				hasUnsavedChanges = false;
				// Reset countdown since we just saved
				resetAutoExportCountdown();
				console.log('Save successful');
			} else {
				console.log('Save returned false');
			}
		} catch (err) {
			console.error('Save error:', err);
		} finally {
			saving = false;
		}
	}

	async function handleExport() {
		if (!reviewerStore.reviewerName) return;
		exporting = true;
		try {
			await exportAnnotationsAsJson(reviewerStore.reviewerName);
			// Don't reset countdown - export is separate from auto-save
		} finally {
			exporting = false;
		}
	}

	function handleChangeName() {
		reviewerStore.clearReviewerName();
		// Force page reload to show gate
		window.location.reload();
	}

	function handleAutoExportChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		const minutes = parseInt(target.value, 10);
		autoExportMinutes = minutes;
		setAutoExportInterval(minutes);
		if (minutes > 0 && reviewerStore.reviewerName) {
			startAutoExport(reviewerStore.reviewerName);
		}
	}

	async function handleRecover() {
		recovering = true;
		try {
			const count = await recoverFromBackup();
			annotationCount = count;
			showRecoveryPrompt = false;
		} catch (err) {
			console.error('Recovery failed:', err);
		} finally {
			recovering = false;
		}
	}

	function dismissRecovery() {
		showRecoveryPrompt = false;
	}

	function formatTime(isoString: string | null): string {
		if (!isoString) return 'Never';
		const date = new Date(isoString);
		return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function formatCountdown(seconds: number | null): string {
		if (seconds === null) return '';
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		if (mins > 0) {
			return `${mins}m ${secs}s`;
		}
		return `${secs}s`;
	}

	async function handleImport() {
		fileInput?.click();
	}

	async function handleFileSelect(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		importing = true;
		try {
			const count = await importAnnotationsFromJson(file);
			annotationCount = await getAnnotationCount();
			alert(`Successfully imported ${count} annotation${count === 1 ? '' : 's'}`);
		} catch (err: any) {
			alert(`Import failed: ${err.message}`);
		} finally {
			importing = false;
			// Reset file input so same file can be selected again
			target.value = '';
		}
	}
</script>

{#if adminMode.isAdminMode}
	<div class="bg-primary/10 border-b border-primary/20 px-4 py-1.5">
		<div class="flex items-center gap-2 text-sm text-base-content">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
			</svg>
			<span class="font-medium text-primary">Admin Mode</span>
			{#if adminMode.transcriptDir}
				<span class="text-base-content/60 font-mono text-xs" title={adminMode.transcriptDir}>
					{shortenPath(adminMode.transcriptDir)}
				</span>
			{/if}
		</div>
	</div>
{:else if reviewerStore.isReviewerMode}
	<!-- Recovery prompt -->
	{#if showRecoveryPrompt && backupInfo}
		<div class="bg-warning/20 border-b border-warning/30 px-4 py-2">
			<div class="flex items-center justify-between text-sm">
				<div class="flex items-center gap-2">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<span>
						Found backup with {backupInfo.count} annotation{backupInfo.count === 1 ? '' : 's'}
						from {formatTime(backupInfo.timestamp)}
					</span>
				</div>
				<div class="flex items-center gap-2">
					<button
						class="btn btn-warning btn-sm"
						onclick={handleRecover}
						disabled={recovering}
					>
						{#if recovering}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Recover
					</button>
					<button class="btn btn-ghost btn-sm" onclick={dismissRecovery}>
						Dismiss
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Main reviewer bar -->
	<div class="bg-secondary/10 border-b border-secondary/20 px-4 py-1.5">
		<div class="flex items-center justify-between text-sm text-base-content">
			<div class="flex items-center gap-2">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
				</svg>
				<span class="font-medium text-secondary">Reviewer Mode</span>
				{#if reviewerStore.reviewerName}
					<span class="text-base-content/70">
						{reviewerStore.reviewerName}
					</span>
					<button
						class="btn btn-ghost btn-xs"
						onclick={handleChangeName}
						title="Change reviewer name"
					>
						Change
					</button>
				{/if}
			</div>
			<div class="flex items-center gap-3">
				{#if annotationCount > 0}
					<span class="text-xs text-base-content/60">
						{annotationCount} annotated
					</span>
				{/if}

				<!-- Hidden file input for import -->
				<input
					type="file"
					accept=".json"
					class="hidden"
					bind:this={fileInput}
					onchange={handleFileSelect}
				/>

				<!-- Auto-save settings with countdown (only if browser supports it) -->
				{#if silentSaveSupported}
					<div class="flex items-center gap-1">
						<span class="text-xs text-base-content/50">Auto-save:</span>
						<select
							class="select select-xs select-ghost"
							value={autoExportMinutes}
							onchange={handleAutoExportChange}
						>
							<option value={0}>Off</option>
							<option value={15}>15 min</option>
							<option value={30}>30 min</option>
							<option value={60}>1 hour</option>
						</select>
						{#if autoExportMinutes > 0}
							{#if saveLocationConfigured}
								{#if secondsUntilExport !== null}
									<span class="text-xs font-mono text-base-content/40">
										({formatCountdown(secondsUntilExport)})
									</span>
								{/if}
							{:else}
								<span class="text-xs text-warning flex items-center gap-1" title="Auto-save needs a file location. Click the Save button to choose where to save.">
									<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
									</svg>
									Click Save button to enable
								</span>
							{/if}
						{/if}
					</div>
				{:else}
					<span class="text-xs text-base-content/40" title="Auto-save requires Chrome or Edge. Use Export to save manually.">
						Auto-save: N/A (use Export)
					</span>
				{/if}

				{#if lastExport}
					<span class="text-xs text-base-content/50" title="Last save: {lastExport}">
						Saved {formatTime(lastExport)}
					</span>
				{/if}

				<!-- Import button -->
				<button
					class="btn btn-ghost btn-xs"
					onclick={handleImport}
					disabled={importing}
					title="Import annotations from JSON file"
				>
					{#if importing}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
						</svg>
					{/if}
					Import
				</button>

				<!-- Save button (silent save or download fallback) -->
				<button
					class="btn btn-ghost btn-xs"
					onclick={handleSave}
					disabled={saving || (silentSaveSupported && saveLocationConfigured && !hasUnsavedChanges) || (!silentSaveSupported && !hasUnsavedChanges)}
					title={!silentSaveSupported
						? (hasUnsavedChanges ? "Download annotations as JSON" : "No unsaved changes")
						: (!saveLocationConfigured ? "Click to set up save location for auto-save" : (!hasUnsavedChanges ? "No unsaved changes" : "Save to configured location"))}
				>
					{#if saving}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
						</svg>
					{/if}
					Save
				</button>

				<!-- Export button (always shows file dialog) -->
				<button
					class="btn btn-ghost btn-xs"
					onclick={handleExport}
					disabled={exporting || annotationCount === 0}
					title="Export to a new file location"
				>
					{#if exporting}
						<span class="loading loading-spinner loading-xs"></span>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
					{/if}
					Export
				</button>
			</div>
		</div>
	</div>
{/if}
