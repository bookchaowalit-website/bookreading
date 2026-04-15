'use client';

import { useState } from 'react';
import { Mail, MessageSquare, Send, Check } from 'lucide-react';

export default function ContactPage() {
  const [sent, setSent] = useState(false);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">ติดต่อเรา</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">มีคำถามหรือข้อเสนอแนะ? เรายินดีรับฟัง!</p>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Contact Form */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <MessageSquare size={20} /> ส่งข้อความ
          </h2>

          {sent ? (
            <div className="text-center py-8">
              <Check size={48} className="mx-auto text-green-500 mb-3" />
              <p className="text-green-600 dark:text-green-400 font-medium">ส่งข้อความเรียบร้อย!</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">เราจะตอบกลับโดยเร็วที่สุด</p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">อีเมล</label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">หัวข้อ</label>
                <select className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white">
                  <option>คำถามทั่วไป</option>
                  <option>รายงานปัญหา</option>
                  <option>ขอคุณสมบัติใหม่</option>
                  <option>การชำระเงิน</option>
                  <option>อื่นๆ</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ข้อความ</label>
                <textarea
                  required
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                  placeholder="รายละเอียด..."
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Send size={16} /> ส่งข้อความ
              </button>
            </form>
          )}
        </div>

        {/* Contact Info */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Mail size={20} /> ช่องทางติดต่อ
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">อีเมล</p>
                <p className="text-gray-900 dark:text-white font-medium">support@bookreading.app</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">เวลาทำการ</p>
                <p className="text-gray-900 dark:text-white">จันทร์ - ศุกร์, 9:00 - 18:00</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 text-white">
            <h3 className="font-semibold mb-2">💡 เคล็ดลับ</h3>
            <p className="text-sm text-blue-100">
              สำหรับปัญหาเร่งด่วน โปรดระบุ URL ของนิยายและข้อความ error ที่พบ
              จะช่วยให้เราแก้ปัญหาได้เร็วขึ้น
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <a href="/" className="text-blue-600 hover:underline">← กลับหน้าแรก</a>
      </div>
    </div>
  );
}
