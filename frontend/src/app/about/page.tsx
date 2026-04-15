'use client';

import { BookOpen, Languages, Shield, Zap } from 'lucide-react';
import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">เกี่ยวกับ BookReading</h1>

      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white mb-8">
        <h2 className="text-2xl font-bold mb-3">อ่านนิยายแปลด้วย AI</h2>
        <p className="text-blue-100 text-lg">
          BookReading ใช้ AI แปลนิยายจีน เกาหลี ญี่ปุ่น เป็นภาษาไทยแบบเรียลไทม์
          พร้อมระบบจดจำศัพท์เฉพาะเพื่อคุณภาพการแปลที่ดีขึ้นเรื่อยๆ
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 mb-8">
        {[
          {
            icon: <BookOpen size={24} />,
            title: 'นิยายหลากหลาย',
            desc: 'อ่านนิยายจาก Piaotia, Qidian และแหล่งอื่นๆ',
          },
          {
            icon: <Languages size={24} />,
            title: 'แปลด้วย AI',
            desc: 'OpenAI GPT-4o และ Google Gemini คุณภาพสูง',
          },
          {
            icon: <Shield size={24} />,
            title: 'ข้อมูลปลอดภัย',
            desc: 'เข้ารหัส API Key ไม่เก็บข้อมูลส่วนตัวเกินจำเป็น',
          },
          {
            icon: <Zap size={24} />,
            title: 'รวดเร็ว',
            desc: 'แปลทั้งบทในไม่กี่วินาที พร้อมอ่านได้ทันที',
          },
        ].map((feature, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="text-blue-600 dark:text-blue-400 mb-3">{feature.icon}</div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{feature.title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{feature.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">ทำไมต้อง BookReading?</h2>
        <ul className="space-y-3 text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>ไม่ต้องรอคนแปล — AI แปลให้ทันที</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>ระบบจดจำศัพท์ — ตัวละคร สถานที่ ไอเทม แปลตรงทุกครั้ง</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>อ่านได้ทุกที่ — รองรับมือถือและแท็บเล็ต</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-500 mt-0.5">✓</span>
            <span>อ่านออฟไลน์ — ดาวน์โหลดเก็บไว้อ่านได้ไม่ต้องเน็ต</span>
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 justify-center">
        <Link href="/register" className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:opacity-90">
          เริ่มใช้งานฟรี
        </Link>
        <Link href="/contact" className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800">
          ติดต่อเรา
        </Link>
      </div>
    </div>
  );
}
