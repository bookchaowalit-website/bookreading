import axios from 'axios';

const AI_SERVICE_URL = process.env.NEXT_PUBLIC_AI_SERVICE_URL || 'http://localhost:8000';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

// Create axios instance with cookie-based auth
// The browser automatically sends cookies for same-origin requests
const apiClient = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true, // Important: send cookies with requests
});

// Fallback to localStorage token if no cookie (for development)
if (typeof window !== 'undefined') {
  apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  subscription_plan: string;
  subscription_status: string;
  created_at: string;
}

export interface Novel {
  id: string;
  title: string;
  original_title: string;
  source_url: string;
  source_language: string;
  target_language: string;
  author: string;
  description: string;
  cover_image_url: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  novel_id: string;
  chapter_number: number;
  title: string;
  original_title: string;
  source_url: string;
  content: string;
  original_content: string;
  word_count: number;
  is_translated: boolean;
  is_scraped: boolean;
  created_at: string;
  updated_at: string;
}

export interface Terminology {
  id: string;
  novel_id: string;
  term: string;
  original_term: string;
  translation: string;
  term_type: string;
  description: string;
  is_auto_generated: boolean;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

export interface ScrapedChapter {
  chapter_number: number;
  title: string;
  original_title: string;
  url: string;
  content: string;
}

export interface ScrapeResponse {
  title: string;
  original_title: string;
  author: string;
  description: string;
  cover_image_url: string;
  chapters: ScrapedChapter[];
}

export interface ExtractedTerm {
  original: string;
  term: string;
  translation: string;
  type: string;
  description: string;
  confidence: number;
}

export interface UserLibrary {
  id: string;
  user_id: string;
  novel_id: string;
  reading_progress: number;
  last_chapter_read: number;
  is_bookmarked: boolean;
  saved_at: string;
  last_read_at: string;
}

export interface UserTerminology {
  id: string;
  user_id: string;
  original_term: string;
  translation: string;
  term_type: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// Auth API
export const authApi = {
  async register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
    const response = await apiClient.post('/api/auth/register', { email, password, name });
    return response.data.data;
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const response = await apiClient.post('/api/auth/login', { email, password });
    return response.data.data;
  },

  async getMe(): Promise<User> {
    const response = await apiClient.get('/api/users/me');
    return response.data.data;
  },

  async updateUser(data: { name?: string; avatar_url?: string }): Promise<User> {
    const response = await apiClient.put('/api/users/me/update', data);
    return response.data.data;
  },

  async deleteUser(): Promise<void> {
    await apiClient.delete('/api/users/me/delete');
  },
};

// Library API
export const libraryApi = {
  async getLibrary(): Promise<UserLibrary[]> {
    const response = await apiClient.get('/api/library');
    return response.data.data;
  },

  async addToLibrary(novelId: string): Promise<void> {
    await apiClient.post('/api/library', { novel_id: novelId });
  },

  async removeFromLibrary(novelId: string): Promise<void> {
    await apiClient.delete(`/api/library?novel_id=${novelId}`);
  },
};

// Terminology API
export const terminologyApi = {
  async getTerminology(): Promise<UserTerminology[]> {
    const response = await apiClient.get('/api/terminology');
    return response.data.data;
  },

  async addTerminology(term: Omit<UserTerminology, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<UserTerminology> {
    const response = await apiClient.post('/api/terminology', term);
    return response.data.data;
  },

  async deleteTerminology(id: string): Promise<void> {
    await apiClient.delete(`/api/terminology?id=${id}`);
  },
};

// Novel API
export const novelApi = {
  async listNovels(limit = 20, offset = 0, status = ''): Promise<{ novels: Novel[]; total: number }> {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    if (status) params.append('status', status);
    const response = await apiClient.get(`/api/novels?${params.toString()}`);
    return response.data.data;
  },

  async getNovel(id: string): Promise<Novel> {
    const response = await apiClient.get(`/api/novels/detail?id=${id}`);
    return response.data.data;
  },

  async scrapeNovel(url: string, sourceLang = 'zh', targetLang = 'th', novelId = ''): Promise<{ novel_id: string; chapters_scraped: number }> {
    const response = await apiClient.post('/api/novels', {
      url,
      source_lang: sourceLang,
      target_lang: targetLang,
      novel_id: novelId,
    });
    return response.data.data;
  },
};

// Chapter API
export const chapterApi = {
  async listChapters(novelId: string, limit = 50, offset = 0): Promise<{ chapters: Chapter[]; total: number }> {
    const params = new URLSearchParams();
    params.append('novel_id', novelId);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    const response = await apiClient.get(`/api/chapters?${params.toString()}`);
    return response.data.data;
  },

  async getChapter(id: string): Promise<Chapter> {
    const response = await apiClient.get(`/api/chapters/detail?id=${id}`);
    return response.data.data;
  },

  async getChapterByNumber(novelId: string, chapterNumber: number): Promise<Chapter> {
    const params = new URLSearchParams();
    params.append('novel_id', novelId);
    params.append('chapter_number', chapterNumber.toString());
    const response = await apiClient.get(`/api/chapters/by-number?${params.toString()}`);
    return response.data.data;
  },

  async translateChapter(id: string, targetLang = 'th', useContext = false): Promise<Chapter> {
    const response = await apiClient.post(`/api/chapters/translate?id=${id}`, {
      target_lang: targetLang,
      use_context: useContext,
    });
    return response.data.data;
  },
};

// Translation History API
export interface TranslationHistoryItem {
  id: string;
  chapter_id: string;
  source_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  model_used: string;
  tokens_used: number;
  created_at: string;
}

export const translationApi = {
  // Get translation history for a novel or chapter
  async getHistory(options: { novelId?: string; chapterId?: string; limit?: number; offset?: number }): Promise<{
    histories: TranslationHistoryItem[];
    total?: number;
  }> {
    const params = new URLSearchParams();
    if (options.novelId) params.append('novel_id', options.novelId);
    if (options.chapterId) params.append('chapter_id', options.chapterId);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.offset) params.append('offset', options.offset.toString());
    const response = await apiClient.get(`/api/translations/history?${params.toString()}`);
    return response.data.data;
  },

  // Get cached translation for a chapter
  async getCachedTranslation(chapterId: string): Promise<TranslationHistoryItem | null> {
    try {
      const response = await apiClient.get(`/api/translations/cached?chapter_id=${chapterId}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
  },
};

// AI Service API
export const aiApi = {
  // Scrape novel/chapter from URL
  async scrapeNovel(url: string, sourceLang = 'zh'): Promise<ScrapeResponse> {
    const response = await axios.post(`${AI_SERVICE_URL}/scrape`, {
      url,
      source_lang: sourceLang,
    });
    return response.data;
  },

  // Fetch single chapter content on-demand
  async fetchChapterContent(url: string): Promise<{ content: string; chapter_number: number; title: string }> {
    const response = await axios.post(`${AI_SERVICE_URL}/chapter`, {
      url,
    });
    return response.data;
  },

  // Translate content
  async translateContent(
    text: string,
    sourceLang = 'zh',
    targetLang = 'th'
  ): Promise<{ translated_text: string; model_used: string }> {
    const response = await axios.post(`${AI_SERVICE_URL}/translate`, {
      text,
      source_lang: sourceLang,
      target_lang: targetLang,
    });
    return response.data;
  },

  // Extract terminology from text
  async extractTerminology(
    text: string,
    sourceLang = 'zh',
    targetLang = 'th'
  ): Promise<ExtractedTerm[]> {
    const response = await axios.post(`${AI_SERVICE_URL}/extract-terminology`, {
      text,
      source_lang: sourceLang,
      target_lang: targetLang,
    });
    return response.data.terms;
  },

  // Get pre-defined terminology
  async getKnownTerminology(): Promise<{ novel: string; terminology: ExtractedTerm[] }> {
    const response = await axios.get(`${AI_SERVICE_URL}/terminology/known`);
    return response.data;
  },

  // Agentic AI Translation with full context
  async translateAgentic(
    text: string,
    options: {
      novelId?: string;
      novelTitle?: string;
      novelTitleTh?: string;
      author?: string;
      genre?: string;
      tone?: string;
      chapterNumber?: number;
      chapterTitle?: string;
      terminology?: ExtractedTerm[];
      translationContext?: { chapter_number: number; source_text: string; translated_text: string }[];
      provider?: 'openai' | 'gemini';
      twoStep?: boolean;
      pronounStyle?: 'traditional' | 'modern';
      openaiApiKey?: string;
      geminiApiKey?: string;
    } = {}
  ): Promise<{
    translated_text: string;
    literal_translation?: string;
    polished_translation?: string;
    model_used: string;
    provider: string;
    tokens_used: number;
    terms_applied: string[];
    quality_score: number;
    grade?: string;
    overall_score?: number;
    issues?: string[];
    strengths?: string[];
  }> {
    const response = await axios.post(`${AI_SERVICE_URL}/translate/agentic`, {
      text,
      source_lang: 'zh',
      target_lang: 'th',
      novel_id: options.novelId,
      novel_title: options.novelTitle,
      novel_title_th: options.novelTitleTh,
      author: options.author,
      genre: options.genre || 'fantasy',
      tone: options.tone || 'dark',
      chapter_number: options.chapterNumber,
      chapter_title: options.chapterTitle,
      terminology: options.terminology || [],
      translation_context: options.translationContext || [],
      provider: options.provider,
      two_step: options.twoStep !== false,
      pronoun_style: options.pronounStyle || 'traditional',
      openai_api_key: options.openaiApiKey,
      gemini_api_key: options.geminiApiKey,
    });
    return response.data;
  },

  // Initialize novel context for translation
  async initializeContext(
    novelId: string,
    novelTitle: string,
    novelTitleTh: string,
    options: {
      author?: string;
      genre?: string;
      tone?: string;
      pronounStyle?: string;
    } = {}
  ): Promise<{ success: boolean; novel_id: string }> {
    const response = await axios.post(`${AI_SERVICE_URL}/context/initialize`, {
      novel_id: novelId,
      novel_title: novelTitle,
      novel_title_th: novelTitleTh,
      author: options.author,
      genre: options.genre || 'fantasy',
      tone: options.tone || 'dark',
      pronoun_style: options.pronounStyle || 'traditional',
    });
    return response.data;
  },

  // Add chapter context
  async addChapterContext(
    novelId: string,
    chapterNumber: number,
    chapterTitle: string,
    sourceText: string,
    translatedText: string,
    keyEvents?: string[]
  ): Promise<{ success: boolean; chapter_number: number }> {
    const response = await axios.post(`${AI_SERVICE_URL}/context/add-chapter`, {
      novel_id: novelId,
      chapter_number: chapterNumber,
      chapter_title: chapterTitle,
      source_text: sourceText,
      translated_text: translatedText,
      key_events: keyEvents || [],
    });
    return response.data;
  },

  // Get novel terminology
  async getNovelTerminology(novelId: string): Promise<{
    novel_id: string;
    terms: { original: string; translation: string; type: string; description: string }[];
  }> {
    const response = await axios.get(`${AI_SERVICE_URL}/terminology/${novelId}`);
    return response.data;
  },
};

// Manga Translation API
export interface MangaTextRegion {
  bbox: number[];
  original_text: string;
  translated_text: string;
  confidence: number;
  region_type: string;
  font_size: number;
  is_vertical: boolean;
}

export interface MangaTranslateResponse {
  translated_image_base64: string;
  original_image_base64: string;
  regions: MangaTextRegion[];
  model_used: string;
  provider: string;
  tokens_used: number;
}

export interface MangaExtractTextResponse {
  regions: MangaTextRegion[];
  extracted_text: string;
}

export interface MangaBatchTranslateResponse {
  results: MangaTranslateResponse[];
  total_pages: number;
  successful_pages: number;
  total_tokens_used: number;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  description: string;
}

export interface SupportedRenderStyle {
  code: string;
  name: string;
  description: string;
}

export const mangaApi = {
  // Translate single manga image
  async translateImage(
    imageBase64: string,
    options: {
      sourceLang?: string;
      targetLang?: string;
      renderStyle?: string;
      seriesTitle?: string;
      chapterNumber?: number;
      characters?: { name: string; personality: string }[];
      tone?: string;
      setting?: string;
      provider?: 'openai' | 'gemini';
      model?: string;
      openaiApiKey?: string;
      geminiApiKey?: string;
    } = {}
  ): Promise<MangaTranslateResponse> {
    const response = await axios.post(`${AI_SERVICE_URL}/manga/translate`, {
      image_base64: imageBase64,
      source_lang: options.sourceLang || 'ko',
      target_lang: options.targetLang || 'th',
      render_style: options.renderStyle || 'overlay',
      series_title: options.seriesTitle || '',
      chapter_number: options.chapterNumber || 0,
      characters: options.characters || [],
      tone: options.tone || 'casual',
      setting: options.setting || '',
      provider: options.provider,
      model: options.model || 'gpt-4o',
      openai_api_key: options.openaiApiKey,
      gemini_api_key: options.geminiApiKey,
    });
    return response.data;
  },

  // Extract text only (no translation)
  async extractText(
    imageBase64: string,
    sourceLang: string = 'ko'
  ): Promise<MangaExtractTextResponse> {
    const response = await axios.post(`${AI_SERVICE_URL}/manga/extract-text`, {
      image_base64: imageBase64,
      source_lang: sourceLang,
    });
    return response.data;
  },

  // Batch translate multiple images
  async batchTranslate(
    images: string[],
    options: {
      sourceLang?: string;
      targetLang?: string;
      renderStyle?: string;
      seriesTitle?: string;
      chapterStart?: number;
      characters?: { name: string; personality: string }[];
      tone?: string;
      setting?: string;
      provider?: 'openai' | 'gemini';
      model?: string;
      openaiApiKey?: string;
      geminiApiKey?: string;
    } = {}
  ): Promise<MangaBatchTranslateResponse> {
    const response = await axios.post(`${AI_SERVICE_URL}/manga/batch-translate`, {
      images,
      source_lang: options.sourceLang || 'ko',
      target_lang: options.targetLang || 'th',
      render_style: options.renderStyle || 'overlay',
      series_title: options.seriesTitle || '',
      chapter_start: options.chapterStart || 1,
      characters: options.characters || [],
      tone: options.tone || 'casual',
      setting: options.setting || '',
      provider: options.provider,
      model: options.model || 'gpt-4o',
      openai_api_key: options.openaiApiKey,
      gemini_api_key: options.geminiApiKey,
    });
    return response.data;
  },

  // Fetch manga from URL
  async fetchFromUrl(
    url: string,
    sourceLang: string = 'ko'
  ): Promise<{
    title: string;
    chapter_number: number | null;
    total_pages: number;
    pages: { page_number: number; image_url: string }[];
    source_url: string;
    site_name: string;
  }> {
    const response = await axios.post(`${AI_SERVICE_URL}/manga/fetch`, {
      url,
      source_lang: sourceLang,
    });
    return response.data;
  },

  // Translate manga from URL (fetch + translate)
  async translateFromUrl(
    url: string,
    options: {
      sourceLang?: string;
      renderStyle?: string;
      seriesTitle?: string;
      tone?: string;
      provider?: 'openai' | 'gemini';
      model?: string;
      openaiApiKey?: string;
      geminiApiKey?: string;
    } = {}
  ): Promise<{
    title: string;
    chapter_number: number | null;
    total_pages: number;
    site_name: string;
    source_url: string;
    pages: {
      page_number: number;
      translated_base64: string;
      original_base64: string;
      regions_count: number;
      error?: string;
    }[];
  }> {
    const response = await axios.post(`${AI_SERVICE_URL}/manga/translate-url`, {
      url,
      source_lang: options.sourceLang || 'ko',
      render_style: options.renderStyle || 'overlay',
      series_title: options.seriesTitle || '',
      tone: options.tone || 'casual',
      provider: options.provider,
      model: options.model || 'gpt-4o',
      openai_api_key: options.openaiApiKey,
      gemini_api_key: options.geminiApiKey,
    });
    return response.data;
  },

  // Get supported languages
  async getSupportedLanguages(): Promise<{
    languages: SupportedLanguage[];
    target_languages: SupportedLanguage[];
    render_styles: SupportedRenderStyle[];
  }> {
    const response = await axios.get(`${AI_SERVICE_URL}/manga/supported-languages`);
    return response.data;
  },

  // Get supported sites
  async getSupportedSites(): Promise<{
    sites: {
      name: string;
      domains: string[];
      example: string;
      notes: string;
    }[];
  }> {
    const response = await axios.get(`${AI_SERVICE_URL}/manga/supported-sites`);
    return response.data;
  },

  // Health check
  async healthCheck(): Promise<{
    status: string;
    ocr_available: boolean;
    openai_configured: boolean;
    gemini_configured: boolean;
    supported_features: {
      ocr: boolean;
      translation: boolean;
      rendering: boolean;
      batch: boolean;
    };
  }> {
    const response = await axios.get(`${AI_SERVICE_URL}/manga/health`);
    return response.data;
  },
};

// Legacy API for backward compatibility
export const api = {
  async scrapeNovel(url: string, sourceLang = 'zh', targetLang = 'th'): Promise<ScrapeResponse> {
    return aiApi.scrapeNovel(url, sourceLang);
  },

  async translateContent(
    text: string,
    sourceLang = 'zh',
    targetLang = 'th'
  ): Promise<{ translated_text: string; model_used: string }> {
    return aiApi.translateContent(text, sourceLang, targetLang);
  },

  async extractTerminology(
    text: string,
    sourceLang = 'zh',
    targetLang = 'th'
  ): Promise<ExtractedTerm[]> {
    return aiApi.extractTerminology(text, sourceLang, targetLang);
  },

  async getKnownTerminology(): Promise<{ novel: string; terminology: ExtractedTerm[] }> {
    return aiApi.getKnownTerminology();
  },
};

export default api;
