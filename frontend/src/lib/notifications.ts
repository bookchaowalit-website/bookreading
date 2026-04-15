// Web Push notification helper
// Uses the browser's Notification API (no service worker required for basic notifications)

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
}

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return Promise.resolve('denied');
  }
  return Notification.requestPermission();
}

export function sendNotification({ title, body, icon, tag, data }: NotificationOptions): void {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return;
  }

  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: icon || '/icon-192x192.png',
      tag,
      data,
      badge: '/icon-192x192.png',
    });
  }
}

// Notify when a tracked novel gets new chapters
export function notifyNewChapters(novelTitle: string, chapterCount: number): void {
  sendNotification({
    title: `📚 ${novelTitle} อัพเดทแล้ว!`,
    body: `มี ${chapterCount} บทใหม่พร้อมอ่านแล้ว`,
    tag: `novel-update-${novelTitle}`,
  });
}

// Notify when translation is complete
export function notifyTranslationComplete(chapterNumber: number): void {
  sendNotification({
    title: '✅ แปลเสร็จแล้ว!',
    body: `บทที่ ${chapterNumber} พร้อมอ่านแล้ว`,
    tag: 'translation-complete',
  });
}

// Notify on reading streak milestone
export function notifyStreakMilestone(days: number): void {
  const messages: Record<number, string> = {
    7: '🔥 7 วันต่อเนื่อง! คุณอ่านนิยายทุกวันเลย!',
    30: '🏆 30 วัน! สุดยอดนักอ่าน!',
    100: '👑 100 วัน! ตำนาน!',
  };

  sendNotification({
    title: `🎉 Streak ${days} วัน!`,
    body: messages[days] || `คุณอ่านนิยายต่อเนื่อง ${days} วันแล้ว!`,
    tag: 'streak-milestone',
  });
}

// Check and notify about reading session
export function checkAndNotifyReading(): void {
  const lastRead = localStorage.getItem('lastReadReminder');
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;

  if (!lastRead || now - parseInt(lastRead) > ONE_DAY) {
    sendNotification({
      title: '📖 ถึงเวลาอ่านนิยาย!',
      body: 'คุณยังไม่ได้อ่านนิยายวันนี้ มาอ่านต่อกันเถอะ!',
      tag: 'daily-reminder',
    });
    localStorage.setItem('lastReadReminder', now.toString());
  }
}
