/**
 * Unit tests for @/lib/api and @/lib/new-api.
 *
 * Auth interceptor tests import the real modules under an axios mock so
 * axios.create + interceptors.request.use run at module load (the bug in the
 * previous suite: it never imported lib/api, so the mock was never invoked).
 *
 * Run: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInstance, mockCreate, mockAxiosPost } = vi.hoisted(() => {
  const mockInstance = {
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

  const mockCreate = vi.fn(() => mockInstance);
  const mockAxiosPost = vi.fn();

  return { mockInstance, mockCreate, mockAxiosPost };
});

vi.mock('axios', () => {
  const mockAxios = Object.assign(vi.fn(), {
    create: mockCreate,
    get: vi.fn(),
    post: mockAxiosPost,
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: mockInstance.interceptors,
  });

  return {
    default: mockAxios,
    ...mockAxios,
  };
});

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
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

async function loadApi() {
  vi.resetModules();
  mockCreate.mockClear();
  mockInstance.get.mockReset();
  mockInstance.post.mockReset();
  mockInstance.put.mockReset();
  mockInstance.delete.mockReset();
  mockInstance.interceptors.request.use.mockReset();
  mockInstance.interceptors.response.use.mockReset();
  mockCreate.mockReturnValue(mockInstance);
  return import('@/lib/api');
}

async function loadNewApi() {
  vi.resetModules();
  mockCreate.mockClear();
  mockInstance.get.mockReset();
  mockInstance.post.mockReset();
  mockInstance.put.mockReset();
  mockInstance.delete.mockReset();
  mockInstance.interceptors.request.use.mockReset();
  mockInstance.interceptors.response.use.mockReset();
  mockCreate.mockReturnValue(mockInstance);
  return import('@/lib/new-api');
}

function getRequestInterceptor() {
  const calls = mockInstance.interceptors.request.use.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[0][0] as (config: {
    headers: Record<string, string>;
    url?: string;
    method?: string;
  }) => {
    headers: Record<string, string>;
    url?: string;
    method?: string;
  };
}

describe('API Client (@/lib/api)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
  });

  describe('Base URL Configuration', () => {
    it('creates axios instance with BACKEND_URL and withCredentials', async () => {
      await loadApi();
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

      expect(mockCreate).toHaveBeenCalledWith({
        baseURL: BACKEND_URL,
        withCredentials: true,
      });
    });

    it('uses default backend URL when env var is not set', async () => {
      const prev = process.env.NEXT_PUBLIC_BACKEND_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      try {
        await loadApi();
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            baseURL: 'http://localhost:8080',
            withCredentials: true,
          })
        );
      } finally {
        if (prev === undefined) {
          delete process.env.NEXT_PUBLIC_BACKEND_URL;
        } else {
          process.env.NEXT_PUBLIC_BACKEND_URL = prev;
        }
      }
    });
  });

  describe('Auth Interceptor', () => {
    it('registers a request interceptor when window is available', async () => {
      await loadApi();
      expect(mockInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('adds Authorization header when token exists in localStorage', async () => {
      await loadApi();
      mockLocalStorage.setItem('token', 'test-token-123');

      const interceptor = getRequestInterceptor();
      const config = { headers: {} as Record<string, string> };
      const result = interceptor(config);

      expect(result.headers.Authorization).toBe('Bearer test-token-123');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('token');
    });

    it('does not add Authorization header when no token exists', async () => {
      await loadApi();

      const interceptor = getRequestInterceptor();
      const config = { headers: {} as Record<string, string> };
      const result = interceptor(config);

      expect(result.headers.Authorization).toBeUndefined();
    });

    it('does not overwrite an existing Authorization header', async () => {
      await loadApi();
      mockLocalStorage.setItem('token', 'local-storage-token');

      const interceptor = getRequestInterceptor();
      const config = {
        headers: { Authorization: 'Bearer already-set' } as Record<string, string>,
      };
      const result = interceptor(config);

      expect(result.headers.Authorization).toBe('Bearer already-set');
    });

    it('returns the same config object after processing', async () => {
      await loadApi();
      mockLocalStorage.setItem('token', 'my-token');

      const interceptor = getRequestInterceptor();
      const config = {
        headers: {} as Record<string, string>,
        url: '/api/test',
        method: 'get',
      };
      const result = interceptor(config);

      expect(result).toBe(config);
      expect(result.url).toBe('/api/test');
      expect(result.headers.Authorization).toBe('Bearer my-token');
    });
  });

  describe('AI API (backend proxy)', () => {
    it('sends ai-service calls to the backend /api/ai proxy, never axios directly', async () => {
      const { aiApi } = await loadApi();
      mockInstance.post.mockResolvedValue({ data: { translated_text: 'สวัสดี', model_used: 'm' } });

      const result = await aiApi.translateContent('你好', 'zh', 'th');

      expect(mockInstance.post).toHaveBeenCalledWith('/api/ai/translate', {
        text: '你好',
        source_lang: 'zh',
        target_lang: 'th',
      });
      expect(mockAxiosPost).not.toHaveBeenCalled();
      expect(result.translated_text).toBe('สวัสดี');
    });

    it('routes scraping and manga fetches through the proxy', async () => {
      const { aiApi } = await loadApi();
      mockInstance.post.mockResolvedValue({ data: { chapters: [], terms: [] } });

      await aiApi.scrapeNovel('https://www.piaotia.com/1', 'zh');
      await aiApi.fetchChapterContent('https://www.piaotia.com/1/2.html');

      const paths = mockInstance.post.mock.calls.map(([url]) => url);
      expect(paths).toEqual(['/api/ai/scrape', '/api/ai/chapter']);
      expect(mockAxiosPost).not.toHaveBeenCalled();
    });

    it('encodes the novel id in terminology lookups', async () => {
      const { aiApi } = await loadApi();
      mockInstance.get.mockResolvedValue({ data: { terms: [] } });

      await aiApi.getNovelTerminology('../docs');

      expect(mockInstance.get).toHaveBeenCalledWith('/api/ai/terminology/..%2Fdocs');
    });

    it('only bypasses the backend when the local-only direct URL is set', async () => {
      const prev = process.env.NEXT_PUBLIC_AI_DIRECT_URL;
      process.env.NEXT_PUBLIC_AI_DIRECT_URL = 'http://127.0.0.1:8000';
      try {
        const { aiApi } = await loadApi();
        mockInstance.post.mockResolvedValue({ data: { translated_text: 'x' } });
        await aiApi.translateContent('t');
        expect(mockCreate).toHaveBeenCalledWith({ baseURL: 'http://127.0.0.1:8000' });
        expect(mockInstance.post).toHaveBeenCalledWith('/translate', expect.any(Object));
      } finally {
        if (prev === undefined) {
          delete process.env.NEXT_PUBLIC_AI_DIRECT_URL;
        } else {
          process.env.NEXT_PUBLIC_AI_DIRECT_URL = prev;
        }
      }
    });

    it('review queue calls go through the proxy with params', async () => {
      const { aiReviewApi } = await loadApi();
      mockInstance.get.mockResolvedValue({ data: { items: [] } });
      mockInstance.post.mockResolvedValue({ data: { success: true } });

      await aiReviewApi.getPending(100);
      await aiReviewApi.reject('item-1', 'bad tone');

      expect(mockInstance.get).toHaveBeenCalledWith('/api/ai/review/pending', { params: { limit: 100 } });
      expect(mockInstance.post).toHaveBeenCalledWith('/api/ai/review/reject', {
        item_id: 'item-1',
        reviewer: 'admin',
        notes: 'bad tone',
      });
    });
  });

  describe('Novel API', () => {
    it('calls listNovels with correct query params and unwraps data', async () => {
      const { novelApi } = await loadApi();
      mockInstance.get.mockResolvedValue({
        data: {
          data: {
            novels: [{ id: '1', title: 'Test Novel' }],
            total: 1,
          },
        },
      });

      const result = await novelApi.listNovels();

      expect(mockInstance.get).toHaveBeenCalledWith('/api/novels?limit=20&offset=0');
      expect(result.total).toBe(1);
      expect(result.novels[0].title).toBe('Test Novel');
    });

    it('calls getNovel with correct novel ID', async () => {
      const { novelApi } = await loadApi();
      mockInstance.get.mockResolvedValue({
        data: {
          data: { id: 'novel-123', title: 'Test Novel' },
        },
      });

      const result = await novelApi.getNovel('novel-123');

      expect(mockInstance.get).toHaveBeenCalledWith('/api/novels/detail?id=novel-123');
      expect(result.id).toBe('novel-123');
    });

    it('includes status filter when provided', async () => {
      const { novelApi } = await loadApi();
      mockInstance.get.mockResolvedValue({
        data: { data: { novels: [], total: 0 } },
      });

      await novelApi.listNovels(20, 0, 'ongoing');

      expect(mockInstance.get).toHaveBeenCalledWith(
        '/api/novels?limit=20&offset=0&status=ongoing'
      );
    });
  });

  describe('Auth API', () => {
    it('login posts credentials and unwraps data envelope', async () => {
      const { authApi } = await loadApi();
      mockInstance.post.mockResolvedValue({
        data: {
          data: {
            user: { id: 'u1', email: 'a@b.com', name: 'A' },
            token: 'jwt-token',
          },
        },
      });

      const result = await authApi.login('a@b.com', 'secret');

      expect(mockInstance.post).toHaveBeenCalledWith('/api/auth/login', {
        email: 'a@b.com',
        password: 'secret',
      });
      expect(result.token).toBe('jwt-token');
      expect(result.user.email).toBe('a@b.com');
    });
  });
});

describe('New API Client (@/lib/new-api)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  describe('Subscription API', () => {
    it('subscribeToNovel posts correct payload', async () => {
      const { subscribeToNovel } = await loadNewApi();
      mockInstance.post.mockResolvedValue({
        data: { data: { id: 'sub-1' } },
      });

      const result = await subscribeToNovel({
        novel_id: 'novel-1',
        source_url: 'https://example.com/novel',
        source_type: 'chinese',
      });

      expect(mockInstance.post).toHaveBeenCalledWith('/api/subscriptions', {
        novel_id: 'novel-1',
        source_url: 'https://example.com/novel',
        source_type: 'chinese',
      });
      expect(result).toEqual({ data: { id: 'sub-1' } });
    });

    it('unsubscribeFromNovel deletes with id param', async () => {
      const { unsubscribeFromNovel } = await loadNewApi();
      mockInstance.delete.mockResolvedValue({ data: { data: { success: true } } });

      await unsubscribeFromNovel('sub-1');

      expect(mockInstance.delete).toHaveBeenCalledWith('/api/subscriptions', {
        params: { id: 'sub-1' },
      });
    });

    it('getUserSubscriptions requests with user_id param', async () => {
      const { getUserSubscriptions } = await loadNewApi();
      mockInstance.get.mockResolvedValue({
        data: { data: [{ id: 'sub-1', novel_id: 'novel-1', is_active: true }] },
      });

      await getUserSubscriptions('user-1');

      expect(mockInstance.get).toHaveBeenCalledWith('/api/subscriptions', {
        params: { user_id: 'user-1' },
      });
    });
  });

  describe('Reading Progress API', () => {
    it('saveReadingProgress posts correct data', async () => {
      const { saveReadingProgress } = await loadNewApi();
      mockInstance.post.mockResolvedValue({ data: { data: { id: 'progress-1' } } });

      await saveReadingProgress({
        novel_id: 'novel-1',
        chapter_number: 5,
        progress_percentage: 75.5,
      });

      expect(mockInstance.post).toHaveBeenCalledWith('/api/reading-progress', {
        novel_id: 'novel-1',
        chapter_number: 5,
        progress_percentage: 75.5,
      });
    });

    it('getReadingProgress requests with user_id param', async () => {
      const { getReadingProgress } = await loadNewApi();
      mockInstance.get.mockResolvedValue({
        data: {
          data: [{ novel_id: 'novel-1', chapter_number: 5, progress_percentage: 75.5 }],
        },
      });

      await getReadingProgress('user-1');

      expect(mockInstance.get).toHaveBeenCalledWith('/api/reading-progress', {
        params: { user_id: 'user-1' },
      });
    });
  });
});

describe('authHeader', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('omits Authorization without a stored token (the cookie carries the session)', async () => {
    const { authHeader } = await loadApi();
    expect(authHeader()).toEqual({});
    localStorage.setItem('token', 'null');
    expect(authHeader()).toEqual({});
  });

  it('sends a stored dev token as a bearer header', async () => {
    const { authHeader } = await loadApi();
    localStorage.setItem('token', 'abc');
    expect(authHeader()).toEqual({ Authorization: 'Bearer abc' });
  });
});
