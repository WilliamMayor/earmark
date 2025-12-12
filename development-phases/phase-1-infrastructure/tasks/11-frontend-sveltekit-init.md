# Task 11: Initialize SvelteKit Project with TypeScript

## Context
This task initializes the frontend of the Budget Tool MVP using SvelteKit with TypeScript. SvelteKit is a modern web framework that provides server-side rendering, routing, and excellent developer experience. The frontend will communicate with the FastAPI backend to provide a user-friendly interface for envelope budgeting, transaction management, and fund transfers.

## Objectives
- Initialize a new SvelteKit project with TypeScript support
- Configure the project for optimal development experience
- Set up the base structure for the frontend application
- Ensure compatibility with the Docker containerization strategy
- Configure TypeScript for strict type checking

## Prerequisites
- Task 01 completed (base project structure exists)
- Node.js 18+ and npm installed
- Empty `frontend` directory with subdirectories created
- Git repository initialized

## Task Instructions

### Step 1: Initialize SvelteKit Project
Navigate to the frontend directory and create a new SvelteKit app:

```bash
cd frontend
npm create svelte@latest . --no-install
```

When prompted, select:
- "Skeleton project" (no demo code)
- "Yes, using TypeScript syntax"
- Add: ESLint, Prettier, Vitest for unit testing
- No need for Playwright (we'll configure it separately in Task 17)

### Step 2: Install Dependencies
Install the project dependencies:

```bash
npm install
```

Install additional development dependencies:

```bash
npm install -D @types/node
```

### Step 3: Update TypeScript Configuration
Replace `frontend/tsconfig.json` with strict TypeScript settings:

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": false,
    "checkJs": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": false,
    "moduleResolution": "bundler",
    "module": "esnext",
    "lib": ["es2020", "DOM", "DOM.Iterable"],
    "target": "es2020",
    "types": ["vite/client", "@types/node"]
  },
  "include": [
    "./.svelte-kit/ambient.d.ts",
    "./.svelte-kit/types/**/$types.d.ts",
    "./vite.config.ts",
    "./src/**/*.js",
    "./src/**/*.ts",
    "./src/**/*.svelte",
    "./tests/**/*.js",
    "./tests/**/*.ts",
    "./tests/**/*.svelte"
  ],
  "exclude": ["node_modules", "build", ".svelte-kit"]
}
```

### Step 4: Configure Vite
Update `frontend/vite.config.ts`:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    fs: {
      allow: ['..']
    }
  },
  preview: {
    port: 3000,
    host: '0.0.0.0'
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['svelte', '@sveltejs/kit']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['svelte', '@sveltejs/kit']
  }
});
```

### Step 5: Update package.json Scripts
Update the scripts section in `frontend/package.json`:

```json
{
  "scripts": {
    "dev": "vite dev --host 0.0.0.0 --port 3000",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port 3000",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "lint": "prettier --check . && eslint .",
    "format": "prettier --write .",
    "test": "vitest",
    "test:unit": "vitest run",
    "test:watch": "vitest watch",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Step 6: Create App Configuration
Create `frontend/src/app.d.ts` for global type definitions:

```typescript
// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
      details?: unknown;
    }
    
    interface Locals {
      apiUrl: string;
    }
    
    interface PageData {
      title?: string;
    }
    
    interface Platform {}
  }
}

export {};
```

### Step 7: Create Environment Configuration
Create `frontend/src/lib/config.ts`:

```typescript
/**
 * Application configuration
 */
export const config = {
  // API configuration
  api: {
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8000',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },
  
  // Application settings
  app: {
    name: 'Budget Tool',
    version: '0.1.0',
    environment: import.meta.env.MODE
  },
  
  // Feature flags
  features: {
    debugMode: import.meta.env.DEV,
    enableAnalytics: false,
    enableErrorReporting: import.meta.env.PROD
  }
} as const;

export type Config = typeof config;
```

### Step 8: Create Types Directory
Create `frontend/src/lib/types/index.ts`:

```typescript
/**
 * Common types used throughout the application
 */

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  success: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

// Placeholder types for future implementation
export interface Envelope {
  id: string;
  name: string;
  balance: number;
  goalAmount?: number;
  type: 'monthly' | 'annual' | 'goal' | 'default';
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  envelopeId?: string;
  status: 'pending' | 'allocated' | 'split';
  createdAt: string;
  updatedAt: string;
}

export interface Transfer {
  id: string;
  fromEnvelopeId: string;
  toEnvelopeId: string;
  amount: number;
  description?: string;
  date: string;
  createdAt: string;
}
```

### Step 9: Create Base Layout
Create `frontend/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';
</script>

<div class="min-h-screen bg-gray-50">
  <slot />
</div>
```

### Step 10: Create App CSS
Create `frontend/src/app.css`:

```css
/* Base styles - will be replaced with Tailwind in next task */
:root {
  --color-primary: #3b82f6;
  --color-secondary: #10b981;
  --color-danger: #ef4444;
  --color-warning: #f59e0b;
  --color-text: #1f2937;
  --color-text-light: #6b7280;
  --color-background: #ffffff;
  --color-surface: #f9fafb;
  --color-border: #e5e7eb;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  color: var(--color-text);
  background-color: var(--color-background);
  line-height: 1.5;
}

.min-h-screen {
  min-height: 100vh;
}

.bg-gray-50 {
  background-color: var(--color-surface);
}
```

### Step 11: Create Home Page
Update `frontend/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { config } from '$lib/config';
</script>

<svelte:head>
  <title>{config.app.name}</title>
</svelte:head>

<main class="container mx-auto p-8">
  <h1 class="text-4xl font-bold mb-4">{config.app.name}</h1>
  <p class="text-lg text-gray-600 mb-8">
    Self-hosted envelope budgeting application
  </p>
  
  <div class="bg-white rounded-lg shadow p-6 mb-4">
    <h2 class="text-2xl font-semibold mb-2">Frontend Status</h2>
    <p class="text-green-600">✓ SvelteKit initialized</p>
    <p class="text-gray-500">Version: {config.app.version}</p>
    <p class="text-gray-500">Environment: {config.app.environment}</p>
  </div>
  
  <div class="bg-white rounded-lg shadow p-6">
    <h2 class="text-2xl font-semibold mb-2">API Configuration</h2>
    <p class="text-gray-600">Base URL: {config.api.baseUrl}</p>
    <p class="text-gray-600">Timeout: {config.api.timeout}ms</p>
  </div>
</main>

<style>
  .container {
    max-width: 1200px;
  }
  
  .mx-auto {
    margin-left: auto;
    margin-right: auto;
  }
  
  .p-8 {
    padding: 2rem;
  }
  
  .p-6 {
    padding: 1.5rem;
  }
  
  .mb-8 {
    margin-bottom: 2rem;
  }
  
  .mb-4 {
    margin-bottom: 1rem;
  }
  
  .mb-2 {
    margin-bottom: 0.5rem;
  }
  
  .text-4xl {
    font-size: 2.25rem;
  }
  
  .text-2xl {
    font-size: 1.5rem;
  }
  
  .text-lg {
    font-size: 1.125rem;
  }
  
  .font-bold {
    font-weight: 700;
  }
  
  .font-semibold {
    font-weight: 600;
  }
  
  .text-gray-600 {
    color: #4b5563;
  }
  
  .text-gray-500 {
    color: #6b7280;
  }
  
  .text-green-600 {
    color: #059669;
  }
  
  .bg-white {
    background-color: white;
  }
  
  .rounded-lg {
    border-radius: 0.5rem;
  }
  
  .shadow {
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  }
</style>
```

### Step 12: Create Environment File
Create `frontend/.env.example`:

```bash
# API Configuration
VITE_API_URL=http://localhost:8000

# Feature Flags (optional)
VITE_ENABLE_DEBUG=false
```

Create `frontend/.env`:

```bash
# Development API Configuration
VITE_API_URL=http://localhost:8000

# Feature Flags
VITE_ENABLE_DEBUG=true
```

### Step 13: Update .gitignore
Ensure `frontend/.gitignore` includes:

```gitignore
.DS_Store
node_modules
/build
/.svelte-kit
/package
.env
.env.*
!.env.example
vite.config.js.timestamp-*
vite.config.ts.timestamp-*
```

### Step 14: Create First Unit Test
Create `frontend/src/lib/config.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { config } from './config';

describe('Application Configuration', () => {
  it('should have correct app name', () => {
    expect(config.app.name).toBe('Budget Tool');
  });

  it('should have API configuration', () => {
    expect(config.api).toBeDefined();
    expect(config.api.baseUrl).toBeDefined();
    expect(config.api.timeout).toBeGreaterThan(0);
  });

  it('should have retry configuration', () => {
    expect(config.api.retryAttempts).toBeGreaterThan(0);
    expect(config.api.retryDelay).toBeGreaterThan(0);
  });

  it('should have feature flags', () => {
    expect(config.features).toBeDefined();
    expect(typeof config.features.debugMode).toBe('boolean');
    expect(typeof config.features.enableAnalytics).toBe('boolean');
  });
});
```

### Step 15: Verify Installation
Run the following commands to verify the setup:

```bash
# Check TypeScript configuration
npm run check

# Run the development server
npm run dev

# Run tests
npm run test:unit

# Check linting
npm run lint
```

## Expected File Structure
After completing this task, the frontend directory should have:

```
frontend/
├── .env
├── .env.example
├── .gitignore
├── .prettierrc
├── .prettierignore
├── eslint.config.js
├── package.json
├── package-lock.json
├── svelte.config.js
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── app.css
│   ├── app.d.ts
│   ├── app.html
│   ├── lib/
│   │   ├── config.ts
│   │   ├── config.test.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── api/
│   │   │   └── .gitkeep
│   │   └── components/
│   │       └── .gitkeep
│   └── routes/
│       ├── +layout.svelte
│       └── +page.svelte
├── static/
│   ├── favicon.png
│   └── .gitkeep
└── tests/
    └── .gitkeep
```

## Success Criteria
- [ ] SvelteKit project initialized with TypeScript
- [ ] TypeScript configured with strict settings
- [ ] Vite configured for development and production
- [ ] Base layout and home page created
- [ ] Configuration module created with type safety
- [ ] Environment variables configured
- [ ] Development server runs on port 3000
- [ ] TypeScript checking passes without errors
- [ ] Unit test runs successfully
- [ ] Linting passes

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Navigate to frontend directory
cd frontend

# Verify TypeScript configuration
npm run check

# Start development server (should run on http://localhost:3000)
npm run dev

# Run tests
npm run test:unit

# Check linting
npm run lint

# Build the project
npm run build

# Verify the build was successful
ls -la .svelte-kit/output
```

## Troubleshooting
- If port 3000 is already in use, stop any running services or modify the port in vite.config.ts
- If npm install fails, ensure Node.js 18+ is installed
- If TypeScript errors occur, run `npm run check` to identify issues
- Clear the .svelte-kit directory if you encounter caching issues: `rm -rf .svelte-kit`
- If tests fail, ensure all dependencies are installed: `npm install`

## Notes
- The project uses strict TypeScript settings for better type safety
- Vite is configured to allow access from Docker containers (host: 0.0.0.0)
- The configuration module provides centralized settings management
- Placeholder types are created for future API integration
- Basic CSS is included; Tailwind will be added in the next task

## Next Steps
After completing this task, proceed to:
- Task 12: Configure Tailwind CSS for styling
- Task 13: Create API client service structure