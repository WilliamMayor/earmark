import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		allowedHosts: ['kiosk.tail04099c.ts.net']
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
