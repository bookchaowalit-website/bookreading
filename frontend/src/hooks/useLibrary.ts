import { useState, useEffect, useCallback } from 'react';
import { getLibrary } from '@/lib/new-api';

interface LibraryNovel {
  id: string;
  novel_id: string;
  title: string;
  author: string;
  chapter_number: number;
  reading_progress: number;
  last_read_at: string;
  saved_at: string;
}

export function useLibrary() {
  const [novels, setNovels] = useState<LibraryNovel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      // No auth, fall back to localStorage
      try {
        const local = localStorage.getItem('novelLibrary');
        if (local) {
          const parsed = JSON.parse(local);
          setNovels(parsed.map((n: any) => ({
            id: n.id || n.novelId,
            novel_id: n.novelId || n.id,
            title: n.title,
            author: n.author || 'ไม่ทราบผู้แต่ง',
            chapter_number: n.chapterNumber || 1,
            reading_progress: n.readingProgress || 0,
            last_read_at: new Date(n.lastReadAt || 0).toISOString(),
            saved_at: new Date(n.savedAt || 0).toISOString(),
          })));
        }
      } catch (e) {
        // ignore
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await getLibrary();
      if (response.data && Array.isArray(response.data.library)) {
        setNovels(response.data.library);
      } else {
        // API returned unexpected format, fall back to localStorage
        const local = localStorage.getItem('novelLibrary');
        if (local) {
          const parsed = JSON.parse(local);
          setNovels(parsed.map((n: any) => ({
            id: n.id || n.novelId,
            novel_id: n.novelId || n.id,
            title: n.title,
            author: n.author || 'ไม่ทราบผู้แต่ง',
            chapter_number: n.chapterNumber || 1,
            reading_progress: n.readingProgress || 0,
            last_read_at: new Date(n.lastReadAt || 0).toISOString(),
            saved_at: new Date(n.savedAt || 0).toISOString(),
          })));
        }
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch library:', err);
      setError(err.message || 'Failed to load library');
      // Fall back to localStorage
      const local = localStorage.getItem('novelLibrary');
      if (local) {
        const parsed = JSON.parse(local);
        setNovels(parsed.map((n: any) => ({
          id: n.id || n.novelId,
          novel_id: n.novelId || n.id,
          title: n.title,
          author: n.author || 'ไม่ทราบผู้แต่ง',
          chapter_number: n.chapterNumber || 1,
          reading_progress: n.readingProgress || 0,
          last_read_at: new Date(n.lastReadAt || 0).toISOString(),
          saved_at: new Date(n.savedAt || 0).toISOString(),
        })));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  return { novels, loading, error, refetch: fetchLibrary };
}
