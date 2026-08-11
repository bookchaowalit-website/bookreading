'use client';

import { useState } from 'react';
import { useNovelSubscriptions, useUpdateHistory } from '@/hooks/useSubscriptions';
import { useToast } from '@/providers/ToastProvider';
import Link from 'next/link';
import Skeleton from '@/components/Skeleton';
import { Bell, RefreshCw, Clock, AlertCircle } from 'lucide-react';

export default function SubscriptionsPage() {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || '' : '';
  const { success, error: toastError, warning, info } = useToast();
  const { subscriptions, loading, error: subError, unsubscribe, triggerUpdate } = useNovelSubscriptions(userId || undefined);
  const [selectedNovel, setSelectedNovel] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Skeleton variant="title" className="w-48" />
        <Skeleton count={3} variant="card" className="h-24" />
      </div>
    );
  }

  const handleTriggerUpdate = async () => {
    const confirmed = confirm('ต้องการตรวจสอบนิยายที่มีการติดตามหรือไม่?');
    if (confirmed) {
      await triggerUpdate();
      info('กำลังตรวจสอบนิยายที่ติดตาม...');
    }
  };

  if (!userId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">กรุณาเข้าสู่ระบบเพื่อดูการติดตาม</p>
          <Link href="/login" className="text-blue-600 hover:underline mt-2 inline-block">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            <Bell size={24} className="inline" /> นิยายที่ติดตาม
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            ระบบจะตรวจสอบ chapter ใหม่อัตโนมัติทุก 1 ชั่วโมง
          </p>
        </div>

        <button
          onClick={handleTriggerUpdate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          ตรวจสอบตอนนี้
        </button>
      </div>

      {/* Error Message */}
      {subError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          {subError}
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : subscriptions.length === 0 ? (
        /* Empty State */
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 font-medium">ยังไม่มีการติดตาม</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
            ไปที่นิยายแล้วกดปุ่ม &quot;ติดตามอัพเดทอัตโนมัติ&quot;
          </p>
          <Link
            href="/app/library"
            className="mt-4 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            ไปที่ห้องสมุด
          </Link>
        </div>
      ) : (
        /* Subscriptions List */
        <div className="space-y-3">
          {subscriptions.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              subscription={sub}
              onUnsubscribe={async () => {
                const confirmed = confirm('ยกเลิกการติดตามนิยายนี้?');
                if (confirmed) {
                  await unsubscribe(sub.id);
                }
              }}
              onViewHistory={() => setSelectedNovel(sub.novel_id)}
            />
          ))}
        </div>
      )}

      {/* Update History Modal */}
      {selectedNovel && (
        <UpdateHistoryModal
          novelId={selectedNovel}
          onClose={() => setSelectedNovel(null)}
        />
      )}
    </div>
  );
}

// ============================================
// Subscription Card Component
// ============================================

function SubscriptionCard({
  subscription,
  onUnsubscribe,
  onViewHistory,
}: {
  subscription: any;
  onUnsubscribe: () => void;
  onViewHistory: () => void;
}) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'ยังไม่เคยตรวจสอบ';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            นิยาย ID: {subscription.novel_id}
          </h3>

          <div className="mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Chapter ล่าสุด: {subscription.last_chapter_count}</span>
            </div>

            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>ตรวจสอบทุก {subscription.check_interval_hours} ชั่วโมง</span>
            </div>

            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>ตรวจสอบล่าสุด: {formatDate(subscription.last_checked_at)}</span>
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className={`
          px-3 py-1 rounded-full text-xs font-medium
          ${subscription.is_active
            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
          }
        `}>
          {subscription.is_active ? 'ติดตามอยู่' : 'ยกเลิกแล้ว'}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
        <button
          onClick={onViewHistory}
          className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          ดูประวัติอัพเดท
        </button>
        <button
          onClick={onUnsubscribe}
          className="flex-1 py-2 px-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
        >
          ยกเลิกติดตาม
        </button>
      </div>
    </div>
  );
}

// ============================================
// Update History Modal
// ============================================

function UpdateHistoryModal({
  novelId,
  onClose,
}: {
  novelId: string;
  onClose: () => void;
}) {
  const { history, loading } = useUpdateHistory(novelId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            ประวัติการอัพเดท
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <svg className="animate-spin h-6 w-6 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">
              ยังไม่มีประวัติการอัพเดท
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {item.status === 'success' ? (
                        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className="text-sm font-medium">
                        {item.status === 'success' ? 'สำเร็จ' : 'ผิดพลาด'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(item.checked_at).toLocaleDateString('th-TH')}
                    </span>
                  </div>

                  {item.status === 'success' && (
                    <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                      Chapter ใหม่: {item.chapters_added} | อัพเดท: {item.chapters_updated}
                    </div>
                  )}

                  {item.error_message && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {item.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
