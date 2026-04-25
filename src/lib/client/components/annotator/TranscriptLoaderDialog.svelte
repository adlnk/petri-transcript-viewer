<script lang="ts">
  import { transcriptLoader } from '$lib/client/stores/transcript-loader.svelte';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  import { browser } from '$app/environment';

  let supported = $derived(transcriptLoader.isSupported());
  let currentUrl = $derived(browser ? window.location.href : '');
</script>

{#if !transcriptLoader.loaded}
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <div class="card w-[28rem] bg-base-100 shadow-xl">
      <div class="card-body items-center text-center">
        <h2 class="card-title">Load Transcripts</h2>

        {#if !supported}
          <div class="alert alert-error mt-4">
            <p>This tool requires <strong>Chrome</strong> or <strong>Edge</strong> for folder access.</p>
            <p class="mt-2">Please open this link in Chrome or Edge:</p>
            <code class="mt-1 p-2 bg-base-200 rounded text-sm select-all block">{currentUrl}</code>
          </div>
        {:else}
          <p class="text-base-content/70 text-sm mt-2">
            Select the folder containing your transcript JSON files.
          </p>

          <button
            class="btn btn-primary btn-lg mt-6"
            onclick={() => transcriptLoader.loadFromDirectory()}
            disabled={transcriptLoader.loading}
          >
            {#if transcriptLoader.loading}
              <span class="loading loading-spinner loading-sm"></span>
              Loading...
            {:else}
              Choose Folder
            {/if}
          </button>

          {#if transcriptLoader.error}
            <div class="alert alert-warning mt-4 text-sm">
              {transcriptLoader.error}
            </div>
          {/if}

          <p class="text-base-content/40 text-xs mt-6">
            Your browser will ask for read permission on the selected folder.
            No data leaves your computer.
          </p>
        {/if}
      </div>
    </div>
  </div>
{:else}
  <!-- Transcripts loaded — render the main app -->
  {@render children?.()}
{/if}
