# Task 13: Create API Client Service Structure

## Context
This task creates the API client service layer for the SvelteKit frontend of the Budget Tool MVP. The API client provides a centralized, type-safe way to communicate with the FastAPI backend. It includes error handling, retry logic, request/response interceptors, and proper TypeScript types for all API operations.

## Objectives
- Create a robust API client using the Fetch API
- Implement error handling and retry logic
- Set up request/response interceptors
- Create type-safe API methods for future endpoints
- Implement proper authentication header handling
- Set up request cancellation support

## Prerequisites
- Task 11 completed (SvelteKit initialized)
- Task 12 completed (Tailwind CSS configured)
- TypeScript configuration in place
- Frontend development server working

## Task Instructions

### Step 1: Create Base HTTP Client
Create `frontend/src/lib/api/client.ts`:

```typescript
import { config } from '$lib/config';
import type { ApiResponse, ApiError } from '$lib/types';

export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`HTTP ${status}: ${statusText}`);
    this.name = 'HttpError';
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
  timeout?: number;
  retry?: number;
  retryDelay?: number;
}

export class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;
  private defaultRetryAttempts: number;
  private defaultRetryDelay: number;
  private abortControllers: Map<string, AbortController>;

  constructor(
    baseUrl: string = config.api.baseUrl,
    options: {
      timeout?: number;
      retryAttempts?: number;
      retryDelay?: number;
    } = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultTimeout = options.timeout || config.api.timeout;
    this.defaultRetryAttempts = options.retryAttempts || config.api.retryAttempts;
    this.defaultRetryDelay = options.retryDelay || config.api.retryDelay;
    this.abortControllers = new Map();
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, string | number | boolean>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    
    return url.toString();
  }

  /**
   * Create abort controller for request cancellation
   */
  private createAbortController(key: string): AbortController {
    // Cancel any existing request with the same key
    this.cancelRequest(key);
    
    const controller = new AbortController();
    this.abortControllers.set(key, controller);
    return controller;
  }

  /**
   * Cancel a specific request
   */
  public cancelRequest(key: string): void {
    const controller = this.abortControllers.get(key);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(key);
    }
  }

  /**
   * Cancel all pending requests
   */
  public cancelAllRequests(): void {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeRequest<T>(
    url: string,
    options: RequestOptions = {},
    retryCount: number = 0
  ): Promise<T> {
    const {
      timeout = this.defaultTimeout,
      retry = this.defaultRetryAttempts,
      retryDelay = this.defaultRetryDelay,
      signal,
      ...fetchOptions
    } = options;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeout);
    });

    try {
      // Make the request with timeout
      const response = await Promise.race([
        fetch(url, { ...fetchOptions, signal }),
        timeoutPromise
      ]) as Response;

      // Check if response is ok
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new HttpError(response.status, response.statusText, errorData);
      }

      // Parse response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text() as T;
    } catch (error) {
      // Handle retry logic
      if (retryCount < retry && this.shouldRetry(error)) {
        await this.sleep(retryDelay * Math.pow(2, retryCount)); // Exponential backoff
        return this.makeRequest<T>(url, options, retryCount + 1);
      }
      
      throw error;
    }
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry(error: unknown): boolean {
    if (error instanceof HttpError) {
      // Retry on 5xx errors and specific 4xx errors
      return error.status >= 500 || error.status === 408 || error.status === 429;
    }
    
    // Retry on network errors
    return error instanceof TypeError && error.message === 'Failed to fetch';
  }

  /**
   * GET request
   */
  public async get<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, ...requestOptions } = options;
    const url = this.buildUrl(path, params);
    const requestKey = `GET:${path}`;
    const controller = this.createAbortController(requestKey);

    try {
      const data = await this.makeRequest<T>(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...requestOptions.headers
        },
        ...requestOptions
      });

      this.abortControllers.delete(requestKey);
      return { success: true, data };
    } catch (error) {
      this.abortControllers.delete(requestKey);
      return this.handleError<T>(error);
    }
  }

  /**
   * POST request
   */
  public async post<T>(
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, ...requestOptions } = options;
    const url = this.buildUrl(path, params);
    const requestKey = `POST:${path}`;
    const controller = this.createAbortController(requestKey);

    try {
      const data = await this.makeRequest<T>(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...requestOptions.headers
        },
        body: body ? JSON.stringify(body) : undefined,
        ...requestOptions
      });

      this.abortControllers.delete(requestKey);
      return { success: true, data };
    } catch (error) {
      this.abortControllers.delete(requestKey);
      return this.handleError<T>(error);
    }
  }

  /**
   * PUT request
   */
  public async put<T>(
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, ...requestOptions } = options;
    const url = this.buildUrl(path, params);
    const requestKey = `PUT:${path}`;
    const controller = this.createAbortController(requestKey);

    try {
      const data = await this.makeRequest<T>(url, {
        method: 'PUT',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...requestOptions.headers
        },
        body: body ? JSON.stringify(body) : undefined,
        ...requestOptions
      });

      this.abortControllers.delete(requestKey);
      return { success: true, data };
    } catch (error) {
      this.abortControllers.delete(requestKey);
      return this.handleError<T>(error);
    }
  }

  /**
   * DELETE request
   */
  public async delete<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, ...requestOptions } = options;
    const url = this.buildUrl(path, params);
    const requestKey = `DELETE:${path}`;
    const controller = this.createAbortController(requestKey);

    try {
      const data = await this.makeRequest<T>(url, {
        method: 'DELETE',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          ...requestOptions.headers
        },
        ...requestOptions
      });

      this.abortControllers.delete(requestKey);
      return { success: true, data };
    } catch (error) {
      this.abortControllers.delete(requestKey);
      return this.handleError<T>(error);
    }
  }

  /**
   * Handle errors and format response
   */
  private handleError<T>(error: unknown): ApiResponse<T> {
    if (error instanceof HttpError) {
      const apiError: ApiError = {
        message: error.message,
        code: String(error.status),
        details: error.data as Record<string, unknown>
      };
      return { success: false, error: apiError };
    }

    if (error instanceof Error) {
      const apiError: ApiError = {
        message: error.message,
        code: 'NETWORK_ERROR'
      };
      return { success: false, error: apiError };
    }

    return {
      success: false,
      error: {
        message: 'An unexpected error occurred',
        code: 'UNKNOWN_ERROR'
      }
    };
  }
}

// Create singleton instance
export const apiClient = new ApiClient();
```

### Step 2: Create Health Check Service
Create `frontend/src/lib/api/health.ts`:

```typescript
import { apiClient } from './client';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  version: string;
  timestamp: string;
  services?: {
    api: boolean;
    ledger: boolean;
  };
}

export const healthApi = {
  /**
   * Check API health status
   */
  async checkHealth(): Promise<HealthStatus> {
    const response = await apiClient.get<HealthStatus>('/health');
    
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to check health');
    }
    
    return response.data;
  },

  /**
   * Check API readiness
   */
  async checkReady(): Promise<boolean> {
    const response = await apiClient.get<{ ready: boolean }>('/ready');
    
    if (!response.success || !response.data) {
      return false;
    }
    
    return response.data.ready;
  }
};
```

### Step 3: Create Envelope API Service (Placeholder)
Create `frontend/src/lib/api/envelopes.ts`:

```typescript
import { apiClient } from './client';
import type { Envelope, PaginatedResponse } from '$lib/types';

export interface CreateEnvelopeRequest {
  name: string;
  type: 'monthly' | 'annual' | 'goal' | 'default';
  goalAmount?: number;
  description?: string;
}

export interface UpdateEnvelopeRequest {
  name?: string;
  goalAmount?: number;
  description?: string;
}

export const envelopeApi = {
  /**
   * Get all envelopes
   */
  async list(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<PaginatedResponse<Envelope>> {
    const response = await apiClient.get<PaginatedResponse<Envelope>>('/api/envelopes', {
      params
    });
    
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch envelopes');
    }
    
    return response.data;
  },

  /**
   * Get single envelope by ID
   */
  async get(id: string): Promise<Envelope> {
    const response = await apiClient.get<Envelope>(`/api/envelopes/${id}`);
    
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to fetch envelope');
    }
    
    return response.data;
  },

  /**
   * Create new envelope
   */
  async create(data: CreateEnvelopeRequest): Promise<Envelope> {
    const response = await apiClient.post<Envelope>('/api/envelopes', data);
    
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to create envelope');
    }
    
    return response.data;
  },

  /**
   * Update envelope
   */
  async update(id: string, data: UpdateEnvelopeRequest): Promise<Envelope> {
    const response = await apiClient.put<Envelope>(`/api/envelopes/${id}`, data);
    
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || 'Failed to update envelope');
    }
    
    return response.data;
  },

  /**
   * Delete envelope
   */
  async delete(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/envelopes/${id}`);
    
    if (!response.success) {
      throw new Error(response.error?.message || 'Failed to delete envelope');
    }
  }
};
```

### Step 4: Create API Index File
Create `frontend/src/lib/api/index.ts`:

```typescript
export { apiClient, HttpError, type RequestOptions } from './client';
export { healthApi } from './health';
export { envelopeApi } from './envelopes';

// Re-export all API services
export const api = {
  health: healthApi,
  envelopes: envelopeApi
} as const;
```

### Step 5: Create API Store
Create `frontend/src/lib/stores/api.ts`:

```typescript
import { writable, derived } from 'svelte/store';
import type { ApiError } from '$lib/types';

interface ApiState {
  loading: boolean;
  error: ApiError | null;
  requestCount: number;
}

function createApiStore() {
  const { subscribe, set, update } = writable<ApiState>({
    loading: false,
    error: null,
    requestCount: 0
  });

  return {
    subscribe,
    startRequest: () => update(state => ({
      ...state,
      loading: true,
      error: null,
      requestCount: state.requestCount + 1
    })),
    endRequest: () => update(state => ({
      ...state,
      loading: state.requestCount <= 1 ? false : state.loading,
      requestCount: Math.max(0, state.requestCount - 1)
    })),
    setError: (error: ApiError | null) => update(state => ({
      ...state,
      error,
      loading: false
    })),
    reset: () => set({
      loading: false,
      error: null,
      requestCount: 0
    })
  };
}

export const apiStore = createApiStore();

// Derived store for global loading state
export const isLoading = derived(
  apiStore,
  $apiStore => $apiStore.loading
);

// Derived store for current error
export const currentError = derived(
  apiStore,
  $apiStore => $apiStore.error
);
```

### Step 6: Create API Hook
Create `frontend/src/lib/hooks/useApi.ts`:

```typescript
import { apiStore } from '$lib/stores/api';
import type { ApiResponse } from '$lib/types';

export interface UseApiOptions {
  showError?: boolean;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export function useApi() {
  async function execute<T>(
    apiCall: () => Promise<T>,
    options: UseApiOptions = {}
  ): Promise<T | null> {
    const { showError = true, onSuccess, onError } = options;
    
    apiStore.startRequest();
    
    try {
      const result = await apiCall();
      apiStore.endRequest();
      onSuccess?.();
      return result;
    } catch (error) {
      apiStore.endRequest();
      
      if (showError) {
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        apiStore.setError({
          message: errorMessage,
          code: 'API_ERROR'
        });
      }
      
      onError?.(error);
      return null;
    }
  }
  
  return {
    execute,
    loading: isLoading,
    error: currentError,
    clearError: () => apiStore.setError(null)
  };
}
```

### Step 7: Create Test for API Client
Create `frontend/src/lib/api/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './client';

// Mock fetch
global.fetch = vi.fn();

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:8000', {
      timeout: 5000,
      retryAttempts: 2,
      retryDelay: 100
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    client.cancelAllRequests();
  });

  describe('GET requests', () => {
    it('should make successful GET request', async () => {
      const mockData = { id: 1, name: 'Test' };
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const response = await client.get('/test');
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json'
          })
        })
      );
    });

    it('should handle GET request with query params', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      await client.get('/test', {
        params: { page: 1, search: 'test' }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/test?page=1&search=test',
        expect.any(Object)
      );
    });
  });

  describe('POST requests', () => {
    it('should make successful POST request', async () => {
      const mockData = { id: 1, created: true };
      const postData = { name: 'New Item' };
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockData,
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const response = await client.post('/test', postData);
      
      expect(response.success).toBe(true);
      expect(response.data).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8000/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle HTTP errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ detail: 'Resource not found' }),
        headers: new Headers({ 'content-type': 'application/json' })
      });

      const response = await client.get('/test');
      
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('404');
    });

    it('should retry on 5xx errors', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({}),
          headers: new Headers()
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
          headers: new Headers({ 'content-type': 'application/json' })
        });

      const response = await client.get('/test');
      
      expect(response.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Request cancellation', () => {
    it('should cancel specific request', () => {
      const abortSpy = vi.fn();
      const mockController = { abort: abortSpy, signal: {} as AbortSignal };
      
      (client as any).abortControllers.set('GET:/test', mockController);
      
      client.cancelRequest('GET:/test');
      
      expect(abortSpy).toHaveBeenCalled();
      expect((client as any).abortControllers.has('GET:/test')).toBe(false);
    });

    it('should cancel all requests', () => {
      const abortSpy1 = vi.fn();
      const abortSpy2 = vi.fn();
      
      (client as any).abortControllers.set('GET:/test1', {
        abort: abortSpy1,
        signal: {} as AbortSignal
      });
      (client as any).abortControllers.set('GET:/test2', {
        abort: abortSpy2,
        signal: {} as AbortSignal
      });
      
      client.cancelAllRequests();
      
      expect(abortSpy1).toHaveBeenCalled();
      expect(abortSpy2).toHaveBeenCalled();
      expect((client as any).abortControllers.size).toBe(0);
    });
  });
});
```

### Step 8: Verify API Client
Create a test page `frontend/src/routes/test-api/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';

  let healthStatus: any = null;
  let loading = false;
  let error: string | null = null;

  async function checkHealth() {
    loading = true;
    error = null;
    
    try {
      healthStatus = await api.health.checkHealth();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to check health';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    checkHealth();
  });
</script>

<main class="container mx-auto px-4 py-8">
  <Card title="API Client Test">
    <div class="space-y-4">
      <div class="flex gap-2">
        <Button on:click={checkHealth} {loading}>
          {loading ? 'Checking...' : 'Check Health'}
        </Button>
      </div>

      {#if error}
        <div class="alert alert-danger">
          {error}
        </div>
      {/if}

      {#if healthStatus}
        <div class="bg-gray-50 p-4 rounded-lg">
          <pre class="text-sm">{JSON.stringify(healthStatus, null, 2)}</pre>
        </div>
      {/if}
    </div>
  </Card>
</main>
```

## Expected File Structure
After completing this task:

```
frontend/src/lib/
├── api/
│   ├── client.ts
│   ├── client.test.ts
│   ├── health.ts
│   ├── envelopes.ts
│   └── index.ts
├── stores/
│   └── api.ts
├── hooks/
│   └── useApi.ts
└── routes/
    └── test-api/
        └── +page.svelte
```

## Success Criteria
- [ ] API client class implemented with all HTTP methods
- [ ] Error handling and retry logic working
- [ ] Request cancellation support implemented
- [ ] Type-safe API methods created
- [ ] Health check API service created
- [ ] Envelope API service scaffolded
- [ ] API store for global state management
- [ ] useApi hook for components
- [ ] Tests passing for API client
- [ ] Test page successfully calls API

## Validation Commands
```bash
# Navigate to frontend
cd frontend

# Run tests
npm run test:unit

# Start dev server
npm run dev

# Visit http://localhost:3000/test-api to test API client

# Check TypeScript types
npm run check
```

## Troubleshooting
- If fetch is not defined in tests, ensure vitest environment is set to 'jsdom'
- If types are not recognized, run `npm run check` to sync TypeScript
- Clear browser cache if API calls seem cached
- Check CORS settings if API calls fail with CORS errors
- Ensure backend is running when testing the API client

## Notes
- API client uses singleton pattern for consistent configuration
- Retry logic uses exponential backoff to avoid overwhelming the server
- Request cancellation prevents memory leaks and race conditions
- All API methods return consistent ApiResponse type for error handling
- Store pattern allows global loading states and error handling

## Next Steps
After completing this task, proceed to:
- Task 14: Implement base layout and routing
- Task 15: Create frontend Dockerfile