<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    password?: string;
    storageKey?: string;
    children?: import('svelte').Snippet;
  }

  let { password = '', storageKey = 'transcript-viewer-auth', children }: Props = $props();

  let isAuthenticated = $state(false);
  let inputPassword = $state('');
  let error = $state('');
  let isLoading = $state(true);

  onMount(() => {
    // If no password configured, skip auth
    if (!password) {
      isAuthenticated = true;
      isLoading = false;
      return;
    }

    // Check if already authenticated
    const stored = localStorage.getItem(storageKey);
    if (stored === hashPassword(password)) {
      isAuthenticated = true;
    }
    isLoading = false;
  });

  // Simple hash function (not cryptographically secure, just for basic deterrence)
  function hashPassword(pwd: string): string {
    let hash = 0;
    for (let i = 0; i < pwd.length; i++) {
      const char = pwd.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';

    if (inputPassword === password) {
      localStorage.setItem(storageKey, hashPassword(password));
      isAuthenticated = true;
    } else {
      error = 'Incorrect password';
      inputPassword = '';
    }
  }

  function handleLogout() {
    localStorage.removeItem(storageKey);
    isAuthenticated = false;
    inputPassword = '';
  }
</script>

{#if isLoading}
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <span class="loading loading-spinner loading-lg"></span>
  </div>
{:else if !isAuthenticated}
  <div class="min-h-screen flex items-center justify-center bg-base-200">
    <div class="card w-96 bg-base-100 shadow-xl">
      <div class="card-body">
        <h2 class="card-title justify-center">Transcript Viewer</h2>
        <p class="text-center text-base-content/70 text-sm">
          This content is password protected.
        </p>

        <form onsubmit={handleSubmit} class="mt-4">
          <div class="form-control">
            <input
              type="password"
              placeholder="Enter password"
              class="input input-bordered w-full"
              bind:value={inputPassword}
              autocomplete="current-password"
            />
          </div>

          {#if error}
            <div class="text-error text-sm mt-2">{error}</div>
          {/if}

          <div class="card-actions justify-center mt-4">
            <button type="submit" class="btn btn-primary w-full">
              Access
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
{:else}
  {@render children?.()}
{/if}
