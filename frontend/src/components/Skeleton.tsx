'use client';

interface SkeletonProps {
  count?: number;
  variant?: 'card' | 'text' | 'title' | 'avatar' | 'thumbnail' | 'table-row';
  className?: string;
}

export default function Skeleton({ count = 1, variant = 'card', className = '' }: SkeletonProps) {
  const baseClasses = 'animate-pulse bg-gray-200 dark:bg-gray-700 rounded';

  const variantClasses: Record<string, string> = {
    card: 'h-48 w-full rounded-xl',
    text: 'h-4 w-full',
    'text-sm': 'h-3 w-3/4',
    title: 'h-6 w-2/3',
    avatar: 'h-10 w-10 rounded-full',
    thumbnail: 'h-20 w-16 rounded-lg',
    'table-row': 'h-12 w-full',
  };

  const renderSkeleton = (index: number) => (
    <div key={index} className={`${baseClasses} ${variantClasses[variant] || variantClasses.card} ${className}`} />
  );

  return (
    <>
      {Array.from({ length: count }).map((_, i) => renderSkeleton(i))}
    </>
  );
}
