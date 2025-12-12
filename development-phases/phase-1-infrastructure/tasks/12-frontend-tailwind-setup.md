# Task 12: Configure Tailwind CSS

## Context
This task adds Tailwind CSS to the SvelteKit frontend for the Budget Tool MVP. Tailwind CSS is a utility-first CSS framework that provides low-level utility classes to build custom designs directly in your markup. It will be used throughout the application for consistent styling, responsive design, and rapid UI development.

## Objectives
- Install and configure Tailwind CSS with SvelteKit
- Set up PostCSS for processing Tailwind directives
- Configure Tailwind for optimal production builds with purging
- Create a custom Tailwind configuration for the Budget Tool design system
- Set up typography and form plugins
- Create utility components demonstrating Tailwind usage

## Prerequisites
- Task 11 completed (SvelteKit project initialized)
- Node.js and npm available
- Frontend development server working
- Base app.css file exists

## Task Instructions

### Step 1: Install Tailwind CSS and Dependencies
Navigate to the frontend directory and install Tailwind CSS:

```bash
cd frontend
npm install -D tailwindcss postcss autoprefixer @tailwindcss/forms @tailwindcss/typography
```

### Step 2: Initialize Tailwind Configuration
Create Tailwind and PostCSS configuration files:

```bash
npx tailwindcss init -p
```

### Step 3: Configure Tailwind
Update `frontend/tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{html,js,svelte,ts}',
    './src/app.html'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554'
        },
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16'
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03'
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a'
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif'
        ],
        mono: [
          'Fira Code',
          'JetBrains Mono',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace'
        ]
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '120': '30rem'
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'spin-slow': 'spin 3s linear infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      },
      boxShadow: {
        'inner-lg': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        'glow': '0 0 20px rgba(59, 130, 246, 0.5)',
        'glow-success': '0 0 20px rgba(34, 197, 94, 0.5)',
        'glow-danger': '0 0 20px rgba(239, 68, 68, 0.5)'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography')
  ]
}
```

### Step 4: Configure PostCSS
Update `frontend/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

### Step 5: Update App CSS
Replace `frontend/src/app.css` with Tailwind directives:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* Custom base styles */
  html {
    @apply scroll-smooth;
  }

  body {
    @apply antialiased;
  }

  /* Focus styles for accessibility */
  [tabindex]:focus-visible,
  button:focus-visible,
  a:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    @apply outline-none ring-2 ring-primary-500 ring-offset-2;
  }
}

@layer components {
  /* Button component styles */
  .btn {
    @apply inline-flex items-center justify-center px-4 py-2 font-medium rounded-lg transition-colors duration-200;
    @apply focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .btn-primary {
    @apply bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500;
  }

  .btn-secondary {
    @apply bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500;
  }

  .btn-success {
    @apply bg-success-600 text-white hover:bg-success-700 focus:ring-success-500;
  }

  .btn-danger {
    @apply bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500;
  }

  .btn-outline {
    @apply border-2 border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500;
  }

  /* Card component */
  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }

  .card-header {
    @apply mb-4 pb-4 border-b border-gray-200;
  }

  .card-title {
    @apply text-xl font-semibold text-gray-900;
  }

  /* Form components */
  .form-label {
    @apply block text-sm font-medium text-gray-700 mb-1;
  }

  .form-input {
    @apply mt-1 block w-full rounded-md border-gray-300 shadow-sm;
    @apply focus:border-primary-500 focus:ring-primary-500;
  }

  .form-error {
    @apply mt-1 text-sm text-danger-600;
  }

  .form-help {
    @apply mt-1 text-sm text-gray-500;
  }

  /* Badge component */
  .badge {
    @apply inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium;
  }

  .badge-primary {
    @apply bg-primary-100 text-primary-800;
  }

  .badge-success {
    @apply bg-success-100 text-success-800;
  }

  .badge-warning {
    @apply bg-warning-100 text-warning-800;
  }

  .badge-danger {
    @apply bg-danger-100 text-danger-800;
  }

  /* Alert component */
  .alert {
    @apply p-4 rounded-lg border;
  }

  .alert-info {
    @apply bg-blue-50 text-blue-800 border-blue-200;
  }

  .alert-success {
    @apply bg-success-50 text-success-800 border-success-200;
  }

  .alert-warning {
    @apply bg-warning-50 text-warning-800 border-warning-200;
  }

  .alert-danger {
    @apply bg-danger-50 text-danger-800 border-danger-200;
  }
}

@layer utilities {
  /* Custom utilities */
  .animate-delayed {
    animation-delay: 150ms;
  }

  .animate-more-delayed {
    animation-delay: 300ms;
  }

  .text-balance {
    text-wrap: balance;
  }

  /* Hide scrollbar but keep functionality */
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  /* Custom gradient backgrounds */
  .bg-gradient-primary {
    @apply bg-gradient-to-r from-primary-500 to-primary-700;
  }

  .bg-gradient-success {
    @apply bg-gradient-to-r from-success-500 to-success-700;
  }

  .bg-gradient-danger {
    @apply bg-gradient-to-r from-danger-500 to-danger-700;
  }
}
```

### Step 6: Create Button Component
Create `frontend/src/lib/components/Button.svelte`:

```svelte
<script lang="ts">
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let variant: 'primary' | 'secondary' | 'success' | 'danger' | 'outline' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled: boolean = false;
  export let loading: boolean = false;
  export let fullWidth: boolean = false;

  $: variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    success: 'btn-success',
    danger: 'btn-danger',
    outline: 'btn-outline'
  }[variant];

  $: sizeClass = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3'
  }[size];

  $: widthClass = fullWidth ? 'w-full' : '';
</script>

<button
  {type}
  {disabled}
  disabled={disabled || loading}
  class="btn {variantClass} {sizeClass} {widthClass}"
  on:click
>
  {#if loading}
    <svg class="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  {/if}
  <slot />
</button>
```

### Step 7: Create Card Component
Create `frontend/src/lib/components/Card.svelte`:

```svelte
<script lang="ts">
  export let title: string = '';
  export let shadow: 'sm' | 'md' | 'lg' | 'xl' | 'none' = 'md';
  export let padding: boolean = true;

  $: shadowClass = {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
    none: ''
  }[shadow];

  $: paddingClass = padding ? 'p-6' : '';
</script>

<div class="bg-white rounded-lg {shadowClass} {paddingClass}">
  {#if title}
    <div class="card-header">
      <h3 class="card-title">{title}</h3>
    </div>
  {/if}
  <slot />
</div>
```

### Step 8: Update Home Page with Tailwind
Update `frontend/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { config } from '$lib/config';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
</script>

<svelte:head>
  <title>{config.app.name}</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-8 text-center">
      <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-4 animate-fade-in">
        {config.app.name}
      </h1>
      <p class="text-lg text-gray-600 animate-slide-up animate-delayed">
        Self-hosted envelope budgeting application
      </p>
    </div>

    <!-- Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
      <Card title="Frontend Status">
        <div class="space-y-2">
          <div class="flex items-center">
            <span class="w-3 h-3 bg-success-500 rounded-full mr-2 animate-pulse"></span>
            <span class="text-success-700 font-medium">SvelteKit initialized</span>
          </div>
          <div class="flex items-center">
            <span class="w-3 h-3 bg-success-500 rounded-full mr-2 animate-pulse"></span>
            <span class="text-success-700 font-medium">Tailwind CSS configured</span>
          </div>
          <div class="mt-4 space-y-1">
            <p class="text-sm text-gray-600">Version: {config.app.version}</p>
            <p class="text-sm text-gray-600">Environment: <span class="badge badge-primary">{config.app.environment}</span></p>
          </div>
        </div>
      </Card>

      <Card title="API Configuration">
        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2 text-sm">
            <span class="text-gray-600">Base URL:</span>
            <span class="font-mono text-gray-800">{config.api.baseUrl}</span>
            <span class="text-gray-600">Timeout:</span>
            <span class="font-mono text-gray-800">{config.api.timeout}ms</span>
            <span class="text-gray-600">Retry Attempts:</span>
            <span class="font-mono text-gray-800">{config.api.retryAttempts}</span>
          </div>
        </div>
      </Card>
    </div>

    <!-- Component Examples -->
    <Card title="Component Gallery" shadow="lg">
      <div class="space-y-6">
        <!-- Buttons Section -->
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-3">Buttons</h4>
          <div class="flex flex-wrap gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="success">Success</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="primary" loading={true}>Loading</Button>
            <Button variant="primary" disabled={true}>Disabled</Button>
          </div>
        </div>

        <!-- Badges Section -->
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-3">Badges</h4>
          <div class="flex flex-wrap gap-2">
            <span class="badge badge-primary">Primary</span>
            <span class="badge badge-success">Success</span>
            <span class="badge badge-warning">Warning</span>
            <span class="badge badge-danger">Danger</span>
          </div>
        </div>

        <!-- Alerts Section -->
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-3">Alerts</h4>
          <div class="space-y-2">
            <div class="alert alert-info">
              <strong>Info:</strong> Tailwind CSS is now configured and ready to use.
            </div>
            <div class="alert alert-success">
              <strong>Success:</strong> All components are rendering correctly.
            </div>
          </div>
        </div>

        <!-- Typography Section -->
        <div>
          <h4 class="text-sm font-medium text-gray-700 mb-3">Typography</h4>
          <div class="prose prose-sm max-w-none">
            <p>The Budget Tool uses a carefully selected typography scale with the Inter font family for optimal readability.</p>
          </div>
        </div>
      </div>
    </Card>
  </div>
</main>
```

### Step 9: Update Layout with Global Styles
Update `frontend/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';
</script>

<div class="min-h-screen bg-gray-50">
  <slot />
</div>
```

### Step 10: Create Component Test
Create `frontend/src/lib/components/Button.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Button from './Button.svelte';

describe('Button Component', () => {
  it('renders with default props', () => {
    const { container } = render(Button, {
      props: {
        children: 'Click me'
      }
    });
    const button = container.querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.className).toContain('btn-primary');
  });

  it('applies variant classes correctly', () => {
    const { container } = render(Button, {
      props: {
        variant: 'success',
        children: 'Success'
      }
    });
    const button = container.querySelector('button');
    expect(button?.className).toContain('btn-success');
  });

  it('disables button when disabled prop is true', () => {
    const { container } = render(Button, {
      props: {
        disabled: true,
        children: 'Disabled'
      }
    });
    const button = container.querySelector('button');
    expect(button?.disabled).toBe(true);
  });

  it('shows loading spinner when loading is true', () => {
    const { container } = render(Button, {
      props: {
        loading: true,
        children: 'Loading'
      }
    });
    const spinner = container.querySelector('svg');
    expect(spinner).toBeTruthy();
    expect(spinner?.className).toContain('animate-spin');
  });
});
```

### Step 11: Install Testing Library
Install testing utilities for component tests:

```bash
npm install -D @testing-library/svelte @testing-library/jest-dom jsdom
```

### Step 12: Update Vite Test Config
Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts']
  }
});
```

### Step 13: Create Test Setup
Create `frontend/src/test-setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

### Step 14: Verify Tailwind Build
Run the build command to ensure Tailwind is working correctly:

```bash
npm run build
```

## Expected File Structure
After completing this task, you should have:

```
frontend/
├── tailwind.config.js
├── postcss.config.js
├── vitest.config.ts
├── src/
│   ├── app.css (updated with Tailwind)
│   ├── test-setup.ts
│   ├── lib/
│   │   └── components/
│   │       ├── Button.svelte
│   │       ├── Button.test.ts
│   │       └── Card.svelte
│   └── routes/
│       └── +page.svelte (updated with Tailwind classes)
└── package.json (with new dependencies)
```

## Success Criteria
- [ ] Tailwind CSS installed and configured
- [ ] PostCSS configured for processing Tailwind
- [ ] Custom Tailwind configuration with theme extensions
- [ ] Utility classes working in components
- [ ] Component library started (Button, Card)
- [ ] Typography and form plugins configured
- [ ] Build process successfully purges unused CSS
- [ ] Component tests pass
- [ ] Development server shows styled components
- [ ] Production build size is optimized

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Navigate to frontend directory
cd frontend

# Check that Tailwind is processing correctly
npm run dev
# Visit http://localhost:3000 and verify styling

# Run component tests
npm run test:unit

# Build for production and check file sizes
npm run build
du -sh .svelte-kit/output/client/_app/immutable/assets/*.css

# Verify Tailwind config
npx tailwindcss --help

# Check for any CSS processing errors
npm run check
```

## Troubleshooting
- If styles aren't applying, ensure `app.css` is imported in `+layout.svelte`
- If Tailwind classes aren't recognized, check the content paths in `tailwind.config.js`
- Clear the `.svelte-kit` directory if you see stale styles: `rm -rf .svelte-kit`
- If the build size is large, verify the content paths are correct for purging
- Restart the dev server after modifying Tailwind configuration
- If PostCSS errors occur, ensure all PostCSS plugins are installed

## Notes
- Tailwind uses JIT (Just-In-Time) mode by default for optimal performance
- Custom color palette extends Tailwind's defaults for the Budget Tool brand
- Component classes are defined in the @layer components for organization
- The configuration includes responsive breakpoints and custom animations
- Form and typography plugins provide enhanced styling for common elements

## Next Steps
After completing this task, proceed to:
- Task 13: Create API client service structure
- Task 14: Implement base layout and routing