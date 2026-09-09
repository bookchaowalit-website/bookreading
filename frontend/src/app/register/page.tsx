'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useToast } from '@/providers/ToastProvider';
import { Eye, EyeOff, CheckCircle2, XCircle, AlertCircle, BookOpen } from 'lucide-react';

interface ValidationErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  acceptTerms?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Real-time validation
  const validateField = (field: string, value: any) => {
    let error: string | undefined;

    switch (field) {
      case 'name':
        if (!value) error = 'กรุณากรอกชื่อ';
        else if (value.length < 2) error = 'ชื่อต้องมีอย่างน้อย 2 ตัวอักษร';
        break;
      case 'email':
        if (!value) error = 'กรุณากรอกอีเมล';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'รูปแบบอีเมลไม่ถูกต้อง';
        break;
      case 'password':
        if (!value) error = 'กรุณากรอกรหัสผ่าน';
        else if (value.length < 8) error = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
        break;
      case 'confirmPassword':
        if (!value) error = 'กรุณายืนยันรหัสผ่าน';
        else if (value !== password) error = 'รหัสผ่านไม่ตรงกัน';
        break;
      case 'acceptTerms':
        if (!value) error = 'กรุณายอมรับข้อกำหนดการใช้งาน';
        break;
    }

    setErrors(prev => ({ ...prev, [field]: error }));
    return !error;
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    validateField(field, field === 'acceptTerms' ? acceptTerms :
      field === 'name' ? name :
        field === 'email' ? email :
          field === 'password' ? password : confirmPassword);
  };

  // Check if form is valid
  const isFormValid = (): boolean => {
    const isNameValid = name.length >= 2;
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isPasswordValid = password.length >= 8;
    const isConfirmValid = confirmPassword === password && confirmPassword.length > 0;
    const isTermsAccepted = acceptTerms;
    return isNameValid && isEmailValid && isPasswordValid && isConfirmValid && isTermsAccepted;
  };

  // Password strength
  const getPasswordStrength = (): { score: number; label: string; color: string } => {
    if (!password) return { score: 0, label: '', color: '' };
    if (password.length < 8) return { score: 1, label: 'สั้นเกินไป', color: 'text-red-500' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { score: 1, label: 'อ่อนมาก', color: 'text-red-500' };
    if (score <= 2) return { score: 2, label: 'อ่อน', color: 'text-yellow-500' };
    if (score <= 3) return { score: 3, label: 'ปานกลาง', color: 'text-blue-500' };
    return { score: 4, label: 'แข็งแรง', color: 'text-green-500' };
  };

  const passwordStrength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      showError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (password !== confirmPassword) {
      showError('รหัสผ่านไม่ตรงกัน');
      setError('รหัสผ่านไม่ตรงกัน');
      return;
    }

    if (password.length < 8) {
      showError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (!acceptTerms) {
      showError('กรุณายอมรับข้อกำหนดการใช้งาน');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authApi.register(email, password, name);
      // Token is now stored in httpOnly cookie automatically
      // Keep isLoggedIn and user for UI state
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('user', JSON.stringify(result.user));
      // Remove old token from localStorage if it exists
      localStorage.removeItem('token');
      success('สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ ' + name);
      router.push('/app');
    } catch (err: any) {
      const message = err.response?.data?.error || 'Registration failed. Please try again.';
      setError(message);
      showError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center px-4 py-8">
      <main id="main-content" role="main">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <BookOpen size={32} />
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              BookReading
            </span>
          </Link>
        </div>

        {/* Register Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
            สมัครสมาชิก
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-center mb-6">
            เริ่มอ่านนิยายฟรีวันนี้
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ชื่อ
              </label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => handleBlur('name')}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white ${touched.name && errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                placeholder="ชื่อของคุณ"
                autoComplete="name"
              />
              {touched.name && errors.name && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <XCircle size={14} /> {errors.name}
                </p>
              )}
              {touched.name && !errors.name && name.length >= 2 && (
                <p className="mt-1 text-sm text-green-500 flex items-center gap-1">
                  <CheckCircle2 size={14} /> ใช้ได้
                </p>
              )}
            </div>

            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                อีเมล
              </label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur('email')}
                className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white ${touched.email && errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  }`}
                placeholder="your@email.com"
                autoComplete="email"
              />
              {touched.email && errors.email && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <XCircle size={14} /> {errors.email}
                </p>
              )}
              {touched.email && !errors.email && email.length > 0 && (
                <p className="mt-1 text-sm text-green-500 flex items-center gap-1">
                  <CheckCircle2 size={14} /> ใช้ได้
                </p>
              )}
            </div>

            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur('password')}
                  className={`w-full px-4 py-3 pr-12 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white ${touched.password && errors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {/* Password strength indicator */}
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map(level => (
                      <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${passwordStrength.score >= level
                          ? level <= 1 ? 'bg-red-500'
                            : level <= 2 ? 'bg-yellow-500'
                              : level <= 3 ? 'bg-blue-500'
                                : 'bg-green-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                          }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs ${passwordStrength.color}`}>
                    {passwordStrength.score <= 1 ? <XCircle size={12} className="inline mr-1" /> :
                      passwordStrength.score <= 2 ? <AlertCircle size={12} className="inline mr-1" /> :
                        <CheckCircle2 size={12} className="inline mr-1" />}
                    {passwordStrength.label}
                  </p>
                </div>
              )}
              {touched.password && errors.password && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <XCircle size={14} /> {errors.password}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                ยืนยันรหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="register-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={() => handleBlur('confirmPassword')}
                  className={`w-full px-4 py-3 pr-12 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white ${touched.confirmPassword && errors.confirmPassword ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                    }`}
                  placeholder="กรอกรหัสผ่านอีกครั้ง"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label={showConfirmPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {confirmPassword && confirmPassword === password && (
                <p className="mt-1 text-sm text-green-500 flex items-center gap-1">
                  <CheckCircle2 size={14} /> รหัสผ่านตรงกัน
                </p>
              )}
              {touched.confirmPassword && errors.confirmPassword && (
                <p className="mt-1 text-sm text-red-500 flex items-center gap-1">
                  <XCircle size={14} /> {errors.confirmPassword}
                </p>
              )}
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                required
              />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                ฉันยอมรับ{' '}
                <Link href="/terms" className="text-blue-600 hover:underline">ข้อกำหนดการใช้งาน</Link>
                {' '}และ{' '}
                <Link href="/privacy" className="text-blue-600 hover:underline">นโยบายความเป็นส่วนตัว</Link>
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading || !isFormValid()}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'กำลังสมัครสมาชิก...' : 'สมัครสมาชิก'}
            </button>
          </form>

          <p className="mt-6 text-center text-gray-600 dark:text-gray-400">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="text-blue-600 hover:underline font-medium">
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>

        {/* Back to home */}
        <div className="mt-6 text-center">
          <Link href="/" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            ← กลับหน้าแรก
          </Link>
        </div>
      </div>
      </main>
    </div>
  );
}
