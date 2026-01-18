<script lang="ts">
	import { onMount } from 'svelte';
	import { adminMode } from '$lib/client/stores/admin.svelte';

	// Load admin info on mount
	onMount(() => {
		adminMode.loadAdminInfo();
	});

	// Shorten path for display
	function shortenPath(path: string | null): string {
		if (!path) return '';
		// Show last 2-3 path segments
		const parts = path.split('/').filter(Boolean);
		if (parts.length <= 3) return path;
		return '.../' + parts.slice(-3).join('/');
	}
</script>

{#if adminMode.isAdminMode}
	<div class="bg-info/10 border-b border-info/20 px-4 py-1.5">
		<div class="flex items-center gap-2 text-sm text-info-content/80">
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
			</svg>
			<span class="font-medium">Admin Mode</span>
			{#if adminMode.transcriptDir}
				<span class="text-info-content/60 font-mono text-xs" title={adminMode.transcriptDir}>
					{shortenPath(adminMode.transcriptDir)}
				</span>
			{/if}
		</div>
	</div>
{/if}
