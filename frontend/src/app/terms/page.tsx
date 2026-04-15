'use client';

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">ข้อกำหนดการใช้งาน</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8">อัปเดตล่าสุด: เมษายน 2026</p>

      <div className="prose dark:prose-invert max-w-none space-y-6">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">1. การใช้บริการ</h2>
          <p className="text-gray-600 dark:text-gray-300">
            BookReading เป็นแพลตฟอร์มสำหรับอ่านนิยายที่แปลด้วย AI การใช้บริการหมายถึงคุณยอมรับข้อกำหนดเหล่านี้
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">2. บัญชีผู้ใช้</h2>
          <p className="text-gray-600 dark:text-gray-300">
            คุณต้องรับผิดชอบต่อกิจกรรมทั้งหมดภายใต้บัญชีของคุณ ห้ามแชร์บัญชีกับผู้อื่น
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">3. ลิขสิทธิ์เนื้อหา</h2>
          <p className="text-gray-600 dark:text-gray-300">
            เนื้อหานิยายอาจมีลิขสิทธิ์จากเจ้าของเดิม การใช้แพลตฟอร์มนี้เพื่อวัตถุประสงค์ส่วนตัวเท่านั้น
            ห้ามแจกจ่ายเนื้อหาที่แปลแล้วในเชิงพาณิชย์
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">4. API Keys</h2>
          <p className="text-gray-600 dark:text-gray-300">
            หากคุณใช้ API Key ของตัวเอง (OpenAI/Gemini) คุณต้องรับผิดชอบค่าใช้จ่ายที่เกิดขึ้น
            เราไม่เก็บหรือใช้ API Key ของคุณเพื่อวัตถุประสงค์อื่น
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">5. การชำระเงิน</h2>
          <p className="text-gray-600 dark:text-gray-300">
            แผน Pro และ Team เรียกเก็บเงินผ่าน Stripe การยกเลิกสามารถทำได้ตลอดเวลา
            จะไม่มีการคืนเงินสำหรับช่วงเวลาที่ใช้ไปแล้ว
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">6. การยกเลิกบัญชี</h2>
          <p className="text-gray-600 dark:text-gray-300">
            คุณสามารถลบบัญชีได้ตลอดเวลา ข้อมูลทั้งหมดจะถูกลบอย่างถาวร
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">7. ติดต่อเรา</h2>
          <p className="text-gray-600 dark:text-gray-300">
            หากมีข้อสงสัย ติดต่อได้ที่ <a href="/contact" className="text-blue-600 hover:underline">หน้าติดต่อเรา</a>
          </p>
        </section>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <a href="/" className="text-blue-600 hover:underline">← กลับหน้าแรก</a>
      </div>
    </div>
  );
}
