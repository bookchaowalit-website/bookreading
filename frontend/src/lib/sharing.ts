'use client';

interface ShareReadingProgressProps {
  novelTitle: string;
  chapterNumber: number;
  totalChapters: number;
  readingStreak?: number;
  totalChaptersRead?: number;
}

export function shareReadingProgress({
  novelTitle,
  chapterNumber,
  totalChapters,
  readingStreak,
  totalChaptersRead,
}: ShareReadingProgressProps) {
  const progress = Math.round((chapterNumber / totalChapters) * 100);

  const text = [
    `📚 ฉันกำลังอ่าน "${novelTitle}"`,
    `📖 บทที่ ${chapterNumber}/${totalChapters} (${progress}%)`,
    readingStreak ? `🔥 อ่านต่อเนื่อง ${readingStreak} วัน!` : '',
    totalChaptersRead ? `📚 อ่านไปแล้ว ${totalChaptersRead} บท` : '',
    '',
    'มาอ่านด้วยกันที่ BookReading!',
  ].filter(Boolean).join('\n');

  if (navigator.share) {
    navigator.share({
      title: `กำลังอ่าน ${novelTitle}`,
      text,
      url: window.location.origin,
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('คัดลอกข้อความแล้ว! วางในโซเชียลมีเดียได้เลย');
    });
  }
}

export function shareAchievement(achievement: string, details: string) {
  const text = `🏆 ความสำเร็จใหม่!\n\n${achievement}\n${details}\n\n📚 จาก BookReading`;

  if (navigator.share) {
    navigator.share({
      title: 'ความสำเร็จใหม่!',
      text,
      url: window.location.origin,
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('คัดลอกข้อความแล้ว!');
    });
  }
}

export function shareNovel(url: string, title: string) {
  const text = `📚 พบนิยายเรื่อง "${title}" น่าสนใจมาก! มาอ่านด้วยกันที่ BookReading`;

  if (navigator.share) {
    navigator.share({
      title: `อ่าน ${title}`,
      text,
      url,
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(`${text}\n${url}`).then(() => {
      alert('คัดลอกลิงก์แล้ว!');
    });
  }
}
