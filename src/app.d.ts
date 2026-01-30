// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Extend Vite's ImportMetaEnv with our custom env vars
interface ImportMetaEnv {
	readonly VITE_STATIC_MODE?: string;
	readonly VITE_REVIEWER_MODE?: string;
	readonly VITE_SITE_PASSWORD?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

export {};
