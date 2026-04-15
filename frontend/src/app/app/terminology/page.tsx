'use client';

import { useState, useEffect } from 'react';
import TranslationFeedbackForm from '@/components/TranslationFeedbackForm';
import StarRating from '@/components/StarRating';
import Skeleton from '@/components/Skeleton';
import { useTranslationFeedback } from '@/hooks/useTranslationFeedback';
import { FileText, Trash2, BarChart3, User, Search, Plus } from 'lucide-react';

interface Term {
  original: string;
  translation: string;
  type: string;
  description: string;
}

export default function TerminologyPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [terms, setTerms] = useState<Term[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTerm, setNewTerm] = useState<Term>({
    original: '',
    translation: '',
    type: 'character',
    description: '',
  });

  // New: Terminology quality feedback
  const [showFeedbackSection, setShowFeedbackSection] = useState(false);
  const [feedbackNovelId, setFeedbackNovelId] = useState('');
  const [feedbackChapter, setFeedbackChapter] = useState(1);
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') || undefined : undefined;
  const { feedbackList, qualityScore, submitFeedback } = useTranslationFeedback(feedbackNovelId, feedbackChapter);

  const handleFeedbackSubmit = async (data: {
    rating: number;
    comment?: string;
    has_errors?: boolean;
    error_details?: Array<{ type: string; description: string; original_text?: string; corrected_text?: string }>;
  }) => {
    return submitFeedback(data);
  };

  useEffect(() => {
    // Load terminology from localStorage
    const savedTerms = localStorage.getItem('customTerminology');
    if (savedTerms) {
      setTerms(JSON.parse(savedTerms));
    } else {
      // Default terms
      const defaultTerms: Term[] = [
        { original: '云澈', translation: 'หยุนเช่อ', type: 'character', description: 'Main protagonist' },
        { original: '沐玄音', translation: 'มู่เสวียนอิ่น', type: 'character', description: 'Ice Phoenix Goddess' },
        { original: '夏倾月', translation: 'เซี่ยชิงเยว่', type: 'character', description: 'Moon God Emperor' },
        { original: '深渊', translation: 'เหวี่ยนลึก', type: 'location', description: 'The Abyss' },
        { original: '渊皇', translation: 'จักรพรรดิเหวี่ยน', type: 'character', description: 'Abyss Emperor' },
      ];
      setTerms(defaultTerms);
      localStorage.setItem('customTerminology', JSON.stringify(defaultTerms));
    }
  }, []);

  const saveTerms = (newTerms: Term[]) => {
    setTerms(newTerms);
    localStorage.setItem('customTerminology', JSON.stringify(newTerms));
  };

  const handleAddTerm = () => {
    if (!newTerm.original || !newTerm.translation) return;

    const updatedTerms = [...terms, newTerm];
    saveTerms(updatedTerms);
    setNewTerm({ original: '', translation: '', type: 'character', description: '' });
    setShowAddModal(false);
  };

  const handleDeleteTerm = (index: number) => {
    const updatedTerms = terms.filter((_, i) => i !== index);
    saveTerms(updatedTerms);
  };

  const filteredTerms = terms.filter(term =>
    term.original.toLowerCase().includes(searchQuery.toLowerCase()) ||
    term.translation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const termTypes = [
    { value: 'character', label: (<><User size={12} className="inline" /> ตัวละคร</>), color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    { value: 'location', label: '📍 สถานที่', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    { value: 'item', label: '⚔️ ไอเท็ม', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    { value: 'technique', label: '⚡ ท่าไม้ตาย', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    { value: 'organization', label: '🏛️ องค์กร', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
    { value: 'other', label: (<><FileText size={12} className="inline" /> อื่นๆ</>), color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  ];

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton variant="title" className="w-40" />
        <Skeleton variant="text" className="w-full h-10" />
        <Skeleton count={5} variant="table-row" className="h-16" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white"><FileText size={24} className="inline" /> คำศัพท์</h1>
          <p className="text-gray-500 dark:text-gray-400">จัดการคำศัพท์สำหรับการแปล {terms.length} คำ</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={18} />
          เพิ่มคำศัพท์
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาคำศัพท์..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
          />
        </div>
      </div>

      {/* Terms List */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {filteredTerms.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-500 dark:text-gray-400">
              {searchQuery ? 'ไม่พบคำศัพท์' : 'ยังไม่มีคำศัพท์'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredTerms.map((term, index) => {
              const typeInfo = termTypes.find(t => t.value === term.type) || termTypes[5];
              return (
                <div
                  key={index}
                  className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {term.original}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="text-blue-600 dark:text-blue-400 font-medium">
                          {term.translation}
                        </span>
                      </div>
                      {term.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {term.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      <button
                        onClick={() => handleDeleteTerm(index)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New: Terminology Quality Feedback Section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          onClick={() => setShowFeedbackSection(!showFeedbackSection)}
          className="w-full p-4 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white"><BarChart3 size={20} className="inline" /> คุณภาพคำศัพท์และคำแปล</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">ให้คะแนนและแสดงความคิดเห็นเกี่ยวกับคุณภาพการแปล</p>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${showFeedbackSection ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showFeedbackSection && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
            {/* Novel and Chapter Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  รหัสงานนิยาย (Novel ID)
                </label>
                <input
                  type="text"
                  value={feedbackNovelId}
                  onChange={(e) => setFeedbackNovelId(e.target.value)}
                  placeholder="เช่น novel-123"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  บทที่
                </label>
                <input
                  type="number"
                  value={feedbackChapter}
                  onChange={(e) => setFeedbackChapter(Number(e.target.value))}
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>

            {/* Quality Score Display */}
            {qualityScore && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-3">
                  <StarRating
                    rating={Math.round(qualityScore.avg_rating)}
                    onRate={() => { }}
                    size="sm"
                    disabled
                  />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      คะแนนเฉลี่ย: {qualityScore.avg_rating.toFixed(1)}/5
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      จาก {qualityScore.feedback_count} คะแนน
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Feedback Form */}
            {feedbackNovelId && (
              <TranslationFeedbackForm
                novelId={feedbackNovelId}
                chapterNumber={feedbackChapter}
                onSubmit={handleFeedbackSubmit}
              />
            )}

            {!feedbackNovelId && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                กรุณาระบุ Novel ID เพื่อเริ่มให้คะแนน
              </p>
            )}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              เพิ่มคำศัพท์ใหม่
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  คำต้นฉบับ (จีน)
                </label>
                <input
                  type="text"
                  value={newTerm.original}
                  onChange={(e) => setNewTerm({ ...newTerm, original: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="例: 萧炎"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  คำแปล (ไทย)
                </label>
                <input
                  type="text"
                  value={newTerm.translation}
                  onChange={(e) => setNewTerm({ ...newTerm, translation: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="例: เซียวเหยียน"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  ประเภท
                </label>
                <select
                  value={newTerm.type}
                  onChange={(e) => setNewTerm({ ...newTerm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                >
                  {termTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">
                  คำอธิบาย (ไม่บังคับ)
                </label>
                <input
                  type="text"
                  value={newTerm.description}
                  onChange={(e) => setNewTerm({ ...newTerm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="คำอธิบายเพิ่มเติม"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleAddTerm}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
