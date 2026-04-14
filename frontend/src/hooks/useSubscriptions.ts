import { useState, useEffect, useCallback } from 'react';
import {
  subscribeToNovel,
  unsubscribeFromNovel,
  getUserSubscriptions,
  triggerNovelUpdate,
  getUpdateHistory,
} from '@/lib/new-api';
import type { NovelSubscription, NovelUpdateHistory } from '@/lib/types/features';

// ============================================
// Subscription Management Hook
// ============================================

export function useNovelSubscriptions(userId?: string) {
  const [subscriptions, setSubscriptions] = useState<NovelSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptions = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await getUserSubscriptions(userId);
      setSubscriptions(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch subscriptions');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const subscribe = async (novelId: string, sourceUrl: string, sourceType: string) => {
    setError(null);
    try {
      await subscribeToNovel({ novel_id: novelId, source_url: sourceUrl, source_type: sourceType });
      await fetchSubscriptions();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to subscribe');
      return false;
    }
  };

  const unsubscribe = async (subscriptionId: string) => {
    setError(null);
    try {
      await unsubscribeFromNovel(subscriptionId);
      setSubscriptions(subscriptions.filter(s => s.id !== subscriptionId));
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to unsubscribe');
      return false;
    }
  };

  const triggerUpdate = async () => {
    try {
      await triggerNovelUpdate();
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to trigger update');
      return false;
    }
  };

  return {
    subscriptions,
    loading,
    error,
    subscribe,
    unsubscribe,
    triggerUpdate,
    refresh: fetchSubscriptions,
  };
}

// ============================================
// Update History Hook
// ============================================

export function useUpdateHistory(novelId: string) {
  const [history, setHistory] = useState<NovelUpdateHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!novelId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await getUpdateHistory(novelId);
      setHistory(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch update history');
    } finally {
      setLoading(false);
    }
  }, [novelId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refresh: fetchHistory };
}

// ============================================
// Single Novel Subscription Status Hook
// ============================================

export function useNovelSubscriptionStatus(novelId: string, userId?: string) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<NovelSubscription | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSubscription = async () => {
      if (!userId || !novelId) return;
      
      setLoading(true);
      try {
        const response = await getUserSubscriptions(userId);
        const subs = response.data || [];
        const sub = subs.find((s: NovelSubscription) => s.novel_id === novelId);
        setIsSubscribed(!!sub?.is_active);
        setSubscription(sub || null);
      } catch (err) {
        console.error('Failed to check subscription:', err);
      } finally {
        setLoading(false);
      }
    };

    checkSubscription();
  }, [novelId, userId]);

  return { isSubscribed, subscription, loading };
}
