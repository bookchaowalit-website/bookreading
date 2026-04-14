'use client';

import { useState } from 'react';
import StarRating from './StarRating';

interface TranslationFeedbackFormProps {
  novelId: string;
  chapterNumber: number;
  onSubmit: (data: {
    rating: number;
    comment?: string;
    has_errors?: boolean;
    error_details?: Array<{
      type: string;
      description: string;
      original_text?: string;
      corrected_text?: string;
    }>;
  }) => Promise<boolean>;
  onSuccess?: () => void;
}

export default function TranslationFeedbackForm({
  novelId,
  chapterNumber,
  onSubmit,
  onSuccess,
}: TranslationFeedbackFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [hasErrors, setHasErrors] = useState(false);
  const [errorType, setErrorType] = useState('wrong-translation');
  const [errorDescription, setErrorDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setMessage('กรุณาให้คะแนนก่อนส่ง');
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const errorDetails = hasErrors
        ? [{
            type: errorType,
            description: errorDescription,
          }]
        : undefined;

      const success = await onSubmit({
        rating,
        comment: comment || undefined,
        has_errors: hasErrors,
        error_details: errorDetails,
      });

      if (success) {
        setSubmitted(true);
        setMessage('ส่งความคิดเห็นเรียบร้อย! ขอบคุณสำหรับ feedback');
        onSuccess?.();
        
        // Reset form after 2 seconds
        setTimeout(() => {
          setRating(0);
          setComment('');
          setHasErrors(false);
          setErrorDescription('');
          setSubmitted(false);
          setMessage(null);
        }, 2000);
      } else {
        setMessage('เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
      }
    } catch (error) {
      setMessage('เกิดข้อผิดพลาด กรุณาลองอีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 text-center">
        <svg className="w-12 h-12 mx-auto text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-green-700 dark:text-green-300 font-medium">ขอบคุณสำหรับ feedback!</p>
        <p className="text-sm text-green-600 dark:text-green-400 mt-1">ความคิดเห็นของคุณช่วยให้การแปลดีขึ้น</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Star Rating */}
      <StarRating
        rating={rating}
        onRate={setRating}
        size="lg"
        label="ให้คะแนนการแปลบทนี้"
      />

      {/* Comment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          ความคิดเห็น (ไม่บังคับ)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="บอกเราว่าการแปลเป็นอย่างไร..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white resize-none"
        />
      </div>

      {/* Report Error Toggle */}
      <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">พบข้อผิดพลาดในการแปล</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">เช่น คำผิด, ความหมายผิด</p>
        </div>
        <button
          type="button"
          onClick={() => setHasErrors(!hasErrors)}
          className={`
            w-12 h-6 rounded-full transition-colors relative
            ${hasErrors ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'}
          `}
        >
          <div className={`
            w-5 h-5 bg-white rounded-full shadow transition-transform
            ${hasErrors ? 'translate-x-6' : 'translate-x-0.5'}
          `} />
        </button>
      </div>

      {/* Error Details */}
      {hasErrors && (
        <div className="space-y-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              ประเภทข้อผิดพลาด
            </label>
            <select
              value={errorType}
              onChange={(e) => setErrorType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value="wrong-translation">แปลผิดความหมาย</option>
              <option value="typo">คำผิด/พิมพ์ผิด</option>
              <option value="grammar">ไวยากรณ์ผิด</option>
              <option value="terminology">ใช้ศัพท์เฉพาะผิด</option>
              <option value="missing">ขาดหายบางส่วน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              รายละเอียด
            </label>
            <textarea
              value={errorDescription}
              onChange={(e) => setErrorDescription(e.target.value)}
              placeholder="อธิบายข้อผิดพลาดที่พบ..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white resize-none"
            />
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading || rating === 0}
        className={`
          w-full py-3 rounded-xl font-semibold transition-all
          ${rating === 0
            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90'
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
            กำลังส่ง...
          </span>
        ) : (
          'ส่งความคิดเห็น'
        )}
      </button>

      {/* Message */}
      {message && (
        <div className={`
          p-3 rounded-lg text-sm text-center
          ${message.includes('เรียบร้อย')
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          }
        `}>
          {message}
        </div>
      )}
    </form>
  );
}
