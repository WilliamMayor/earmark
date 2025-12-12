# Task 17: Configure Playwright for E2E Testing

## Context
This task sets up Playwright for end-to-end (E2E) testing of the Budget Tool MVP frontend. Playwright enables automated browser testing across Chromium, Firefox, and WebKit, ensuring the application works correctly from a user's perspective. It will test complete user workflows, navigation, form interactions, and API integrations in a real browser environment.

## Objectives
- Install and configure Playwright for E2E testing
- Set up test infrastructure and utilities
- Create page object models for better test organization
- Configure multiple browser testing
- Implement example E2E tests for critical user flows
- Set up visual regression testing capabilities
- Configure CI-friendly test execution

## Prerequisites
- Task 11 completed (SvelteKit initialized)
- Task 14 completed (Layout and routing implemented)
- Task 16 completed (Vitest configured)
- Frontend application running
- Docker available for test containers

## Task Instructions

### Step 1: Install Playwright
Install Playwright and its dependencies:

```bash
cd frontend
npm init playwright@latest
```

When prompted:
- Choose TypeScript
- Add tests folder: `e2e`
- Add GitHub Actions workflow: No (we'll create custom)
- Install Playwright browsers: Yes

### Step 2: Configure Playwright
Update `frontend/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';
import { config as appConfig } from './src/lib/config';

const PORT = process.env.PORT || 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results.json' }],
    ['junit', { outputFile: 'junit.xml' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  use: {
    baseURL,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: process.env.CI ? 'only-on-failure' : 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    actionTimeout: 10000,
    navigationTimeout: 30000,
    
    // Custom test id attribute
    testIdAttribute: 'data-testid',
    
    // Viewport
    viewport: { width: 1280, height: 720 },
    
    // Context options
    contextOptions: {
      ignoreHTTPSErrors: true,
      permissions: ['clipboard-read', 'clipboard-write']
    }
  },

  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    
    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] }
    },
    
    // Tablet
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'] }
    }
  ],

  // Run local dev server before starting tests
  webServer: {
    command: process.env.CI ? 'npm run preview' : 'npm run dev',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  
  // Test timeout
  timeout: 30000,
  
  // Global timeout
  globalTimeout: process.env.CI ? 60 * 60 * 1000 : undefined,
  
  // Output folder
  outputDir: 'test-results/',
  
  // Preserve test output
  preserveOutput: 'failures-only'
});
```

### Step 3: Create Test Utilities
Create `frontend/e2e/utils/test-utils.ts`:

```typescript
import { test as base, expect, Page } from '@playwright/test';
import path from 'path';

// Custom test fixtures
export const test = base.extend<{
  authenticatedPage: Page;
}>({
  // Add authenticated page fixture (for future auth implementation)
  authenticatedPage: async ({ page }, use) => {
    // In the future, perform login here
    // For now, just use the regular page
    await use(page);
  }
});

export { expect };

// Utility functions
export class TestUtils {
  constructor(private page: Page) {}

  /**
   * Wait for API response
   */
  async waitForAPI(urlPattern: string | RegExp) {
    return this.page.waitForResponse(
      response => {
        const url = response.url();
        const matches = typeof urlPattern === 'string' 
          ? url.includes(urlPattern)
          : urlPattern.test(url);
        return matches && response.status() === 200;
      },
      { timeout: 10000 }
    );
  }

  /**
   * Take screenshot with timestamp
   */
  async screenshot(name: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await this.page.screenshot({
      path: path.join('screenshots', `${name}-${timestamp}.png`),
      fullPage: true
    });
  }

  /**
   * Mock API response
   */
  async mockAPI(pattern: string | RegExp, response: any) {
    await this.page.route(pattern, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
      });
    });
  }

  /**
   * Clear all data (for test isolation)
   */
  async clearAllData() {
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await this.page.context().clearCookies();
  }

  /**
   * Check accessibility
   */
  async checkA11y(selector?: string) {
    // This is a simplified a11y check
    // In production, use @axe-core/playwright
    const element = selector ? await this.page.$(selector) : this.page;
    if (!element) throw new Error(`Element not found: ${selector}`);
    
    // Check for basic a11y issues
    const issues = await this.page.evaluate(() => {
      const problems = [];
      
      // Check images for alt text
      document.querySelectorAll('img:not([alt])').forEach(img => {
        problems.push(`Image missing alt text: ${img.src}`);
      });
      
      // Check buttons for accessible text
      document.querySelectorAll('button').forEach(button => {
        if (!button.textContent?.trim() && !button.getAttribute('aria-label')) {
          problems.push('Button missing accessible text');
        }
      });
      
      // Check form inputs for labels
      document.querySelectorAll('input:not([type="hidden"])').forEach(input => {
        const id = input.id;
        if (id && !document.querySelector(`label[for="${id}"]`)) {
          problems.push(`Input missing label: ${id}`);
        }
      });
      
      return problems;
    });
    
    if (issues.length > 0) {
      throw new Error(`Accessibility issues found:\n${issues.join('\n')}`);
    }
  }
}

/**
 * Create test utils for a page
 */
export function createTestUtils(page: Page) {
  return new TestUtils(page);
}
```

### Step 4: Create Page Object Models
Create `frontend/e2e/pages/BasePage.ts`:

```typescript
import { Page, Locator } from '@playwright/test';

export abstract class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Navigate to page
   */
  abstract goto(): Promise<void>;

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /**
   * Wait for page to load
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector: string): Promise<boolean> {
    return this.page.isVisible(selector);
  }

  /**
   * Get text content
   */
  async getText(selector: string): Promise<string> {
    return (await this.page.textContent(selector)) || '';
  }

  /**
   * Click element
   */
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  /**
   * Fill input
   */
  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  /**
   * Take screenshot of page
   */
  async screenshot(name: string): Promise<void> {
    await this.page.screenshot({ 
      path: `screenshots/${name}.png`,
      fullPage: true 
    });
  }
}
```

Create `frontend/e2e/pages/HomePage.ts`:

```typescript
import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class HomePage extends BasePage {
  // Locators
  readonly heading: Locator;
  readonly quickStats: Locator;
  readonly importButton: Locator;
  readonly newEnvelopeButton: Locator;
  readonly transferFundsButton: Locator;
  readonly navigationMenu: Locator;
  readonly mobileMenuButton: Locator;

  constructor(page: Page) {
    super(page);
    
    // Initialize locators
    this.heading = page.getByRole('heading', { name: /dashboard/i });
    this.quickStats = page.getByTestId('quick-stats');
    this.importButton = page.getByRole('button', { name: /import transactions/i });
    this.newEnvelopeButton = page.getByRole('button', { name: /new envelope/i });
    this.transferFundsButton = page.getByRole('button', { name: /transfer funds/i });
    this.navigationMenu = page.getByRole('navigation');
    this.mobileMenuButton = page.getByTestId('mobile-menu-button');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.waitForLoad();
  }

  async getStatsValue(statName: string): Promise<string> {
    const stat = this.page.getByTestId(`stat-${statName.toLowerCase()}`);
    return stat.textContent() || '';
  }

  async navigateTo(pageName: string): Promise<void> {
    await this.page.getByRole('link', { name: pageName }).click();
    await this.page.waitForURL(`**/${pageName.toLowerCase()}`);
  }

  async openMobileMenu(): Promise<void> {
    if (await this.mobileMenuButton.isVisible()) {
      await this.mobileMenuButton.click();
      await this.page.waitForSelector('[data-testid="mobile-menu"]');
    }
  }

  async isPageLoaded(): Promise<boolean> {
    return (
      await this.heading.isVisible() &&
      await this.quickStats.isVisible()
    );
  }
}
```

### Step 5: Create E2E Tests
Create `frontend/e2e/navigation.spec.ts`:

```typescript
import { test, expect } from './utils/test-utils';
import { HomePage } from './pages/HomePage';

test.describe('Navigation', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
  });

  test('should navigate to all main pages', async ({ page }) => {
    // Check we're on dashboard
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();

    // Navigate to Envelopes
    await page.getByRole('link', { name: /envelopes/i }).click();
    await expect(page).toHaveURL('/envelopes');
    await expect(page.getByRole('heading', { name: /envelopes/i })).toBeVisible();

    // Navigate to Transactions
    await page.getByRole('link', { name: /transactions/i }).click();
    await expect(page).toHaveURL('/transactions');
    await expect(page.getByRole('heading', { name: /transactions/i })).toBeVisible();

    // Navigate back to Dashboard
    await page.getByRole('link', { name: /dashboard/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('should show breadcrumbs on sub-pages', async ({ page }) => {
    await page.getByRole('link', { name: /envelopes/i }).click();
    
    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i });
    await expect(breadcrumb).toBeVisible();
    
    const homeLink = breadcrumb.getByRole('link', { name: /home/i });
    await expect(homeLink).toBeVisible();
    
    await homeLink.click();
    await expect(page).toHaveURL('/');
  });

  test('should handle 404 pages', async ({ page }) => {
    await page.goto('/non-existent-page');
    
    await expect(page.getByText(/404/)).toBeVisible();
    await expect(page.getByText(/page not found/i)).toBeVisible();
    
    const homeButton = page.getByRole('button', { name: /go back home/i });
    await homeButton.click();
    
    await expect(page).toHaveURL('/');
  });
});
```

Create `frontend/e2e/mobile.spec.ts`:

```typescript
import { test, expect, devices } from '@playwright/test';
import { HomePage } from './pages/HomePage';

test.use({
  ...devices['iPhone 12']
});

test.describe('Mobile Navigation', () => {
  test('should toggle mobile menu', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    // Menu should be hidden initially
    const mobileMenu = page.getByTestId('mobile-menu');
    await expect(mobileMenu).toBeHidden();

    // Open menu
    const menuButton = page.getByTestId('mobile-menu-button');
    await menuButton.click();
    await expect(mobileMenu).toBeVisible();

    // Navigate to a page
    await page.getByRole('link', { name: /envelopes/i }).click();
    await expect(page).toHaveURL('/envelopes');
    
    // Menu should close after navigation
    await expect(mobileMenu).toBeHidden();
  });

  test('should be responsive on mobile devices', async ({ page }) => {
    await page.goto('/');

    // Check viewport
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThan(768);

    // Desktop sidebar should be hidden
    const desktopSidebar = page.getByTestId('desktop-sidebar');
    await expect(desktopSidebar).toBeHidden();

    // Mobile menu button should be visible
    const menuButton = page.getByTestId('mobile-menu-button');
    await expect(menuButton).toBeVisible();
  });
});
```

### Step 6: Create Visual Regression Test
Create `frontend/e2e/visual.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('dashboard page visual test', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot for visual comparison
    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
      animations: 'disabled'
    });
  });

  test('component visual tests', async ({ page }) => {
    await page.goto('/');
    
    // Button variations
    const buttonsSection = page.getByTestId('buttons-gallery');
    await expect(buttonsSection).toHaveScreenshot('buttons.png');
    
    // Card component
    const card = page.getByTestId('sample-card');
    await expect(card).toHaveScreenshot('card.png');
  });

  test('responsive layout visual test', async ({ page }) => {
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ 
        width: viewport.width, 
        height: viewport.height 
      });
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      await expect(page).toHaveScreenshot(`layout-${viewport.name}.png`, {
        fullPage: false
      });
    }
  });
});
```

### Step 7: Create API Integration Test
Create `frontend/e2e/api-integration.spec.ts`:

```typescript
import { test, expect } from './utils/test-utils';
import { createTestUtils } from './utils/test-utils';

test.describe('API Integration', () => {
  test('should load health status', async ({ page }) => {
    const utils = createTestUtils(page);
    
    // Mock the API response
    await utils.mockAPI('**/health', {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });

    await page.goto('/');
    
    // Wait for health check
    const healthResponse = await utils.waitForAPI('/health');
    expect(healthResponse).toBeTruthy();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Intercept and fail API calls
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await page.goto('/envelopes');
    
    // Should show error state
    const errorMessage = page.getByTestId('error-message');
    await expect(errorMessage).toBeVisible();
  });

  test('should retry failed requests', async ({ page }) => {
    let requestCount = 0;
    
    await page.route('**/api/envelopes', route => {
      requestCount++;
      if (requestCount === 1) {
        // Fail first request
        route.fulfill({ status: 500 });
      } else {
        // Succeed on retry
        route.fulfill({
          status: 200,
          body: JSON.stringify({ items: [], total: 0 })
        });
      }
    });

    await page.goto('/envelopes');
    
    // Should retry and eventually succeed
    expect(requestCount).toBeGreaterThan(1);
  });
});
```

### Step 8: Create Test Runner Script
Create `frontend/scripts/e2e-tests.sh`:

```bash
#!/bin/bash

# E2E test runner script

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[E2E]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
TEST_SUITE="${1:-all}"
HEADED="${2:-false}"
BROWSER="${3:-chromium}"

print_status "Starting E2E tests..."
print_status "Suite: $TEST_SUITE"
print_status "Browser: $BROWSER"

# Ensure browsers are installed
print_status "Checking Playwright browsers..."
npx playwright install

# Create directories
mkdir -p screenshots test-results playwright-report

# Run tests based on suite
case $TEST_SUITE in
    "all")
        print_status "Running all E2E tests..."
        npx playwright test
        ;;
    
    "smoke")
        print_status "Running smoke tests..."
        npx playwright test --grep @smoke
        ;;
    
    "visual")
        print_status "Running visual regression tests..."
        npx playwright test visual.spec.ts
        ;;
    
    "mobile")
        print_status "Running mobile tests..."
        npx playwright test --project=mobile-chrome --project=mobile-safari
        ;;
    
    "debug")
        print_status "Running in debug mode..."
        npx playwright test --debug
        ;;
    
    "ui")
        print_status "Opening Playwright UI..."
        npx playwright test --ui
        ;;
    
    *)
        print_error "Unknown test suite: $TEST_SUITE"
        print_status "Available suites: all, smoke, visual, mobile, debug, ui"
        exit 1
        ;;
esac

# Check test results
if [ $? -eq 0 ]; then
    print_status "E2E tests passed!"
    print_status "Report available at: playwright-report/index.html"
else
    print_error "E2E tests failed!"
    print_status "Opening test report..."
    npx playwright show-report
    exit 1
fi
```

## Expected File Structure
After completing this task:

```
frontend/
├── playwright.config.ts
├── package.json (updated)
├── e2e/
│   ├── utils/
│   │   └── test-utils.ts
│   ├── pages/
│   │   ├── BasePage.ts
│   │   └── HomePage.ts
│   ├── navigation.spec.ts
│   ├── mobile.spec.ts
│   ├── visual.spec.ts
│   └── api-integration.spec.ts
├── scripts/
│   └── e2e-tests.sh
├── playwright-report/ (generated)
├── test-results/ (generated)
└── screenshots/ (generated)
```

## Success Criteria
- [ ] Playwright installed and configured
- [ ] Page object models created
- [ ] Navigation tests pass
- [ ] Mobile responsiveness tests pass
- [ ] Visual regression tests configured
- [ ] API integration tests work
- [ ] Test utilities provide helper functions
- [ ] Multiple browser testing configured
- [ ] Test reports generated
- [ ] CI-friendly configuration

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Navigate to frontend
cd frontend

# Install Playwright browsers
npx playwright install

# Run all tests
npx playwright test

# Run specific test file
npx playwright test navigation.spec.ts

# Run tests in headed mode
npx playwright test --headed

# Run tests in specific browser
npx playwright test --project=firefox

# Run mobile tests
npx playwright test --project=mobile-chrome

# Open test report
npx playwright show-report

# Run tests in UI mode
npx playwright test --ui

# Debug tests
npx playwright test --debug

# Update visual snapshots
npx playwright test visual.spec.ts --update-snapshots
```

## Troubleshooting
- If browsers fail to install, run `npx playwright install-deps`
- For timeout issues, increase timeout in config or specific tests
- If visual tests fail, update snapshots with `--update-snapshots`
- For flaky tests, use `test.retry()` or increase wait times
- Check `trace.zip` files in test-results for debugging
- Ensure dev server is running for local testing

## Notes
- Tests run against local dev server by default
- Visual regression tests require baseline snapshots
- Mobile tests use real device emulation
- Page object pattern improves test maintainability
- Parallel execution speeds up test runs
- Traces and videos help debug failures

## Next Steps
After completing this task, proceed to:
- Task 18: Create docker-compose.yml for production
- Task 19: Create docker-compose.dev.yml for development