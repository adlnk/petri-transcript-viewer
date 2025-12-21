import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isStatic = process.env.BUILD_MODE === 'static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: isStatic
			? adapterStatic({
					pages: 'build',
					assets: 'build',
					fallback: '404.html',
					strict: true
				})
			: adapterNode({
					out: 'build'
				}),
		paths: {
			base: process.env.BASE_PATH || ''
		}
	}
};

export default config;
