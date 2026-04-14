'use client';

import { useState } from 'react';

interface StarRatingProps {
  rating: number;
  onRate: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  label?: string;
}

export default function StarRating({
  rating,
  onRate,
  size = 'md',
  disabled = false,
  label = 'ให้คะแนนการแปล',
}: StarRatingProps) {
  const [hover, setHover] = useState(0);

  const sizeClasses = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const starSize = sizeClasses[size];

  const labels = {
    1: 'แย่มาก - อ่านไม่เข้าใจ',
    2: 'ไม่ดี - มีข้อผิดพลาดมาก',
    3: 'พอใช้ - อ่านได้แต่ยังมีปัญหา',
    4: 'ดี - อ่านเข้าใจ มีข้อผิดพลาดเล็กน้อย',
    5: 'ยอดเยี่ยม - แปลดีมาก!',
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</p>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => !disabled && onRate(star)}
            onMouseEnter={() => !disabled && setHover(star)}
            onMouseLeave={() => !disabled && setHover(0)}
            disabled={disabled}
            className={`
              transition-all duration-150
              ${disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
            `}
          >
            <svg
              className={`${starSize} ${star <= (hover || rating)
                  ? 'text-yellow-400 fill-current'
                  : 'text-gray-300 dark:text-gray-600'
                }`}
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
          </button>
        ))}

        {rating > 0 && (
          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
            {rating}/5
          </span>
        )}
      </div>

      {(hover > 0 || rating > 0) && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {labels[(hover || rating) as 1 | 2 | 3 | 4 | 5]}
        </p>
      )}
    </div>
  );
}
