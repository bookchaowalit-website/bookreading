'use client';

import { useState } from 'react';

interface SubscribeButtonProps {
  novelId: string;
  sourceUrl: string;
  sourceType: string;
  isSubscribed: boolean;
  onSubscribe: (novelId: string, sourceUrl: string, sourceType: string) => Promise<boolean>;
  onUnsubscribe: (subscriptionId: string) => Promise<boolean>;
  subscriptionId?: string;
}

export default function SubscribeButton({
  novelId,
  sourceUrl,
  sourceType,
  isSubscribed,
  onSubscribe,
  onUnsubscribe,
  subscriptionId,
}: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setMessage(null);

    try {
      if (isSubscribed && subscriptionId) {
        const success = await onUnsubscribe(subscriptionId);
        if (success) {
          setMessage('ยกเลิกการติดตามแล้ว');
        }
      } else {
        const success = await onSubscribe(novelId, sourceUrl, sourceType);
        if (success) {
          setMessage('ติดตามนิยายเรียบร้อย จะตรวจสอบ chapter ใหม่อัตโนมัติ!');
        }
      }
    } catch (error) {
      setMessage('เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`
          w-full py-3 px-4 rounded-xl font-semibold transition-all
          ${isSubscribed
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            : 'bg-gradient-to-r from-green-600 to-blue-600 text-white hover:opacity-90'
          }
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            กำลังดำเนินการ...
          </span>
        ) : isSubscribed ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            ติดตามอยู่ (ยกเลิก)
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            ติดตามอัพเดทอัตโนมัติ
          </span>
        )}
      </button>

      {message && (
        <div className={`
          mt-2 p-3 rounded-lg text-sm
          ${message.includes('ยกเลิก')
            ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
            : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
          }
        `}>
          {message}
        </div>
      )}
    </div>
  );
}
