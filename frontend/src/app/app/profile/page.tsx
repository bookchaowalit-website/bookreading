'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, Edit2, Save, X, LogOut, Calendar, BookOpen, Trophy } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';

export default function ProfilePage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [user, setUser] = useState<{ name: string; email: string; createdAt?: string; plan?: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [stats, setStats] = useState({ novelsRead: 0, chaptersRead: 0 });

  useEffect(() => {
    // Load user profile from backend API
    const loadProfile = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/login');
        return;
      }

      try {
        const { getUserProfile } = await import('@/lib/new-api');
        const response = await getUserProfile();
        const userData = response.data;
        setUser(userData);
        setEditName(userData.name || '');
      } catch (err) {
        console.error('Failed to load profile from API, falling back to localStorage');
        // Fallback to localStorage
        const localData = localStorage.getItem('user');
        if (localData) {
          setUser(JSON.parse(localData));
        } else {
          router.push('/login');
        }
      }
    };

    loadProfile();

    // Load stats from library
    const library = JSON.parse(localStorage.getItem('novelLibrary') || '[]');
    setStats({
      novelsRead: library.length,
      chaptersRead: library.reduce((acc: number, n: any) => acc + (n.chapterNumber || 0), 0),
    });
  }, [router]);

  const handleSave = () => {
    if (!user) return;
    const updatedUser = { ...user, name: editName };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setIsEditing(false);
    success('บันทึกข้อมูลเรียบร้อย');
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userId');
    router.push('/');
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">โปรไฟล์</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">จัดการข้อมูลบัญชีของคุณ</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Avatar */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
              <User size={36} />
            </div>
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-xl font-bold bg-white/20 text-white rounded-lg px-3 py-1 outline-none"
                  autoFocus
                />
              ) : (
                <h2 className="text-xl font-bold">{user.name || 'ไม่ได้ตั้งชื่อ'}</h2>
              )}
              <p className="text-sm text-white/80 flex items-center gap-1">
                <Mail size={14} /> {user.email}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 flex items-center justify-between border-t border-gray-200 dark:border-gray-700">
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 text-sm"
              >
                <Save size={16} /> บันทึก
              </button>
              <button
                onClick={() => { setIsEditing(false); setEditName(user.name || ''); }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1 text-sm"
              >
                <X size={16} /> ยกเลิก
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 text-sm"
            >
              <Edit2 size={16} /> แก้ไขโปรไฟล์
            </button>
          )}
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-1 text-sm"
          >
            <LogOut size={16} /> ออกจากระบบ
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <BookOpen size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.novelsRead}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">นิยาย</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <BookOpen size={20} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.chaptersRead}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">บทที่อ่าน</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 col-span-2 md:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Trophy size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{user.plan || 'Free'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">แผน</p>
            </div>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">ข้อมูลบัญชี</h2>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-gray-500 dark:text-gray-400">อีเมล</span>
            <span className="text-gray-900 dark:text-white font-medium">{user.email}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-gray-500 dark:text-gray-400">ชื่อ</span>
            <span className="text-gray-900 dark:text-white font-medium">{user.name || '-'}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-500 dark:text-gray-400">สมาชิกตั้งแต่</span>
            <span className="text-gray-900 dark:text-white font-medium flex items-center gap-1">
              <Calendar size={14} /> {new Date().toLocaleDateString('th-TH')}
            </span>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => router.push('/app/settings')}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm"
        >
          ⚙️ การตั้งค่า
        </button>
        <button
          onClick={() => router.push('/app/stats')}
          className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm"
        >
          📊 สถิติ
        </button>
        <button
          onClick={() => router.push('/app/subscription')}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:opacity-90 text-sm"
        >
          💳 อัปเกรดแผน
        </button>
      </div>
    </div>
  );
}
