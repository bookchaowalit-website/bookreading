'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { BookOpen, Library, Database, Smartphone, Moon, Sun, Sparkles, Check } from 'lucide-react';

export default function LandingPage() {
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  const features = [
    {
      icon: <BookOpen size={28} className="text-white" />,
      title: 'ดึงนิยายอัตโนมัติ',
      description: 'วางลิงก์แล้วอ่านได้เลย รองรับเว็บนิยายจีนหลากหลายแหล่ง',
      color: 'from-blue-500 to-blue-600',
    },
    {
      icon: <Sparkles size={28} className="text-white" />,
      title: 'แปลอัจฉริยะ',
      description: 'แปลจีนเป็นไทยด้วย AI พร้อมระบบจำคำศัพท์ตัวละคร',
      color: 'from-purple-500 to-purple-600',
    },
    {
      icon: <Library size={28} className="text-white" />,
      title: 'จัดการคำศัพท์',
      description: 'ชื่อตัวละครสอดคล้องตลอดเรื่อง ไม่เพี้ยน ปรับแก้ได้เอง',
      color: 'from-green-500 to-green-600',
    },
    {
      icon: <Database size={28} className="text-white" />,
      title: 'บันทึกและซิงค์',
      description: 'บันทึกนิยายโปรด ติดตามความคืบหน้าการอ่าน',
      color: 'from-orange-500 to-orange-600',
    },
    {
      icon: <Moon size={28} className="text-white" />,
      title: 'โหมดกลางคืน',
      description: 'อ่านสบายตาทั้งกลางวันและกลางคืน ปรับขนาดตัวอักษรได้',
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      icon: <Smartphone size={28} className="text-white" />,
      title: 'รองรับทุกอุปกรณ์',
      description: 'ใช้งานได้บนมือถือ แท็บเล็ต และคอมพิวเตอร์',
      color: 'from-pink-500 to-pink-600',
    },
  ];

  const pricingPlans = [
    {
      name: 'ฟรี',
      price: '฿0',
      period: '/เดือน',
      description: 'สำหรับผู้เริ่มต้น',
      features: [
        'แปลนิยายไม่จำกัด',
        'บันทึกนิยายได้ 5 เรื่อง',
        'จัดการคำศัพท์พื้นฐาน',
        'รองรับโฆษณา',
      ],
      cta: 'เริ่มต้นฟรี',
      popular: false,
    },
    {
      name: 'โปร',
      price: '฿99',
      period: '/เดือน',
      description: 'สำหรับนักอ่านตัวยง',
      features: [
        'แปลนิยายไม่จำกัด',
        'บันทึกนิยายไม่จำกัด',
        'จัดการคำศัพท์ขั้นสูง',
        'ไม่มีโฆษณา',
        'ส่งออกไฟล์ PDF/EPUB',
        'ซิงค์ข้ามอุปกรณ์',
      ],
      cta: 'เริ่มทดลองฟรี 7 วัน',
      popular: true,
    },
    {
      name: 'ทีม',
      price: '฿299',
      period: '/เดือน',
      description: 'สำหรับทีมแปล',
      features: [
        'ทุกอย่างในแผนโปร',
        'แชร์คำศัพท์ร่วมกัน',
        'ร่วมแปลนิยายได้',
        'API access',
        'รองรับลูกค้าพิเศษ',
      ],
      cta: 'ติดต่อเรา',
      popular: false,
    },
  ];

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <BookOpen size={32} />
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                BookReading
              </span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                คุณสมบัติ
              </a>
              <a href="#pricing" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                ราคา
              </a>
              <a href="#faq" className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
                คำถามที่พบบ่อย
              </a>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <Link
                href="/login"
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity"
              >
                สมัครสมาชิก
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
            <div className="px-4 py-4 space-y-4">
              <a href="#features" className="block text-gray-600 dark:text-gray-300">คุณสมบัติ</a>
              <a href="#pricing" className="block text-gray-600 dark:text-gray-300">ราคา</a>
              <a href="#faq" className="block text-gray-600 dark:text-gray-300">คำถามที่พบบ่อย</a>
              <hr className="border-gray-200 dark:border-gray-700" />
              <Link href="/login" className="block text-gray-600 dark:text-gray-300">เข้าสู่ระบบ</Link>
              <Link href="/register" className="block w-full text-center px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg">
                สมัครสมาชิก
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-4 bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-16 md:py-24">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full text-sm mb-6">
              <Sparkles size={14} />
              <span>ใหม่! รองรับการแปลด้วย AI ที่แม่นยำขึ้น</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
              อ่านนิยายจีนแปลไทย
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                ง่าย สะดวก แม่นยำ
              </span>
            </h1>

            <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-2xl mx-auto">
              แปลนิยายจีนเป็นไทยด้วย AI พร้อมระบบจัดการคำศัพท์
              ทำให้ชื่อตัวละครและคำศัพท์สอดคล้องตลอดเรื่อง
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-blue-500/25"
              >
                เริ่มอ่านฟรี
              </Link>
              <a
                href="#features"
                className="w-full sm:w-auto px-8 py-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                ดูคุณสมบัติ
              </a>
            </div>

            {/* Stats */}
            <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">10K+</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">ผู้ใช้งาน</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">1M+</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">บทแปล</div>
              </div>
              <div className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">50+</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">แหล่งนิยาย</div>
              </div>
            </div>
          </div>

          {/* Hero Image / Demo */}
          <div className="relative max-w-5xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl blur-3xl opacity-20"></div>
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 bg-blue-200 dark:bg-blue-900/50 rounded w-3/4"></div>
                    <div className="h-4 bg-blue-200 dark:bg-blue-900/50 rounded w-full"></div>
                    <div className="h-4 bg-blue-200 dark:bg-blue-900/50 rounded w-5/6"></div>
                    <div className="h-4 bg-blue-200 dark:bg-blue-900/50 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              คุณสมบัติเด่น
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
              เครื่องมือที่ช่วยให้คุณอ่านนิยายจีนได้สะดวกและเพลิดเพลินยิ่งขึ้น
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl transition-all hover:-translate-y-1"
              >
                <div className={`w-14 h-14 bg-gradient-to-br ${feature.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 px-4 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              วิธีใช้งาน
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              เริ่มอ่านนิยายได้ใน 3 ขั้นตอนง่ายๆ
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'วางลิงก์', description: 'คัดลอกลิงก์นิยายจากเว็บที่รองรับ แล้ววางในช่องกรอก' },
              { step: '2', title: 'แปลไทย', description: 'กดปุ่มแปล รอสักครู่ แล้วอ่านนิยายภาษาไทยได้ทันที' },
              { step: '3', title: 'จัดการคำศัพท์', description: 'ปรับแก้คำแปลตัวละครและคำศัพท์ได้ตามต้องการ' },
            ].map((item, index) => (
              <div key={index} className="relative text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4">
                  {item.step}
                </div>
                {index < 2 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-blue-300 to-purple-300 dark:from-blue-700 dark:to-purple-700"></div>
                )}
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              แผนราคา
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              เลือกแผนที่เหมาะกับคุณ
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingPlans.map((plan, index) => (
              <div
                key={index}
                className={`relative p-6 rounded-2xl border-2 ${plan.popular
                  ? 'border-blue-500 dark:border-blue-400 shadow-xl'
                  : 'border-gray-200 dark:border-gray-700'
                  } bg-white dark:bg-gray-800`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold rounded-full">
                    ยอดนิยม
                  </div>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">{plan.price}</span>
                    <span className="text-gray-500 dark:text-gray-400">{plan.period}</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, fIndex) => (
                    <li key={fIndex} className="flex items-center gap-3 text-gray-600 dark:text-gray-300">
                      <Check size={16} className="text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/register"
                  className={`block w-full py-3 text-center rounded-xl font-semibold transition-colors ${plan.popular
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90'
                    : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4 bg-gray-50 dark:bg-gray-800">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              คำถามที่พบบ่อย
            </h2>
          </div>

          <div className="space-y-4">
            {[
              { q: 'รองรับเว็บนิยายอะไรบ้าง?', a: 'ปัจจุบันรองรับ piaotia.com, qidian.com และเว็บนิยายจีนอื่นๆ อีกมากมาย' },
              { q: 'การแปลแม่นยำแค่ไหน?', a: 'เราใช้ AI แปลพร้อมระบบจัดการคำศัพท์ ทำให้ชื่อตัวละครและคำศัพท์สอดคล้องตลอดเรื่อง คุณยังสามารถปรับแก้คำแปลได้เอง' },
              { q: 'ข้อมูลของฉันปลอดภัยไหม?', a: 'เราเก็บข้อมูลอย่างปลอดภัยและไม่เปิดเผยข้อมูลส่วนบุคคลของคุณให้บุคคลที่สาม' },
              { q: 'สามารถยกเลิกสมาชิกได้ไหม?', a: 'สามารถยกเลิกได้ทุกเมื่อ ไม่มีค่าธรรมเนียมการยกเลิก' },
            ].map((faq, index) => (
              <details
                key={index}
                className="group bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <summary className="flex items-center justify-between p-6 cursor-pointer">
                  <span className="font-semibold text-gray-900 dark:text-white">{faq.q}</span>
                  <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="px-6 pb-6 text-gray-600 dark:text-gray-300">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            เริ่มอ่านนิยายวันนี้
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            สมัครฟรี ไม่ต้องใช้บัตรเครดิต
          </p>
          <Link
            href="/register"
            className="inline-block px-8 py-4 bg-white text-blue-600 rounded-xl font-semibold hover:bg-gray-100 transition-colors shadow-lg"
          >
            สมัครสมาชิกฟรี
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <BookOpen size={32} />
                <span className="text-xl font-bold">BookReading</span>
              </div>
              <p className="text-gray-400">
                แพลตฟอร์มอ่านนิยายจีนแปลไทยที่ดีที่สุด
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">ผลิตภัณฑ์</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white">คุณสมบัติ</a></li>
                <li><a href="#pricing" className="hover:text-white">ราคา</a></li>
                <li><a href="#" className="hover:text-white">API</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">บริษัท</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">เกี่ยวกับเรา</a></li>
                <li><a href="#" className="hover:text-white">บล็อก</a></li>
                <li><a href="#" className="hover:text-white">ติดต่อ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">กฎหมาย</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">นโยบายความเป็นส่วนตัว</a></li>
                <li><a href="#" className="hover:text-white">ข้อกำหนดการใช้งาน</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>© 2024 BookReading. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
