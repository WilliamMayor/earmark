# Task 14: Implement Base Layout and Routing

## Context
This task creates the base layout structure and routing system for the Budget Tool MVP frontend. It establishes the navigation framework, page layouts, and route guards that will be used throughout the application. The layout provides consistent header, navigation, and footer elements while the routing system enables smooth navigation between different sections of the application.

## Objectives
- Create a responsive navigation header with menu
- Implement a sidebar layout for the main application
- Set up route-based layouts for different page types
- Create navigation guards and loading states
- Implement breadcrumb navigation
- Set up error boundary pages (404, error)

## Prerequisites
- Task 11 completed (SvelteKit initialized)
- Task 12 completed (Tailwind CSS configured)
- Task 13 completed (API client created)
- Components (Button, Card) available
- Development server running

## Task Instructions

### Step 1: Create Navigation Store
Create `frontend/src/lib/stores/navigation.ts`:

```typescript
import { writable, derived } from 'svelte/store';
import { page } from '$app/stores';

export interface NavigationItem {
  label: string;
  href: string;
  icon?: string;
  badge?: number;
  children?: NavigationItem[];
}

const navigationItems: NavigationItem[] = [
  {
    label: 'Dashboard',
    href: '/',
    icon: 'home'
  },
  {
    label: 'Envelopes',
    href: '/envelopes',
    icon: 'folder'
  },
  {
    label: 'Transactions',
    href: '/transactions',
    icon: 'credit-card'
  },
  {
    label: 'Import',
    href: '/import',
    icon: 'upload'
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: 'settings'
  }
];

function createNavigationStore() {
  const { subscribe, set, update } = writable({
    items: navigationItems,
    isOpen: false,
    isMobileMenuOpen: false
  });

  return {
    subscribe,
    toggleSidebar: () => update(state => ({ 
      ...state, 
      isOpen: !state.isOpen 
    })),
    toggleMobileMenu: () => update(state => ({ 
      ...state, 
      isMobileMenuOpen: !state.isMobileMenuOpen 
    })),
    closeMobileMenu: () => update(state => ({ 
      ...state, 
      isMobileMenuOpen: false 
    })),
    setItems: (items: NavigationItem[]) => update(state => ({ 
      ...state, 
      items 
    }))
  };
}

export const navigation = createNavigationStore();

// Derived store for current route
export const currentRoute = derived(
  page,
  $page => $page.url.pathname
);
```

### Step 2: Create Icon Component
Create `frontend/src/lib/components/Icon.svelte`:

```svelte
<script lang="ts">
  export let name: string;
  export let size: number = 20;
  export let className: string = '';
</script>

{#if name === 'home'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
{:else if name === 'folder'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
{:else if name === 'credit-card'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
    <line x1="1" y1="10" x2="23" y2="10"></line>
  </svg>
{:else if name === 'upload'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="17 8 12 3 7 8"></polyline>
    <line x1="12" y1="3" x2="12" y2="15"></line>
  </svg>
{:else if name === 'settings'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M12 1v6m0 6v6m4.22-13.22 4.24 4.24M1.54 12h6m6 0h6m-13.22 4.22 4.24 4.24"></path>
  </svg>
{:else if name === 'menu'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
{:else if name === 'x'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
{:else if name === 'chevron-right'}
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class={className}>
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
{:else}
  <span class={className}>?</span>
{/if}
```

### Step 3: Create Header Component
Create `frontend/src/lib/components/Header.svelte`:

```svelte
<script lang="ts">
  import { navigation } from '$lib/stores/navigation';
  import { config } from '$lib/config';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';

  function toggleMobileMenu() {
    navigation.toggleMobileMenu();
  }
</script>

<header class="bg-white border-b border-gray-200 sticky top-0 z-40">
  <div class="px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between h-16">
      <!-- Logo and Title -->
      <div class="flex items-center">
        <button
          on:click={toggleMobileMenu}
          class="md:hidden p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
        >
          <Icon name="menu" />
        </button>
        <div class="ml-4 md:ml-0">
          <h1 class="text-xl font-semibold text-gray-900">{config.app.name}</h1>
        </div>
      </div>

      <!-- Right side actions -->
      <div class="flex items-center space-x-4">
        <span class="text-sm text-gray-500">v{config.app.version}</span>
      </div>
    </div>
  </div>
</header>
```

### Step 4: Create Sidebar Component
Create `frontend/src/lib/components/Sidebar.svelte`:

```svelte
<script lang="ts">
  import { navigation, currentRoute } from '$lib/stores/navigation';
  import Icon from './Icon.svelte';
  
  $: isOpen = $navigation.isOpen;
  $: items = $navigation.items;
  $: activeRoute = $currentRoute;

  function isActive(href: string): boolean {
    if (href === '/') {
      return activeRoute === href;
    }
    return activeRoute.startsWith(href);
  }
</script>

<!-- Desktop Sidebar -->
<aside class="hidden md:flex md:flex-shrink-0">
  <div class="flex flex-col w-64">
    <div class="flex flex-col flex-grow bg-white border-r border-gray-200 overflow-y-auto">
      <nav class="flex-1 px-2 py-4 space-y-1">
        {#each items as item}
          <a
            href={item.href}
            class="group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                   {isActive(item.href) 
                     ? 'bg-primary-50 text-primary-700 border-l-4 border-primary-500' 
                     : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}"
          >
            {#if item.icon}
              <Icon name={item.icon} size={18} className="mr-3 flex-shrink-0" />
            {/if}
            <span class="flex-1">{item.label}</span>
            {#if item.badge}
              <span class="badge badge-primary ml-auto">{item.badge}</span>
            {/if}
          </a>
        {/each}
      </nav>
    </div>
  </div>
</aside>

<!-- Mobile Sidebar -->
{#if $navigation.isMobileMenuOpen}
  <div class="md:hidden fixed inset-0 z-50 flex">
    <!-- Backdrop -->
    <button
      class="fixed inset-0 bg-gray-600 bg-opacity-75"
      on:click={() => navigation.closeMobileMenu()}
      aria-label="Close menu"
    ></button>

    <!-- Sidebar -->
    <div class="relative flex-1 flex flex-col max-w-xs w-full bg-white">
      <div class="absolute top-0 right-0 -mr-12 pt-2">
        <button
          on:click={() => navigation.closeMobileMenu()}
          class="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
        >
          <Icon name="x" className="text-white" />
        </button>
      </div>
      
      <div class="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
        <nav class="px-2 space-y-1">
          {#each items as item}
            <a
              href={item.href}
              on:click={() => navigation.closeMobileMenu()}
              class="group flex items-center px-3 py-2 text-base font-medium rounded-md
                     {isActive(item.href) 
                       ? 'bg-primary-50 text-primary-700' 
                       : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}"
            >
              {#if item.icon}
                <Icon name={item.icon} size={20} className="mr-3 flex-shrink-0" />
              {/if}
              <span class="flex-1">{item.label}</span>
              {#if item.badge}
                <span class="badge badge-primary ml-auto">{item.badge}</span>
              {/if}
            </a>
          {/each}
        </nav>
      </div>
    </div>
  </div>
{/if}
```

### Step 5: Create Breadcrumb Component
Create `frontend/src/lib/components/Breadcrumb.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import Icon from './Icon.svelte';

  interface BreadcrumbItem {
    label: string;
    href?: string;
  }

  $: breadcrumbs = generateBreadcrumbs($page.url.pathname);

  function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
    const segments = pathname.split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];

    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
      
      items.push({
        label,
        href: index === segments.length - 1 ? undefined : currentPath
      });
    });

    return items;
  }
</script>

{#if breadcrumbs.length > 1}
  <nav class="flex mb-4" aria-label="Breadcrumb">
    <ol class="inline-flex items-center space-x-1 text-sm">
      {#each breadcrumbs as item, i}
        <li class="inline-flex items-center">
          {#if i > 0}
            <Icon name="chevron-right" size={16} className="mx-1 text-gray-400" />
          {/if}
          {#if item.href}
            <a href={item.href} class="text-gray-500 hover:text-gray-700">
              {item.label}
            </a>
          {:else}
            <span class="text-gray-900 font-medium">{item.label}</span>
          {/if}
        </li>
      {/each}
    </ol>
  </nav>
{/if}
```

### Step 6: Update Main Layout
Update `frontend/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import Header from '$lib/components/Header.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  
  // Determine if we should show the app layout
  $: showAppLayout = !$page.url.pathname.startsWith('/auth');
</script>

{#if showAppLayout}
  <div class="min-h-screen bg-gray-50">
    <Header />
    <div class="flex h-[calc(100vh-4rem)]">
      <Sidebar />
      <main class="flex-1 overflow-y-auto">
        <div class="px-4 sm:px-6 lg:px-8 py-6">
          <Breadcrumb />
          <slot />
        </div>
      </main>
    </div>
  </div>
{:else}
  <!-- Auth pages layout -->
  <div class="min-h-screen bg-gray-50 flex items-center justify-center">
    <slot />
  </div>
{/if}
```

### Step 7: Create Dashboard Page
Update `frontend/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { config } from '$lib/config';
  import Card from '$lib/components/Card.svelte';
  import Button from '$lib/components/Button.svelte';
</script>

<svelte:head>
  <title>Dashboard - {config.app.name}</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-2xl font-bold text-gray-900">Dashboard</h2>
    <p class="mt-1 text-sm text-gray-600">
      Welcome to your budget management dashboard
    </p>
  </div>

  <!-- Quick Stats -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    <Card padding={false}>
      <div class="p-6">
        <dt class="text-sm font-medium text-gray-500 truncate">Total Balance</dt>
        <dd class="mt-1 text-3xl font-semibold text-gray-900">$0.00</dd>
      </div>
    </Card>
    <Card padding={false}>
      <div class="p-6">
        <dt class="text-sm font-medium text-gray-500 truncate">Active Envelopes</dt>
        <dd class="mt-1 text-3xl font-semibold text-gray-900">0</dd>
      </div>
    </Card>
    <Card padding={false}>
      <div class="p-6">
        <dt class="text-sm font-medium text-gray-500 truncate">Pending Transactions</dt>
        <dd class="mt-1 text-3xl font-semibold text-gray-900">0</dd>
      </div>
    </Card>
    <Card padding={false}>
      <div class="p-6">
        <dt class="text-sm font-medium text-gray-500 truncate">This Month</dt>
        <dd class="mt-1 text-3xl font-semibold text-gray-900">$0.00</dd>
      </div>
    </Card>
  </div>

  <!-- Quick Actions -->
  <Card title="Quick Actions">
    <div class="flex flex-wrap gap-2">
      <Button variant="primary">Import Transactions</Button>
      <Button variant="secondary">New Envelope</Button>
      <Button variant="secondary">Transfer Funds</Button>
    </div>
  </Card>

  <!-- Recent Activity -->
  <Card title="Recent Activity">
    <div class="text-center py-8 text-gray-500">
      No recent activity to display
    </div>
  </Card>
</div>
```

### Step 8: Create Placeholder Pages
Create `frontend/src/routes/envelopes/+page.svelte`:

```svelte
<script lang="ts">
  import Card from '$lib/components/Card.svelte';
</script>

<svelte:head>
  <title>Envelopes - Budget Tool</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-2xl font-bold text-gray-900">Envelopes</h2>
    <p class="mt-1 text-sm text-gray-600">Manage your budget envelopes</p>
  </div>

  <Card>
    <p class="text-gray-500 text-center py-8">
      Envelope management will be implemented in Phase 3
    </p>
  </Card>
</div>
```

Create `frontend/src/routes/transactions/+page.svelte`:

```svelte
<script lang="ts">
  import Card from '$lib/components/Card.svelte';
</script>

<svelte:head>
  <title>Transactions - Budget Tool</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h2 class="text-2xl font-bold text-gray-900">Transactions</h2>
    <p class="mt-1 text-sm text-gray-600">View and manage your transactions</p>
  </div>

  <Card>
    <p class="text-gray-500 text-center py-8">
      Transaction management will be implemented in Phase 4
    </p>
  </Card>
</div>
```

### Step 9: Create 404 Error Page
Create `frontend/src/routes/+error.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import Button from '$lib/components/Button.svelte';
</script>

<div class="min-h-screen bg-gray-50 px-4 py-16 sm:px-6 sm:py-24 md:grid md:place-items-center lg:px-8">
  <div class="max-w-max mx-auto">
    <main class="sm:flex">
      <p class="text-4xl font-extrabold text-primary-600 sm:text-5xl">
        {$page.status}
      </p>
      <div class="sm:ml-6">
        <div class="sm:border-l sm:border-gray-200 sm:pl-6">
          <h1 class="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
            {$page.status === 404 ? 'Page not found' : 'Error occurred'}
          </h1>
          <p class="mt-1 text-base text-gray-500">
            {$page.error?.message || 'Please check the URL and try again.'}
          </p>
        </div>
        <div class="mt-10 flex space-x-3 sm:border-l sm:border-transparent sm:pl-6">
          <Button variant="primary" on:click={() => window.location.href = '/'}>
            Go back home
          </Button>
        </div>
      </div>
    </main>
  </div>
</div>
```

### Step 10: Create Loading Component
Create `frontend/src/lib/components/Loading.svelte`:

```svelte
<script lang="ts">
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let centered: boolean = true;

  $: sizeClass = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  }[size];
</script>

<div class:flex={centered} class:items-center={centered} class:justify-center={centered} class:min-h-[200px]={centered}>
  <svg class="animate-spin {sizeClass} text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
</div>
```

## Expected File Structure
After completing this task:

```
frontend/src/
├── lib/
│   ├── stores/
│   │   └── navigation.ts
│   ├── components/
│   │   ├── Header.svelte
│   │   ├── Sidebar.svelte
│   │   ├── Breadcrumb.svelte
│   │   ├── Icon.svelte
│   │   └── Loading.svelte
├── routes/
│   ├── +layout.svelte (updated)
│   ├── +page.svelte (updated dashboard)
│   ├── +error.svelte
│   ├── envelopes/
│   │   └── +page.svelte
│   └── transactions/
│       └── +page.svelte
```

## Success Criteria
- [ ] Navigation header displays correctly
- [ ] Sidebar shows on desktop, hamburger menu on mobile
- [ ] Navigation items highlight based on current route
- [ ] Breadcrumb navigation works correctly
- [ ] Layout adapts responsively to screen size
- [ ] Mobile menu opens and closes properly
- [ ] Dashboard page displays with stats cards
- [ ] Placeholder pages for main sections created
- [ ] Error page handles 404 and other errors
- [ ] Loading component available for async operations

## Validation Commands
```bash
# Navigate to frontend
cd frontend

# Start development server
npm run dev

# Test navigation:
# - Visit http://localhost:3000 (Dashboard)
# - Click on Envelopes link
# - Click on Transactions link
# - Try a non-existent URL for 404
# - Test mobile menu (resize browser)

# Check TypeScript
npm run check

# Run tests
npm run test:unit
```

## Troubleshooting
- If sidebar doesn't show, check that stores are properly imported
- If navigation active state is wrong, verify the isActive function logic
- Clear browser cache if styles seem incorrect
- If mobile menu doesn't work, check z-index values
- Ensure all Icon names are handled in the Icon component

## Notes
- The layout adapts based on route (e.g., auth pages get different layout)
- Navigation store manages both desktop and mobile menu states
- Breadcrumbs are automatically generated from URL path
- The sidebar uses a sliding panel pattern on mobile
- Dashboard provides quick access to common actions

## Next Steps
After completing this task, proceed to:
- Task 15: Create frontend Dockerfile
- Task 16: Set up Vitest for component testing