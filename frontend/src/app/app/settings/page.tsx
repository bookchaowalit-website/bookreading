'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { Settings as SettingsIcon, AlertTriangle, Bell, Trash2, XCircle, Save } from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const { success, error, warning, info } = useToast();
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

  // New: Notification settings
  const [autoUpdateNotifications, setAutoUpdateNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [updateCheckInterval, setUpdateCheckInterval] = useState(6);

  // API Keys
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // Load API keys from backend if authenticated
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  useEffect(() => {
    if (token) {
      fetch('/api/settings/api-keys', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.data) {
            data.data.forEach((key: any) => {
              if (key.provider === 'openai') {
                setOpenaiKeyLoaded(true);
                setOpenaiKeyMasked(`${key.key_prefix}...`);
              }
              if (key.provider === 'gemini') {
                setGeminiKeyLoaded(true);
                setGeminiKeyMasked(`${key.key_prefix}...`);
              }
            });
          }
        })
        .catch(() => {
          // Fall back to localStorage if API fails
          const settings = localStorage.getItem('appSettings');
          if (settings) {
            const parsed = JSON.parse(settings);
            setOpenaiApiKey(parsed.openaiApiKey || '');
            setGeminiApiKey(parsed.geminiApiKey || '');
          }
        });
    } else {
      // No token, load from localStorage
      const settings = localStorage.getItem('appSettings');
      if (settings) {
        const parsed = JSON.parse(settings);
        setOpenaiApiKey(parsed.openaiApiKey || '');
        setGeminiApiKey(parsed.geminiApiKey || '');
      }
    }
  }, [token]);

  const [openaiKeyLoaded, setOpenaiKeyLoaded] = useState(false);
  const [openaiKeyMasked, setOpenaiKeyMasked] = useState('');
  const [geminiKeyLoaded, setGeminiKeyLoaded] = useState(false);
  const [geminiKeyMasked, setGeminiKeyMasked] = useState('');

  const handleSaveApiKey = async (provider: 'openai' | 'gemini', key: string) => {
    if (!token) {
      // Save to localStorage if not authenticated
      const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
      settings[provider === 'openai' ? 'openaiApiKey' : 'geminiApiKey'] = key;
      localStorage.setItem('appSettings', JSON.stringify(settings));
      success(`บันทึก ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API Key แล้ว`);
      return;
    }

    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ provider, api_key: key }),
      });

      if (res.ok) {
        if (provider === 'openai') {
          setOpenaiKeyLoaded(true);
          setOpenaiKeyMasked(`${key.substring(0, 8)}...`);
        } else {
          setGeminiKeyLoaded(true);
          setGeminiKeyMasked(`${key.substring(0, 8)}...`);
        }
        success(`บันทึก ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API Key บนเซิร์ฟเวอร์แล้ว`);
      } else {
        error('ไม่สามารถบันทึก API Key ได้');
      }
    } catch (err) {
      error('เกิดข้อผิดพลาดในการบันทึก API Key');
    }
  };

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
      setAutoUpdateNotifications(parsed.autoUpdateNotifications !== false);
      setEmailNotifications(parsed.emailNotifications || false);
      setUpdateCheckInterval(parsed.updateCheckInterval || 6);
    }
  }, []);

  const handleSaveSettings = async () => {
    // Save general settings to localStorage
    localStorage.setItem('appSettings', JSON.stringify({
      defaultFontSize,
      defaultViewMode,
      autoTranslate,
      translationProvider,
      twoStepTranslation,
      pronounStyle,
      defaultGenre,
      defaultTone,
      autoUpdateNotifications,
      emailNotifications,
      updateCheckInterval,
    }));

    // Save API keys to backend if authenticated
    if (token) {
      if (openaiApiKey) {
        await handleSaveApiKey('openai', openaiApiKey);
      }
      if (geminiApiKey) {
        await handleSaveApiKey('gemini', geminiApiKey);
      }
    } else {
      // Save API keys to localStorage if not authenticated
      const settings = JSON.parse(localStorage.getItem('appSettings') || '{}');
      settings.openaiApiKey = openaiApiKey;
      settings.geminiApiKey = geminiApiKey;
      localStorage.setItem('appSettings', JSON.stringify(settings));
    }

    success('บันทึกการตั้งค่าแล้ว');
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('user');
    router.push('/');
  };

  const handleDeleteAccount = () => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะลบบัญชี? การกระทำนี้ไม่สามารถย้อนกลับได้')) {
      localStorage.clear();
      success('ลบบัญชีเรียบร้อยแล้ว');
      router.push('/');
    }
  };

  const handleClearData = () => {
    if (confirm('คุณแน่ใจหรือไม่ที่จะล้างข้อมูลทั้งหมด?')) {
      localStorage.removeItem('novelLibrary');
      localStorage.removeItem('customTerminology');
      success('ล้างข้อมูลแล้ว');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white"><SettingsIcon size={24} className="inline" /> การตั้งค่า</h1>

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
              <AlertTriangle size={12} className="inline" /> ต้องตั้งค่า API Key ด้านล่างก่อนใช้งาน
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
                placeholder={openaiKeyLoaded ? openaiKeyMasked : 'sk-...'}
                className="w-full px-3 py-2 pr-24 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white font-mono text-sm"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {openaiKeyLoaded && (
                  <span className="text-xs text-green-600 dark:text-green-400 mr-2">✓ บันทึกแล้ว</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showOpenaiKey ? '🙈' : '👁️'}
                </button>
              </div>
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
                placeholder={geminiKeyLoaded ? geminiKeyMasked : 'AIza...'}
                className="w-full px-3 py-2 pr-24 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white font-mono text-sm"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {geminiKeyLoaded && (
                  <span className="text-xs text-green-600 dark:text-green-400 mr-2">✓ บันทึกแล้ว</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {showGeminiKey ? '🙈' : '👁️'}
                </button>
              </div>
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

      {/* New: Notification Settings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4"><Bell size={20} className="inline" /> การแจ้งเตือนอัพเดทอัตโนมัติ</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">แจ้งเตือนอัพเดทนิยาย</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">แจ้งเตือนเมื่อนิยายที่ติดตามมีบทใหม่</p>
            </div>
            <button
              onClick={() => {
                setAutoUpdateNotifications(!autoUpdateNotifications);
                if (!autoUpdateNotifications) {
                  // Request notification permission when enabling
                  import('@/lib/notifications').then(({ requestNotificationPermission }) => {
                    requestNotificationPermission().then(perm => {
                      if (perm === 'granted') {
                        success('เปิดการแจ้งเตือนเรียบร้อย!');
                      }
                    });
                  });
                }
              }}
              className={`w-12 h-6 rounded-full transition-colors ${autoUpdateNotifications ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${autoUpdateNotifications ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">แจ้งเตือนการอ่านประจำวัน</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">เตือนให้อ่านนิยายทุกวัน</p>
            </div>
            <button
              onClick={() => {
                import('@/lib/notifications').then(({ requestNotificationPermission }) => {
                  requestNotificationPermission().then(perm => {
                    if (perm === 'granted') {
                      success('เปิดการแจ้งเตือนเรียบร้อย!');
                    }
                  });
                });
              }}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              เปิดใช้งาน
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">แจ้งเตือนทางอีเมล</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">ส่งการแจ้งเตือนไปยังอีเมล (กำลังมาเร็วๆ นี้)</p>
            </div>
            <button
              onClick={() => setEmailNotifications(!emailNotifications)}
              disabled
              className={`w-12 h-6 rounded-full transition-colors ${emailNotifications ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'} opacity-50 cursor-not-allowed`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${emailNotifications ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-300 mb-2">
              ความถี่ในการตรวจสอบอัพเดท (ชั่วโมง)
            </label>
            <select
              value={updateCheckInterval}
              onChange={(e) => setUpdateCheckInterval(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
            >
              <option value={1}>ทุก 1 ชั่วโมง</option>
              <option value={3}>ทุก 3 ชั่วโมง</option>
              <option value={6}>ทุก 6 ชั่วโมง</option>
              <option value={12}>ทุก 12 ชั่วโมง</option>
              <option value={24}>ทุกวัน</option>
            </select>
          </div>
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
            <Trash2 size={16} className="inline" /> ล้างข้อมูลนิยายและคำศัพท์
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
            <XCircle size={16} className="inline" /> ลบบัญชี
          </button>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSaveSettings}
        className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
      >
        <Save size={20} className="inline" /> บันทึกการตั้งค่า
      </button>

      {/* Version */}
      <div className="text-center text-sm text-gray-400 dark:text-gray-500">
        BookReading v1.0.0
      </div>
    </div>
  );
}
