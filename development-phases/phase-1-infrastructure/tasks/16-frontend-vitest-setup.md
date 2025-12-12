# Task 16: Set Up Vitest for Component Testing

## Context
This task configures Vitest as the unit testing framework for the Budget Tool MVP frontend. Vitest is a fast, ESM-first testing framework that works seamlessly with Vite and SvelteKit. It will be used to test Svelte components, TypeScript modules, stores, and API clients, ensuring code quality and preventing regressions throughout development.

## Objectives
- Configure Vitest for SvelteKit and Svelte component testing
- Set up testing utilities and helpers
- Configure code coverage reporting
- Create test fixtures and mocks
- Implement example tests for components, stores, and utilities
- Set up continuous testing workflow

## Prerequisites
- Task 11 completed (SvelteKit initialized)
- Task 12 completed (Tailwind CSS configured)
- Task 13 completed (API client created)
- Task 14 completed (Components created)
- Node.js and npm available
- Basic Vitest already installed with SvelteKit

## Task Instructions

### Step 1: Install Testing Dependencies
Install additional testing libraries:

```bash
cd frontend
npm install -D @testing-library/svelte @testing-library/user-event @testing-library/jest-dom
npm install -D @vitest/ui @vitest/coverage-v8
npm install -D jsdom happy-dom
npm install -D @sveltejs/vite-plugin-svelte
npm install -D msw @mswjs/data
```

### Step 2: Configure Vitest
Update `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import path from 'path';

export default defineConfig({
  plugins: [sveltekit(), svelteTesting()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', '.svelte-kit', 'build'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test/',
        '*.config.ts',
        '*.config.js',
        '.svelte-kit/',
        'build/',
        'src/app.html',
        'src/app.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts'
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60
      }
    },
    deps: {
      inline: [/@sveltejs\/kit/]
    },
    alias: {
      $lib: path.resolve('./src/lib'),
      $app: path.resolve('./src/test/mocks/app')
    },
    pool: 'forks',
    css: true,
    testTimeout: 10000
  }
});
```

### Step 3: Create Test Setup File
Create `frontend/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import type { Navigation, Page } from '@sveltejs/kit';
import { readable } from 'svelte/store';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

// Start MSW server
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock SvelteKit modules
vi.mock('$app/environment', () => ({
  browser: true,
  dev: true,
  building: false,
  version: '1.0.0'
}));

// Mock $app/navigation
vi.mock('$app/navigation', () => ({
  goto: vi.fn(() => Promise.resolve()),
  replaceState: vi.fn(),
  pushState: vi.fn(),
  preloadData: vi.fn(() => Promise.resolve()),
  preloadCode: vi.fn(() => Promise.resolve()),
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
  invalidate: vi.fn(() => Promise.resolve()),
  invalidateAll: vi.fn(() => Promise.resolve())
}));

// Mock $app/stores
const mockPage = readable<Page>({
  url: new URL('http://localhost:3000'),
  params: {},
  route: {
    id: '/'
  },
  status: 200,
  error: null,
  data: {},
  form: undefined,
  state: {}
});

const mockNavigating = readable<Navigation | null>(null);
const mockUpdated = readable<boolean>(false);

vi.mock('$app/stores', () => ({
  page: mockPage,
  navigating: mockNavigating,
  updated: mockUpdated,
  getStores: () => ({
    page: mockPage,
    navigating: mockNavigating,
    updated: mockUpdated
  })
}));

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock
});
```

### Step 4: Create Mock App Stores
Create `frontend/src/test/mocks/app.ts`:

```typescript
import { readable } from 'svelte/store';
import { vi } from 'vitest';

export const page = readable({
  url: new URL('http://localhost:3000'),
  params: {},
  route: {
    id: '/'
  },
  status: 200,
  error: null,
  data: {},
  form: undefined,
  state: {}
});

export const navigating = readable(null);
export const updated = readable(false);

export const goto = vi.fn(() => Promise.resolve());
export const invalidate = vi.fn(() => Promise.resolve());
export const invalidateAll = vi.fn(() => Promise.resolve());
export const preloadData = vi.fn(() => Promise.resolve());
export const preloadCode = vi.fn(() => Promise.resolve());
```

### Step 5: Create MSW Server Mock
Create `frontend/src/test/mocks/server.ts`:

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const handlers = [
  // Health endpoint
  http.get('http://localhost:8000/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  }),

  // Envelopes endpoints
  http.get('http://localhost:8000/api/envelopes', () => {
    return HttpResponse.json({
      items: [
        {
          id: '1',
          name: 'Groceries',
          balance: 500.00,
          goalAmount: 600.00,
          type: 'monthly',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z'
        }
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1
    });
  }),

  http.post('http://localhost:8000/api/envelopes', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      id: '2',
      ...body,
      balance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, { status: 201 });
  }),

  // Catch all for unhandled requests
  http.get('*', () => {
    return HttpResponse.json(
      { error: 'Not found' },
      { status: 404 }
    );
  })
];

export const server = setupServer(...handlers);
```

### Step 6: Create Testing Utilities
Create `frontend/src/test/utils.ts`:

```typescript
import { render as svelteRender, type RenderResult } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, SvelteComponent } from 'svelte';

/**
 * Custom render function that sets up user event
 */
export function render<T extends SvelteComponent>(
  component: new (...args: any[]) => T,
  props?: ComponentProps<T>,
  options?: any
): RenderResult<T> & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  const renderResult = svelteRender(component, props, options);
  
  return {
    ...renderResult,
    user
  };
}

/**
 * Wait for async operations to complete
 */
export function waitFor(ms: number = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock store for testing
 */
export function createMockStore<T>(initialValue: T) {
  let value = initialValue;
  const subscribers = new Set<(value: T) => void>();

  return {
    subscribe(fn: (value: T) => void) {
      subscribers.add(fn);
      fn(value);
      return () => subscribers.delete(fn);
    },
    set(newValue: T) {
      value = newValue;
      subscribers.forEach(fn => fn(value));
    },
    update(fn: (value: T) => T) {
      value = fn(value);
      subscribers.forEach(subscriber => subscriber(value));
    }
  };
}
```

### Step 7: Update Button Component Test
Update `frontend/src/lib/components/Button.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import Button from './Button.svelte';

describe('Button Component', () => {
  it('renders with default props', () => {
    render(Button, {
      props: {
        children: 'Click me'
      }
    });
    
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('btn-primary');
  });

  it('applies variant classes correctly', () => {
    const { rerender } = render(Button, {
      props: {
        variant: 'success'
      }
    });
    
    let button = screen.getByRole('button');
    expect(button).toHaveClass('btn-success');
    
    rerender({ variant: 'danger' });
    button = screen.getByRole('button');
    expect(button).toHaveClass('btn-danger');
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(Button, {
      props: {
        onclick: handleClick
      }
    });
    
    const button = screen.getByRole('button');
    await fireEvent.click(button);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disables button when disabled prop is true', () => {
    render(Button, {
      props: {
        disabled: true
      }
    });
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-50');
  });

  it('shows loading spinner when loading is true', () => {
    render(Button, {
      props: {
        loading: true
      }
    });
    
    const spinner = document.querySelector('svg.animate-spin');
    expect(spinner).toBeInTheDocument();
    
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('applies size classes correctly', () => {
    const { rerender } = render(Button, {
      props: {
        size: 'sm'
      }
    });
    
    let button = screen.getByRole('button');
    expect(button).toHaveClass('text-xs');
    
    rerender({ size: 'lg' });
    button = screen.getByRole('button');
    expect(button).toHaveClass('text-base');
  });

  it('applies full width class when fullWidth is true', () => {
    render(Button, {
      props: {
        fullWidth: true
      }
    });
    
    const button = screen.getByRole('button');
    expect(button).toHaveClass('w-full');
  });
});
```

### Step 8: Create Store Test
Create `frontend/src/lib/stores/navigation.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { navigation } from './navigation';

describe('Navigation Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    navigation.closeMobileMenu();
  });

  it('initializes with correct default values', () => {
    const state = get(navigation);
    expect(state.items).toHaveLength(5);
    expect(state.isOpen).toBe(false);
    expect(state.isMobileMenuOpen).toBe(false);
  });

  it('toggles sidebar state', () => {
    navigation.toggleSidebar();
    let state = get(navigation);
    expect(state.isOpen).toBe(true);
    
    navigation.toggleSidebar();
    state = get(navigation);
    expect(state.isOpen).toBe(false);
  });

  it('toggles mobile menu state', () => {
    navigation.toggleMobileMenu();
    let state = get(navigation);
    expect(state.isMobileMenuOpen).toBe(true);
    
    navigation.toggleMobileMenu();
    state = get(navigation);
    expect(state.isMobileMenuOpen).toBe(false);
  });

  it('closes mobile menu', () => {
    navigation.toggleMobileMenu();
    let state = get(navigation);
    expect(state.isMobileMenuOpen).toBe(true);
    
    navigation.closeMobileMenu();
    state = get(navigation);
    expect(state.isMobileMenuOpen).toBe(false);
  });

  it('updates navigation items', () => {
    const newItems = [
      { label: 'Test', href: '/test', icon: 'test' }
    ];
    
    navigation.setItems(newItems);
    const state = get(navigation);
    expect(state.items).toEqual(newItems);
  });
});
```

### Step 9: Create API Client Test
Create `frontend/src/lib/api/health.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { healthApi } from './health';
import { server } from '../../test/mocks/server';
import { http, HttpResponse } from 'msw';

describe('Health API', () => {
  it('successfully checks health status', async () => {
    const health = await healthApi.checkHealth();
    
    expect(health).toEqual({
      status: 'healthy',
      version: '1.0.0',
      timestamp: expect.any(String)
    });
  });

  it('handles health check errors', async () => {
    server.use(
      http.get('http://localhost:8000/health', () => {
        return HttpResponse.json(
          { error: 'Service unavailable' },
          { status: 503 }
        );
      })
    );

    await expect(healthApi.checkHealth()).rejects.toThrow(
      'Failed to check health'
    );
  });

  it('checks API readiness', async () => {
    server.use(
      http.get('http://localhost:8000/ready', () => {
        return HttpResponse.json({ ready: true });
      })
    );

    const ready = await healthApi.checkReady();
    expect(ready).toBe(true);
  });

  it('returns false when API is not ready', async () => {
    server.use(
      http.get('http://localhost:8000/ready', () => {
        return HttpResponse.json({ ready: false });
      })
    );

    const ready = await healthApi.checkReady();
    expect(ready).toBe(false);
  });
});
```

### Step 10: Update Package.json Scripts
Update test scripts in `frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run",
    "test:watch": "vitest watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:coverage:ui": "vite preview --outDir coverage"
  }
}
```

### Step 11: Create Test Script
Create `frontend/scripts/run-tests.sh`:

```bash
#!/bin/bash

# Test runner script for frontend

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[TEST]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Parse arguments
TEST_TYPE="${1:-unit}"
WATCH_MODE="${2:-false}"

print_status "Starting frontend tests..."
print_status "Test type: $TEST_TYPE"

case $TEST_TYPE in
    "unit")
        print_status "Running unit tests..."
        if [ "$WATCH_MODE" = "watch" ]; then
            npm run test:watch
        else
            npm run test:unit
        fi
        ;;
    
    "coverage")
        print_status "Running tests with coverage..."
        npm run test:coverage
        print_status "Coverage report generated in ./coverage"
        ;;
    
    "ui")
        print_status "Opening Vitest UI..."
        npm run test:ui
        ;;
    
    "all")
        print_status "Running all tests..."
        npm run test:unit
        if [ $? -eq 0 ]; then
            print_status "Unit tests passed!"
            npm run test:coverage
        else
            print_error "Unit tests failed!"
            exit 1
        fi
        ;;
    
    *)
        print_error "Unknown test type: $TEST_TYPE"
        print_status "Available types: unit, coverage, ui, all"
        exit 1
        ;;
esac

if [ $? -eq 0 ]; then
    print_status "Tests completed successfully!"
else
    print_error "Tests failed!"
    exit 1
fi
```

## Expected File Structure
After completing this task:

```
frontend/
├── vitest.config.ts (updated)
├── package.json (updated)
├── src/
│   ├── test/
│   │   ├── setup.ts
│   │   ├── utils.ts
│   │   └── mocks/
│   │       ├── app.ts
│   │       └── server.ts
│   ├── lib/
│   │   ├── components/
│   │   │   └── Button.test.ts (updated)
│   │   ├── stores/
│   │   │   └── navigation.test.ts
│   │   └── api/
│   │       └── health.test.ts
└── scripts/
    └── run-tests.sh
```

## Success Criteria
- [ ] Vitest configured for SvelteKit testing
- [ ] Test setup file with proper mocks
- [ ] Testing utilities created
- [ ] MSW server configured for API mocking
- [ ] Component tests pass
- [ ] Store tests pass
- [ ] API client tests pass
- [ ] Coverage reporting configured
- [ ] Test UI accessible via script
- [ ] All test scripts working

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Navigate to frontend
cd frontend

# Run unit tests
npm run test:unit

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Open Vitest UI
npm run test:ui

# Check coverage thresholds
npm run test:coverage -- --run

# Run specific test file
npx vitest run src/lib/components/Button.test.ts

# Run tests matching pattern
npx vitest run -t "Button"

# Debug test
npx vitest run --reporter=verbose
```

## Troubleshooting
- If tests fail with module errors, check the vitest.config.ts aliases
- For DOM-related errors, ensure jsdom environment is set
- If MSW fails, check server setup in test setup file
- For coverage issues, verify exclusion patterns
- If component tests fail, check @testing-library/svelte setup
- For store test issues, ensure proper mock cleanup between tests

## Notes
- Vitest runs in watch mode by default for rapid feedback
- MSW provides realistic API mocking without network calls
- Coverage thresholds ensure minimum code coverage
- Test utilities simplify common testing patterns
- Component tests focus on user interactions
- Store tests verify state management logic

## Next Steps
After completing this task, proceed to:
- Task 17: Configure Playwright for E2E testing
- Task 18: Create docker-compose.yml for production