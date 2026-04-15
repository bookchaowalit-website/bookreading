'use client';

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">นโยบายความเป็นส่วนตัว</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">อัปเดตล่าสุด: เมษายน 2026</p>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. ข้อมูลที่เก็บ</h2>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-1">
            <li>อีเมลและชื่อ (สำหรับบัญชี)</li>
            <li>ประวัติการอ่านและความคืบหน้า</li>
            <li>คำศัพท์ที่กำหนดเอง</li>
            <li>ข้อมูลการสมัครสมาชิก (ผ่าน Stripe)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. การใช้ข้อมูล</h2>
          <p className="text-gray-600 dark:text-gray-300">
            ข้อมูลใช้เพื่อให้บริการนิยายแปล บันทึกความคืบหน้า และปรับปรุงคุณภาพการแปล
            เราไม่ขายข้อมูลให้บุคคลที่สาม
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. API Keys</h2>
          <p className="text-gray-600 dark:text-gray-300">
            API Key ของคุณถูกเข้ารหัสและเก็บอย่างปลอดภัย เราไม่ใช้ API Key ของคุณเพื่อวัตถุประสงค์อื่น
            นอกจากการแปลนิยายให้คุณ
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. คุกกี้</h2>
          <p className="text-gray-600 dark:text-gray-300">
            เราใช้คุกกี้สำหรับการตรวจสอบสิทธิ์และการตั้งค่าของคุณ
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. การลบข้อมูล</h2>
          <p className="text-gray-600 dark:text-gray-300">
            คุณสามารถลบบัญชีได้ตลอดเวลา ข้อมูลทั้งหมดจะถูกลบอย่างถาวรภายใน 30 วัน
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. ติดต่อ</h2>
          <p className="text-gray-600 dark:text-gray-300">
            คำถามเกี่ยวกับความเป็นส่วนตัว ติดต่อได้ที่ <a href="/contact" className="text-blue-600 hover:underline">หน้าติดต่อเรา</a>
          </p>
        </section>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <a href="/" className="text-blue-600 hover:underline">← กลับหน้าแรก</a>
      </div>
    </div>
  );
}
