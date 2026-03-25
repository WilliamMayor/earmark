import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	globalSetup: './tests/global-setup.ts',
	workers: 1,
	webServer: {
		command: 'npm run build && DB_PATH=./tests/fixture.db node build/index.js',
		port: 3000,
		reuseExistingServer: !process.env.CI,
		env: {
			DB_PATH: './tests/fixture.db',
			PORT: '3000',
			ORIGIN: 'http://localhost:3000'
		}
	},
	use: {
		baseURL: 'http://localhost:3000'
	},
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
	]
});
