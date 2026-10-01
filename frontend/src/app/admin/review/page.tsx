'use client';

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { aiReviewApi } from '@/lib/api';
import {
  CheckCircle2, XCircle, FileText, Search, BarChart3, AlertTriangle,
  Lightbulb, BookOpen, Library, Target, Moon, Sun, RefreshCw,
  Loader2, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown,
  Edit3, ArrowRight
} from 'lucide-react';

interface ReviewItem {
  id: string;
  novel_id: string;
  novel_title?: string;
  chapter_number: number;
  chapter_title?: string;
  original_text?: string;
  translated_text: string;
  grade: string;
  overall_score: number;
  terminology_score?: number;
  flow_score?: number;
  accuracy_score?: number;
  dialogue_score?: number;
  issues: string[];
  strengths: string[];
  priority: number;
  created_at: string;
}

interface ReviewStats {
  pending: number;
  approved: number;
  rejected: number;
  total_processed: number;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}


export default function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats>({ pending: 0, approved: 0, rejected: 0, total_processed: 0 });
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [editedText, setEditedText] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ action: 'approve' | 'reject' | null; itemId: string | null }>({ action: null, itemId: null });
  const [rejectNotes, setRejectNotes] = useState('');

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedItem || actionLoading) return;

      // Escape to deselect
      if (e.key === 'Escape') {
        setSelectedItem(null);
      }
      // A to approve
      if (e.key === 'a' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setConfirmModal({ action: 'approve', itemId: selectedItem.id });
      }
      // R to reject
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setConfirmModal({ action: 'reject', itemId: selectedItem.id });
      }
      // O to toggle original
      if (e.key === 'o' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setShowOriginal(!showOriginal);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, actionLoading, showOriginal]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    fetchItems();
    fetchStats();
  }, [filter]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const fetchItems = async () => {
    try {
      const data = await aiReviewApi.getPending(100);

      let filteredItems = data.items || [];
      if (filter === 'high') {
        filteredItems = filteredItems.filter((item: ReviewItem) => item.priority >= 4);
      } else if (filter === 'medium') {
        filteredItems = filteredItems.filter((item: ReviewItem) => item.priority === 3);
      } else if (filter === 'low') {
        filteredItems = filteredItems.filter((item: ReviewItem) => item.priority <= 2);
      }

      // Apply search
      if (searchQuery) {
        filteredItems = filteredItems.filter((item: ReviewItem) =>
          item.novel_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.chapter_number.toString().includes(searchQuery)
        );
      }

      setItems(filteredItems);
    } catch (error) {
      console.error('Failed to fetch items:', error);
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setStats(await aiReviewApi.getStats());
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleApprove = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      await aiReviewApi.approve(itemId);
      setItems(items.filter(i => i.id !== itemId));
      setSelectedItem(null);
      fetchStats();
      showToast('อนุมัติเรียบร้อยแล้ว', 'success');
    } catch (error) {
      console.error('Failed to approve:', error);
      showToast('ไม่สามารถอนุมัติได้', 'error');
    } finally {
      setActionLoading(null);
      setConfirmModal({ action: null, itemId: null });
    }
  };

  const handleEdit = async (itemId: string) => {
    if (editedText === selectedItem?.translated_text) {
      showToast('ไม่มีการเปลี่ยนแปลง', 'info');
      return;
    }

    setActionLoading(itemId);
    try {
      await aiReviewApi.edit(itemId, editedText);
      setItems(items.filter(i => i.id !== itemId));
      setSelectedItem(null);
      setEditedText('');
      fetchStats();
      showToast('แก้ไขและอนุมัติเรียบร้อยแล้ว', 'success');
    } catch (error) {
      console.error('Failed to edit:', error);
      showToast('ไม่สามารถบันทึกได้', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (itemId: string, notes: string) => {
    setActionLoading(itemId);
    try {
      await aiReviewApi.reject(itemId, notes);
      setItems(items.filter(i => i.id !== itemId));
      setSelectedItem(null);
      setRejectNotes('');
      fetchStats();
      showToast('ปฏิเสธแล้ว จะแปลใหม่', 'info');
    } catch (error) {
      console.error('Failed to reject:', error);
      showToast('ไม่สามารถปฏิเสธได้', 'error');
    } finally {
      setActionLoading(null);
      setConfirmModal({ action: null, itemId: null });
    }
  };

  const handleNext = useCallback(() => {
    if (!selectedItem) return;
    const currentIndex = items.findIndex(i => i.id === selectedItem.id);
    if (currentIndex < items.length - 1) {
      const nextItem = items[currentIndex + 1];
      setSelectedItem(nextItem);
      setEditedText(nextItem.translated_text);
    }
  }, [selectedItem, items]);

  const handlePrev = useCallback(() => {
    if (!selectedItem) return;
    const currentIndex = items.findIndex(i => i.id === selectedItem.id);
    if (currentIndex > 0) {
      const prevItem = items[currentIndex - 1];
      setSelectedItem(prevItem);
      setEditedText(prevItem.translated_text);
    }
  }, [selectedItem, items]);

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-500 text-white';
      case 'B': return 'bg-blue-500 text-white';
      case 'C': return 'bg-yellow-500 text-white';
      case 'D': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getPriorityColor = (priority: number) => {
    if (priority >= 4) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (priority === 3) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  };

  const getPriorityLabel = (priority: number) => {
    if (priority >= 4) return 'สูง';
    if (priority === 3) return 'ปานกลาง';
    return 'ต่ำ';
  };

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-gray-950 ${darkMode ? 'dark' : ''}`}>
      <Head>
        <title>Review Queue - Admin</title>
      </Head>

      {/* Toast Container */}
      <div className="fixed top-20 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg animate-slide-in ${toast.type === 'success' ? 'bg-green-500 text-white' :
              toast.type === 'error' ? 'bg-red-500 text-white' :
                'bg-blue-500 text-white'
              }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {/* Confirm Modal */}
      {confirmModal.action && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {confirmModal.action === 'approve' ? <><CheckCircle2 size={20} className="inline mr-2" />ยืนยันการอนุมัติ?</> : <><XCircle size={20} className="inline mr-2" />ยืนยันการปฏิเสธ?</>}
            </h3>

            {confirmModal.action === 'reject' && (
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="เหตุผลที่ปฏิเสธ (ไม่บังคับ)"
                className="w-full h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white mb-4"
              />
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setConfirmModal({ action: null, itemId: null });
                  setRejectNotes('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  if (confirmModal.action === 'approve') {
                    handleApprove(confirmModal.itemId!);
                  } else {
                    handleReject(confirmModal.itemId!, rejectNotes);
                  }
                }}
                disabled={actionLoading !== null}
                className={`flex-1 px-4 py-2 rounded-lg font-medium text-white ${confirmModal.action === 'approve'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
                  } disabled:opacity-50`}
              >
                {actionLoading ? <><Loader2 size={16} className="inline mr-2 animate-spin" />กำลังดำเนินการ...</> : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText size={28} />
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">Review Queue</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">Human-in-the-Loop Translation Review</p>
              </div>
              {stats.pending > 0 && (
                <span className="px-2.5 py-1 bg-red-500 text-white text-sm font-medium rounded-full animate-pulse">
                  {stats.pending} รอตรวจ
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative hidden md:block">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหานิยาย/บท..."
                  className="w-48 pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><Search size={16} /></span>
              </div>

              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                title="Toggle dark mode"
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              <button
                onClick={() => { fetchItems(); fetchStats(); }}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">รอตรวจสอบ</div>
              </div>
              <Loader2 size={32} className="text-yellow-600 animate-spin" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">อนุมัติแล้ว</div>
              </div>
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">ปฏิเสธ</div>
              </div>
              <XCircle size={32} className="text-red-600" />
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.total_processed}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">ประมวลผลแล้ว</div>
              </div>
              <BarChart3 size={32} className="text-blue-600" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'all'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => setFilter('high')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'high'
              ? 'bg-red-600 text-white shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2"></span>สูง
          </button>
          <button
            onClick={() => setFilter('medium')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'medium'
              ? 'bg-yellow-600 text-white shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2"></span>ปานกลาง
          </button>
          <button
            onClick={() => setFilter('low')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filter === 'low'
              ? 'bg-green-600 text-white shadow-md'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
              }`}
          >
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>ต่ำ
          </button>

          <div className="flex-1" />

          {/* Keyboard shortcuts hint */}
          <div className="hidden md:flex items-center gap-2 text-xs text-gray-400">
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">A</kbd> อนุมัติ
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">R</kbd> ปฏิเสธ
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">O</kbd> แสดงต้นฉบับ
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">Esc</kbd> ปิด
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Items List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  <Library size={16} className="inline mr-2" />รายการรอตรวจ ({items.length})
                </h2>
              </div>

              <div className="max-h-[calc(100vh-350px)] overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center">
                    <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-gray-500 dark:text-gray-400">กำลังโหลด...</p>
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="mb-3"><CheckCircle2 size={48} className="mx-auto text-green-500" /></div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่มีรายการรอตรวจสอบ</p>
                    <p className="text-xs text-gray-400 mt-1">ข้อความที่มีคุณภาพต่ำจะปรากฏที่นี่</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map((item, index) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSelectedItem(item);
                          setEditedText(item.translated_text);
                          setOriginalText(item.original_text || '');
                        }}
                        className={`p-4 cursor-pointer transition-all ${selectedItem?.id === item.id
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-4 border-l-transparent'
                          }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">#{index + 1}</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {item.novel_title || item.novel_id}
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(item.grade)}`}>
                            {item.grade}
                          </span>
                        </div>

                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          บท {item.chapter_number}
                          {item.chapter_title && (
                            <span className="text-gray-500 dark:text-gray-400">: {item.chapter_title}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(item.priority)}`}>
                            {getPriorityLabel(item.priority)}
                          </span>
                          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {item.overall_score}/100
                          </span>
                        </div>

                        {item.issues && item.issues.length > 0 && (
                          <div className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangle size={12} /> {item.issues.length} ปัญหา
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Detail View */}
          <div className="lg:col-span-2">
            {selectedItem ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handlePrev}
                        disabled={items.findIndex(i => i.id === selectedItem.id) === 0}
                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                          {selectedItem.novel_title || selectedItem.novel_id}
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          บท {selectedItem.chapter_number}
                          {selectedItem.chapter_title && `: ${selectedItem.chapter_title}`}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-1">
                          ID: {selectedItem.id}
                        </p>
                      </div>
                      <button
                        onClick={handleNext}
                        disabled={items.findIndex(i => i.id === selectedItem.id) === items.length - 1}
                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-lg text-xl font-bold ${getGradeColor(selectedItem.grade)}`}>
                        {selectedItem.grade}
                      </span>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                          {selectedItem.overall_score}
                        </div>
                        <div className="text-xs text-gray-500">/100</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Score Breakdown */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'คำศัพท์', score: selectedItem.terminology_score || 85, icon: <Library size={20} /> },
                      { label: 'ความลื่นไหล', score: selectedItem.flow_score || 80, icon: <BarChart3 size={20} /> },
                      { label: 'ความถูกต้อง', score: selectedItem.accuracy_score || 85, icon: <Target size={20} /> },
                      { label: 'บทสนทนา', score: selectedItem.dialogue_score || 75, icon: <FileText size={20} /> },
                    ].map((metric, idx) => (
                      <div key={idx} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="mb-1 text-gray-600 dark:text-gray-400">{metric.icon}</div>
                        <div className={`text-xl font-bold ${metric.score >= 80 ? 'text-green-600' :
                          metric.score >= 60 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>{metric.score}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Issues & Strengths */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl ${selectedItem.issues && selectedItem.issues.length > 0
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                      : 'bg-gray-50 dark:bg-gray-800'
                      }`}>
                      <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2 flex items-center gap-2">
                        <AlertTriangle size={16} /> ปัญหาที่พบ
                      </h3>
                      {selectedItem.issues && selectedItem.issues.length > 0 ? (
                        <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
                          {selectedItem.issues.map((issue, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-red-400">•</span>
                              {issue}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">ไม่พบปัญหา</p>
                      )}
                    </div>

                    <div className={`p-4 rounded-xl ${selectedItem.strengths && selectedItem.strengths.length > 0
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-gray-50 dark:bg-gray-800'
                      }`}>
                      <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2 flex items-center gap-2">
                        <CheckCircle2 size={16} /> จุดที่ดี
                      </h3>
                      {selectedItem.strengths && selectedItem.strengths.length > 0 ? (
                        <ul className="text-sm text-green-700 dark:text-green-400 space-y-1">
                          {selectedItem.strengths.map((strength, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-green-400">•</span>
                              {strength}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">-</p>
                      )}
                    </div>
                  </div>

                  {/* Toggle Original */}
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showOriginal ? <><BookOpen size={14} /> ซ่อนต้นฉบับ</> : <><BookOpen size={14} /> แสดงต้นฉบับภาษาจีน</>}
                  </button>

                  {/* Original Text (if showing) */}
                  {showOriginal && originalText && (
                    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-xl">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                        <Library size={14} /> ต้นฉบับ (Chinese)
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {originalText}
                      </p>
                    </div>
                  )}

                  {/* Translation Text */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <Edit3 size={14} /> ข้อความที่แปล (สามารถแก้ไขได้)
                      </label>
                      <span className="text-xs text-gray-400">
                        {editedText.length} ตัวอักษร
                      </span>
                    </div>
                    <textarea
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="w-full h-72 p-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-950 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-sarabun leading-relaxed"
                      placeholder="ข้อความแปล..."
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleApprove(selectedItem.id)}
                      disabled={actionLoading !== null}
                      className="flex-1 md:flex-none px-6 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                    >
                      {actionLoading === selectedItem.id ? (
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <CheckCircle2 size={18} />
                      )} อนุมัติ
                    </button>

                    <button
                      onClick={() => handleEdit(selectedItem.id)}
                      disabled={actionLoading !== null || editedText === selectedItem.translated_text}
                      className="flex-1 md:flex-none px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                    >
                      {actionLoading === selectedItem.id ? (
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      ) : (
                        <Edit3 size={18} />
                      )} บันทึกการแก้ไข
                    </button>

                    <button
                      onClick={() => setConfirmModal({ action: 'reject', itemId: selectedItem.id })}
                      disabled={actionLoading !== null}
                      className="flex-1 md:flex-none px-6 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                    >
                      <XCircle size={18} /> ปฏิเสธ
                    </button>

                    <button
                      onClick={handleNext}
                      disabled={items.findIndex(i => i.id === selectedItem.id) === items.length - 1}
                      className="flex-1 md:flex-none px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      ถัดไป <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12 text-center">
                <div className="mb-4"><FileText size={48} className="mx-auto text-gray-400" /></div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  เลือกรายการเพื่อตรวจสอบ
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  คลิกที่รายการด้านซ้ายเพื่อดูรายละเอียดและดำเนินการ
                </p>
                <div className="text-sm text-gray-400 flex items-center justify-center gap-2 flex-wrap">
                  <Lightbulb size={14} /> ใช้ปุ่มลัด: <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">A</kbd> อนุมัติ, <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">R</kbd> ปฏิเสธ
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 py-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>© 2024 BookReading - Multi-Agent Translation Pipeline</span>
          <span>v1.0.0</span>
        </div>
      </footer>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
        .font-sarabun {
          font-family: 'Sarabun', sans-serif;
        }
      `}</style>
    </div>
  );
}
