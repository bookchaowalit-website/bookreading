'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [defaultFontSize, setDefaultFontSize] = useState('medium');
  const [defaultViewMode, setDefaultViewMode] = useState('translated');
  const [autoTranslate, setAutoTranslate] = useState(true);

  // Translation settings
  const [translationProvider, setTranslationProvider] = useState<'openai' | 'gemini' | 'google'>('openai');
  const [twoStepTranslation, setTwoStepTranslation] = useState(true);
  const [pronounStyle, setPronounStyle] = useState<'traditional' | 'modern'>('traditional');
  const [defaultGenre, setDefaultGenre] = useState('fantasy');
  const [defaultTone, setDefaultTone] = useState('dark');

  // API Keys
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }

    if (typeof window !== 'undefined') {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    // Load settings
    const settings = localStorage.getItem('appSettings');
    if (settings) {
      const parsed = JSON.parse(settings);
      setDefaultFontSize(parsed.defaultFontSize || 'medium');
      setDefaultViewMode(parsed.defaultViewMode || 'translated');
      setAutoTranslate(parsed.autoTranslate !== false);
      setTranslationProvider(parsed.translationProvider || 'openai');
      setTwoStepTranslation(parsed.twoStepTranslation !== false);
      setPronounStyle(parsed.pronounStyle || 'traditional');
      setDefaultGenre(parsed.defaultGenre || 'fantasy');
      setDefaultTone(parsed.defaultTone || 'dark');
      setOpenaiApiKey(parsed.openaiApiKey || '');
      setGeminiApiKey(parsed.geminiApiKey || '');
    }
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('appSettings', JSON.stringify({
      defaultFontSize,
      defaultViewMode,
      autoTranslate,
      translationProvider,
      twoStepTranslation,
      pronounStyle,
      defaultGenre,
      defaultTone,
      openaiApiKey,
      geminiApiKey,
    }));
    alert('บันทึกการตั้งค่าแล้ว');
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    router.push('/');
  };

  const handleDeleteAccount = () => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะลบบัญชี? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      localStorage.clear();
      router.push('/');
    }
  };

  const handleClearData = () => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะล้างข้อมูลทั้งหมด?')) {
      localStorage.removeItem('novelLibrary');
      localStorage.removeItem('customTerminology');
      alert('ล้างข้อมูลแล้ว');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">⚙️ การตั้งค่า</h1>

      {/* Profile Section */}
      {user && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">โปรไฟล์</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-2xl font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{user.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* Reading Settings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">การอ่าน</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              ขนาดตัวอักษรเริ่มต้น
            </label>
            <select
              value={defaultFontSize}
              onChange={(e) => setDefaultFontSize(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value="small">เล็ก</option>
              <option value="medium">กลาง</option>
              <option value="large">ใหญ่</option>
              <option value="xlarge">ใหญ่มาก</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              มุมมองเริ่มต้น
            </label>
            <select
              value={defaultViewMode}
              onChange={(e) => setDefaultViewMode(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value="original">🇨🇳 ต้นฉบับ</option>
              <option value="translated">🇹🇭 แปลไทย</option>
              <option value="sideBySide">⚖️ เทียบกัน</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">แปลอัตโนมัติ</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">แปลเนื้อหาโดยอัตโนมัติเมื่อเปิดนิยาย</p>
            </div>
            <button
              onClick={() => setAutoTranslate(!autoTranslate)}
              className={`w-12 h-6 rounded-full transition-colors ${autoTranslate ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${autoTranslate ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Translation Settings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">🤖 การแปล AI</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              ผู้ให้บริการ AI
            </label>
            <select
              value={translationProvider}
              onChange={(e) => setTranslationProvider(e.target.value as 'openai' | 'gemini' | 'google')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value="openai">OpenAI (GPT-4o/GPT-5) - ดีเรื่องตรรกะและศัพท์เฉพาะ</option>
              <option value="gemini">Google Gemini - ดีเรื่อง context ยาวและหลายภาษา</option>
              <option value="google">Google Translate - ฟรี แต่คุณภาพต่ำกว่า</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ⚠️ ต้องตั้งค่า API Key ด้านล่างก่อนใช้งาน
            </p>
          </div>

          {/* OpenAI API Key */}
          <div className={`p-4 rounded-lg border ${translationProvider === 'openai' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-900 dark:text-white">
                🔑 OpenAI API Key
              </label>
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                รับ API Key →
              </a>
            </div>
            <div className="relative">
              <input
                type={showOpenaiKey ? 'text' : 'password'}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showOpenaiKey ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ใช้สำหรับ GPT-4o / GPT-5 models
            </p>
          </div>

          {/* Gemini API Key */}
          <div className={`p-4 rounded-lg border ${translationProvider === 'gemini' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-900 dark:text-white">
                🔑 Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline"
              >
                รับ API Key →
              </a>
            </div>
            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showGeminiKey ? '🙈' : '👁️'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ใช้สำหรับ Gemini 1.5 Pro / Gemini 3.1
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">แปลสองขั้นตอน</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">แปลตรงตัว → ขัดเกลาสำนวน</p>
            </div>
            <button
              onClick={() => setTwoStepTranslation(!twoStepTranslation)}
              className={`w-12 h-6 rounded-full transition-colors ${twoStepTranslation ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${twoStepTranslation ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              รูปแบบสรรพนาม
            </label>
            <select
              value={pronounStyle}
              onChange={(e) => setPronounStyle(e.target.value as 'traditional' | 'modern')}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value="traditional">แบบดั้งเดิม (ข้า/เจ้า) - เหมาะกับนิยายแฟนตาซี</option>
              <option value="modern">แบบสมัยใหม่ (ฉัน/คุณ) - เหมาะกับนิยายร่วมสมัย</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              ประเภทนิยายเริ่มต้น
            </label>
            <select
              value={defaultGenre}
              onChange={(e) => setDefaultGenre(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value="fantasy">แฟนตาซี</option>
              <option value="romance">รักโรแมนติก</option>
              <option value="scifi">ไซไฟ</option>
              <option value="action">แอ็คชั่น</option>
              <option value="mystery">สืบสวน</option>
              <option value="comedy">ตลก</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              โทนเรื่องเริ่มต้น
            </label>
            <select
              value={defaultTone}
              onChange={(e) => setDefaultTone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value="dark">มืด จริงจัง</option>
              <option value="light">สบายๆ อ่านสนุก</option>
              <option value="dramatic">ดราม่า อารมณ์</option>
              <option value="comedic">ตลกขบขัน</option>
            </select>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">รูปลักษณ์</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">โหมดมืด</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">เปลี่ยนธีมเป็นโหมดมืด</p>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">จัดการข้อมูล</h2>

        <div className="space-y-3">
          <button
            onClick={handleClearData}
            className="w-full py-2 border border-orange-300 dark:border-orange-700 text-orange-600 dark:text-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
          >
            🗑️ ล้างข้อมูลนิยายและคำศัพท์
          </button>
        </div>
      </div>

      {/* Account Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">บัญชี</h2>

        <div className="space-y-3">
          <button
            onClick={handleLogout}
            className="w-full py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            🚪 ออกจากระบบ
          </button>
          <button
            onClick={handleDeleteAccount}
            className="w-full py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            ❌ ลบบัญชี
          </button>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSaveSettings}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
      >
        💾 บันทึกการตั้งค่า
      </button>

      {/* Version */}
      <div className="text-center text-sm text-gray-400 dark:text-gray-500">
        BookReading v1.0.0
      </div>
    </div>
  );
}
