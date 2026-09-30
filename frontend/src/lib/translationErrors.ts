// Translation error messages in Thai with helpful suggestions

interface TranslationError {
  code: string;
  title: string;
  message: string;
  suggestion: string;
  retryable: boolean;
}

export const translationErrors: Record<string, TranslationError> = {
  // API Key errors
  'API_KEY_MISSING': {
    code: 'API_KEY_MISSING',
    title: 'ไม่มี API Key',
    message: 'ยังไม่ได้ตั้งค่า API Key สำหรับ AI',
    suggestion: 'ไปที่ "การตั้งค่า" → เพิ่ม OpenAI หรือ Gemini API Key',
    retryable: false,
  },
  'API_KEY_INVALID': {
    code: 'API_KEY_INVALID',
    title: 'API Key ไม่ถูกต้อง',
    message: 'API Key ที่ใส่ไว้ไม่ถูกต้องหรือหมดอายุ',
    suggestion: 'ตรวจสอบ API Key ใน "การตั้งค่า" แล้วลองใหม่',
    retryable: false,
  },
  'API_KEY_EXPIRED': {
    code: 'API_KEY_EXPIRED',
    title: 'API Key หมดอายุ',
    message: 'API Key หมดอายุแล้ว',
    suggestion: 'อัปเดต API Key ใหม่ใน "การตั้งค่า"',
    retryable: false,
  },

  // Quota/Billing errors
  'QUOTA_EXCEEDED': {
    code: 'QUOTA_EXCEEDED',
    title: 'เกินโควต้า',
    message: 'ใช้โควต้าการแปลหมดแล้วสำหรับเดือนนี้',
    suggestion: 'รอโควต้ารีเซ็ตเดือนหน้า หรืออัปเกรดเป็นแผน Pro',
    retryable: false,
  },
  'RATE_LIMITED': {
    code: 'RATE_LIMITED',
    title: 'รวดเร็วเกินไป',
    message: 'คุณส่งคำขอเร็วเกินไป กรุณารอสักครู่',
    suggestion: 'รอ 1-2 นาทีแล้วลองใหม่',
    retryable: true,
  },

  // Content errors
  'CONTENT_TOO_LONG': {
    code: 'CONTENT_TOO_LONG',
    title: 'เนื้อหายาวเกินไป',
    message: 'บทนี้มีข้อความยาวเกินกว่าจะแปลในครั้งเดียว',
    suggestion: 'ลองแบ่งบทเป็นท่อนสั้นๆ แล้วแปลทีละส่วน',
    retryable: false,
  },
  'CONTENT_EMPTY': {
    code: 'CONTENT_EMPTY',
    title: 'ไม่มีเนื้อหา',
    message: 'บทนี้ยังไม่มีเนื้อหาให้แปล',
    suggestion: 'รอให้ระบบดึงเนื้อหามาเสร็จก่อน แล้วลองใหม่',
    retryable: true,
  },

  // Network errors
  'NETWORK_ERROR': {
    code: 'NETWORK_ERROR',
    title: 'ปัญหาเครือข่าย',
    message: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ AI ได้',
    suggestion: 'ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต แล้วลองใหม่',
    retryable: true,
  },
  'SERVER_ERROR': {
    code: 'SERVER_ERROR',
    title: 'เซิร์ฟเวอร์ผิดพลาด',
    message: 'เกิดข้อผิดพลาดที่ฝั่งเซิร์ฟเวอร์',
    suggestion: 'รอซักครู่แล้วลองใหม่ หากยังเกิดปัญหาอยู่ กรุณาติดต่อผู้ดูแล',
    retryable: true,
  },
  'TIMEOUT': {
    code: 'TIMEOUT',
    title: 'หมดเวลา',
    message: 'การแปลใช้เวลานานเกินไป',
    suggestion: 'ลองใหม่หรือใช้โมเดลที่เร็วกว่า (GPT-4o Mini หรือ Gemini Flash)',
    retryable: true,
  },

  // Fallback
  'UNKNOWN': {
    code: 'UNKNOWN',
    title: 'เกิดข้อผิดพลาด',
    message: 'ไม่สามารถแปลบทนี้ได้',
    suggestion: 'ลองใหม่อีกครั้ง หากยังเกิดปัญหาอยู่ กรุณาติดต่อผู้ดูแล',
    retryable: true,
  },
};

// Parse error from API response or exception
export function parseTranslationError(error: any): TranslationError {
  // Check for specific error codes
  const code = error?.code || error?.response?.data?.code || error?.response?.data?.error;

  if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(translationErrors, code)) {
    return translationErrors[code];
  }

  // Axios transport codes (no HTTP response at all)
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return translationErrors['TIMEOUT'];
  }
  if (error?.code === 'ERR_NETWORK' || error?.code === 'ECONNREFUSED') {
    return translationErrors['NETWORK_ERROR'];
  }

  // Check HTTP status codes
  const status = error?.response?.status;
  if (status === 401 || status === 403) {
    return translationErrors['API_KEY_INVALID'];
  }
  if (status === 429) {
    return translationErrors['RATE_LIMITED'];
  }
  if (status === 504) {
    return translationErrors['TIMEOUT'];
  }
  if (status === 500 || status === 502 || status === 503) {
    return translationErrors['SERVER_ERROR'];
  }

  // Check error message patterns. Coerce to a lower-cased string: the
  // payload may be an object, and axios reports "Network Error" (capital N).
  const rawMessage = error?.message ?? error?.response?.data?.error ?? '';
  const message = (typeof rawMessage === 'string' ? rawMessage : String(rawMessage)).toLowerCase();
  if (message.includes('timeout') || message.includes('etimedout')) {
    return translationErrors['TIMEOUT'];
  }
  if (message.includes('network') || message.includes('econnrefused')) {
    return translationErrors['NETWORK_ERROR'];
  }
  if (message.includes('quota') || message.includes('billing')) {
    return translationErrors['QUOTA_EXCEEDED'];
  }
  if (message.includes('api key') || message.includes('api_key') || message.includes('unauthorized')) {
    return translationErrors['API_KEY_INVALID'];
  }

  return translationErrors['UNKNOWN'];
}

// Generate user-friendly error display
export function getErrorDisplay(error: any) {
  const err = parseTranslationError(error);
  return {
    title: err.title,
    message: err.message,
    suggestion: err.suggestion,
    retryable: err.retryable,
  };
}
