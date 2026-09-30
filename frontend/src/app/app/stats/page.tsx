'use client';

import { useState, useEffect } from 'react';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import { BookOpen, Clock, Trophy, TrendingUp, Award, Calendar, Share2, ExternalLink, Flame, Gem, Star, Crown, Zap } from 'lucide-react';
import { shareReadingProgress, shareAchievement } from '@/lib/sharing';
import { readingStreak } from '@/lib/readingStats';

interface ReadingSession {
  novelId: string;
  title: string;
  chaptersRead: number;
  lastReadAt: number;
  totalProgress: number;
}

export default function StatsPage() {
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const { progressList, loading } = useReadingProgress(userId);

  const [stats, setStats] = useState({
    totalNovels: 0,
    totalChapters: 0,
    totalWords: 0,
    readingStreak: 0,
    lastReadDate: '',
    avgDailyChapters: 0,
  });

  const [sessions, setSessions] = useState<ReadingSession[]>([]);

  useEffect(() => {
    // Calculate stats from localStorage library
    const library = JSON.parse(localStorage.getItem('novelLibrary') || '[]');
    const readingHistory = JSON.parse(localStorage.getItem('readingHistory') || '[]');

    // Calculate total chapters read
    const totalChapters = library.reduce((acc: number, n: any) => acc + (n.chapterNumber || 0), 0);

    // Calculate total words (rough estimate: 500 words per chapter)
    const totalWords = totalChapters * 500;

    // Calculate reading streak
    const streak = calculateStreak(readingHistory);

    // Calculate average daily chapters
    const avgDaily = calculateAvgDaily(readingHistory);

    setStats({
      totalNovels: library.length,
      totalChapters,
      totalWords,
      readingStreak: streak,
      lastReadDate: library.length > 0 ? new Date(Math.max(...library.map((n: any) => n.lastReadAt || 0))).toLocaleDateString('th-TH') : '-',
      avgDailyChapters: avgDaily,
    });

    // Build reading sessions
    const sessionsList: ReadingSession[] = library
      .filter((n: any) => n.lastReadAt)
      .sort((a: any, b: any) => (b.lastReadAt || 0) - (a.lastReadAt || 0))
      .slice(0, 10)
      .map((n: any) => ({
        novelId: n.novelId || n.id,
        title: n.title || 'Unknown Novel',
        chaptersRead: n.chapterNumber || 0,
        lastReadAt: n.lastReadAt || 0,
        totalProgress: n.readingProgress || 0,
      }));

    setSessions(sessionsList);
  }, [progressList]);

  const calculateStreak = (history: any[]) => readingStreak(history);

  const calculateAvgDaily = (history: any[]) => {
    if (history.length === 0) return 0;

    const totalChapters = history.reduce((acc: number, h: any) => acc + (h.chaptersRead || 0), 0);
    const firstDate = new Date(Math.min(...history.map((h: any) => h.date || h.timestamp || h.lastReadAt || Date.now())));
    const days = Math.max(1, Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));

    return Math.round((totalChapters / days) * 10) / 10;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Trophy size={24} className="text-yellow-500" /> สถิติการอ่าน
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">ติดตามความคืบหน้าและสถิติการอ่านของคุณ</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <BookOpen size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalNovels}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">นิยาย</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <TrendingUp size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalChapters}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">บทที่อ่าน</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Award size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.readingStreak}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">วันต่อเนื่อง</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Clock size={20} className="text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.avgDailyChapters}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">บท/วัน</p>
            </div>
          </div>
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Trophy size={20} /> ความสำเร็จ
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: <BookOpen size={24} />, label: 'อ่านบทแรก', unlocked: stats.totalChapters >= 1 },
            { icon: <BookOpen size={24} />, label: 'อ่าน 10 บท', unlocked: stats.totalChapters >= 10 },
            { icon: <Flame size={24} />, label: 'อ่าน 50 บท', unlocked: stats.totalChapters >= 50 },
            { icon: <Gem size={24} />, label: 'อ่าน 100 บท', unlocked: stats.totalChapters >= 100 },
            { icon: <Star size={24} />, label: 'อ่าน 500 บท', unlocked: stats.totalChapters >= 500 },
            { icon: <Crown size={24} />, label: 'อ่าน 1000 บท', unlocked: stats.totalChapters >= 1000 },
            { icon: <Zap size={24} />, label: 'Streak 7 วัน', unlocked: stats.readingStreak >= 7 },
            { icon: <Trophy size={24} />, label: 'Streak 30 วัน', unlocked: stats.readingStreak >= 30 },
          ].map((milestone, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border text-center transition-all ${milestone.unlocked
                ? 'bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 opacity-50'
                }`}
            >
              <div className="text-2xl mb-1">{milestone.icon}</div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{milestone.label}</p>
              {milestone.unlocked && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">✓ ปลดล็อกแล้ว</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Reading Sessions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Calendar size={20} /> ประวัติการอ่านล่าสุด
        </h2>

        {sessions.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-50" />
            <p>ยังไม่มีประวัติการอ่าน</p>
            <p className="text-sm mt-1">เริ่มอ่านนิยายเพื่อบันทึกประวัติ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{session.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    บทที่ {session.chaptersRead} • อ่านล่าสุด {new Date(session.lastReadAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <div className="w-24">
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${session.totalProgress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                    {session.totalProgress}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Total Words */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-100">คำที่แปลทั้งหมด</p>
            <p className="text-3xl font-bold">{stats.totalWords.toLocaleString()}</p>
            <p className="text-xs text-blue-200 mt-1">≈ {(stats.totalWords / 1000).toFixed(1)}K คำ</p>
          </div>
          <Award size={48} className="text-blue-200 opacity-50" />
        </div>
      </div>

      {/* Share Progress */}
      {stats.totalChapters > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Share2 size={20} /> แชร์ความคืบหน้า
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => {
                const firstNovel = sessions[0];
                if (firstNovel) {
                  shareReadingProgress({
                    novelTitle: firstNovel.title,
                    chapterNumber: firstNovel.chaptersRead,
                    totalChapters: Math.max(firstNovel.chaptersRead, 100),
                    readingStreak: stats.readingStreak,
                    totalChaptersRead: stats.totalChapters,
                  });
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
            >
              <Share2 size={16} /> แชร์นิยายที่อ่าน
            </button>
            {stats.readingStreak >= 7 && (
              <button
                onClick={() => {
                  shareAchievement(`🔥 อ่านต่อเนื่อง ${stats.readingStreak} วัน!`, `อ่านไปแล้ว ${stats.totalChapters} บท`);
                }}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm flex items-center gap-2"
              >
                <ExternalLink size={16} /> แชร์ Streak
              </button>
            )}
            {stats.totalChapters >= 50 && (
              <button
                onClick={() => {
                  shareAchievement(`📚 อ่าน ${stats.totalChapters} บทแล้ว!`, `อ่าน ${stats.totalNovels} นิยาย`);
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-2"
              >
                <Trophy size={16} /> แชร์ความสำเร็จ
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
