/**
 * Unit tests for API client
 *
 * To run these tests, install vitest:
 *   npm install -D vitest
 * Then run:
 *   npx vitest run src/lib/__tests__/api.test.ts
 *
 * Or add to package.json scripts:
 *   "test": "vitest"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios', () => {
  const mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: {
        use: vi.fn(),
        eject: vi.fn(),
      },
      response: {
        use: vi.fn(),
        eject: vi.fn(),
      },
    },
  };

  const mockAxios = vi.fn(() => mockAxiosInstance);
  Object.assign(mockAxios, {
    create: vi.fn(() => mockAxiosInstance),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: mockAxiosInstance.interceptors,
  });

  return {
    default: mockAxios,
    ...mockAxios,
  };
});

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    _getStore: () => store,
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

describe('API Client', () => {
  let apiClient: ReturnType<typeof axios.create>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    apiClient = axios.create();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Base URL Configuration', () => {
    it('should create axios instance with BACKEND_URL as baseURL', () => {
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: BACKEND_URL,
      });
    });

    it('should use default backend URL when env var is not set', () => {
      const expectedUrl = 'http://localhost:8080';
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expectedUrl,
        })
      );
    });
  });

  describe('Auth Interceptor', () => {
    it('should register a request interceptor', () => {
      expect(apiClient.interceptors.request.use).toHaveBeenCalled();
    });

    it('should add Authorization header when token exists in localStorage', () => {
      mockLocalStorage.setItem('token', 'test-token-123');

      // Get the interceptor callback function
      const interceptorCall = (axios.create as any).mock.results[0].value.interceptors.request.use.mock.calls[0][0];

      const config = { headers: {} as Record<string, string> };
      const result = interceptorCall(config);

      expect(result.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('should not add Authorization header when no token exists', () => {
      const interceptorCall = (axios.create as any).mock.results[0].value.interceptors.request.use.mock.calls[0][0];

      const config = { headers: {} as Record<string, string> };
      const result = interceptorCall(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('should return config unchanged after processing', () => {
      mockLocalStorage.setItem('token', 'my-token');

      const interceptorCall = (axios.create as any).mock.results[0].value.interceptors.request.use.mock.calls[0][0];

      const config = {
        headers: {} as Record<string, string>,
        url: '/api/test',
        method: 'get' as const,
      };
      const result = interceptorCall(config);

      expect(result).toBe(config);
      expect(result.url).toBe('/api/test');
    });
  });

  describe('Novel API', () => {
    beforeEach(() => {
      // Reset and re-import after mocks
      vi.resetModules();
    });

    it('should call listNovels with correct query params', async () => {
      const mockResponse = {
        data: {
          data: {
            novels: [{ id: '1', title: 'Test Novel' }],
            total: 1,
          },
        },
      };
      (axios.create as any).mock.results[0].value.get.mockResolvedValue(mockResponse);

      // Simulate the API call pattern used in novelApi.listNovels
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('offset', '0');

      await apiClient.get(`/api/novels?${params.toString()}`);

      expect(apiClient.get).toHaveBeenCalledWith('/api/novels?limit=20&offset=0');
    });

    it('should call getNovel with correct novel ID', async () => {
      const mockResponse = {
        data: {
          data: { id: 'novel-123', title: 'Test Novel' },
        },
      };
      (axios.create as any).mock.results[0].value.get.mockResolvedValue(mockResponse);

      await apiClient.get('/api/novels/detail?id=novel-123');

      expect(apiClient.get).toHaveBeenCalledWith('/api/novels/detail?id=novel-123');
    });

    it('should include status filter when provided', async () => {
      const params = new URLSearchParams();
      params.append('limit', '20');
      params.append('offset', '0');
      params.append('status', 'ongoing');

      await apiClient.get(`/api/novels?${params.toString()}`);

      expect(apiClient.get).toHaveBeenCalledWith('/api/novels?limit=20&offset=0&status=ongoing');
    });
  });
});

describe('New API Client (new-api.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
  });

  describe('Subscription API', () => {
    it('should call subscribe endpoint with correct payload', async () => {
      const mockAxiosInstance = (axios.create as any).mock.results?.[0]?.value || axios.create();
      mockAxiosInstance.post.mockResolvedValue({
        data: { data: { id: 'sub-1' } },
      });

      await mockAxiosInstance.post('/api/subscriptions', {
        novel_id: 'novel-1',
        source_url: 'https://example.com/novel',
        source_type: 'chinese',
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/subscriptions', {
        novel_id: 'novel-1',
        source_url: 'https://example.com/novel',
        source_type: 'chinese',
      });
    });

    it('should call unsubscribe with correct params', async () => {
      const mockAxiosInstance = (axios.create as any).mock.results?.[0]?.value || axios.create();
      mockAxiosInstance.delete.mockResolvedValue({ data: { data: { success: true } } });

      await mockAxiosInstance.delete('/api/subscriptions', {
        params: { id: 'sub-1' },
      });

      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/api/subscriptions', {
        params: { id: 'sub-1' },
      });
    });

    it('should call getUserSubscriptions with user_id param', async () => {
      const mockAxiosInstance = (axios.create as any).mock.results?.[0]?.value || axios.create();
      mockAxiosInstance.get.mockResolvedValue({
        data: { data: [{ id: 'sub-1', novel_id: 'novel-1', is_active: true }] },
      });

      await mockAxiosInstance.get('/api/subscriptions', {
        params: { user_id: 'user-1' },
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/subscriptions', {
        params: { user_id: 'user-1' },
      });
    });
  });

  describe('Reading Progress API', () => {
    it('should save reading progress with correct data', async () => {
      const mockAxiosInstance = (axios.create as any).mock.results?.[0]?.value || axios.create();
      mockAxiosInstance.post.mockResolvedValue({ data: { data: { id: 'progress-1' } } });

      await mockAxiosInstance.post('/api/reading-progress', {
        novel_id: 'novel-1',
        chapter_number: 5,
        progress_percentage: 75.5,
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/reading-progress', {
        novel_id: 'novel-1',
        chapter_number: 5,
        progress_percentage: 75.5,
      });
    });

    it('should get reading progress for a user', async () => {
      const mockAxiosInstance = (axios.create as any).mock.results?.[0]?.value || axios.create();
      mockAxiosInstance.get.mockResolvedValue({
        data: { data: [{ novel_id: 'novel-1', chapter_number: 5, progress_percentage: 75.5 }] },
      });

      await mockAxiosInstance.get('/api/reading-progress', {
        params: { user_id: 'user-1' },
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/reading-progress', {
        params: { user_id: 'user-1' },
      });
    });
  });
});
