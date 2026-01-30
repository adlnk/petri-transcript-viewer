<script lang="ts">
  import { onMount } from 'svelte';
  import { reviewerStore } from '$lib/client/stores/reviewer.svelte';

  interface Props {
    children?: import('svelte').Snippet;
  }

  let { children }: Props = $props();

  let isReady = $state(false);
  let inputName = $state('');
  let error = $state('');

  onMount(() => {
    // Check if already identified
    isReady = reviewerStore.hasReviewerName();
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';

    const name = inputName.trim();
    if (!name) {
      error = 'Please enter your name';
      return;
    }

    if (name.length < 2) {
      error = 'Name must be at least 2 characters';
      return;
    }

    reviewerStore.setReviewerName(name);
    isReady = true;
  }
</script>

{#if !isReady}
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <div class="card w-96 bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title justify-center">Transcript Reviewer</h2>
        <p class="text-center text-base-content/70 text-sm">
          Please enter your name to begin reviewing transcripts.
        </p>

        <form onsubmit={handleSubmit} class="mt-4">
          <div class="form-control">
            <input
              type="text"
              placeholder="Your name"
              class="input input-bordered w-full"
              bind:value={inputName}
              autocomplete="name"
            />
          </div>

          {#if error}
            <div class="text-error text-sm mt-2">{error}</div>
          {/if}

          <div class="card-actions justify-center mt-4">
            <button type="submit" class="btn btn-primary w-full">
              Start Reviewing
            </button>
          </div>
        </form>

        <p class="text-center text-base-content/50 text-xs mt-4">
          Your annotations will be stored locally and can be exported.
        </p>
      </div>
    </div>
  </div>
{:else}
  {@render children?.()}
{/if}
