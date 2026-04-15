'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/providers/ThemeProvider';
import { FEATURED_NOVELS } from '@/lib/novels';
import {
  BookOpen,
  Library,
  BookMarked,
  Settings,
  Home,
  Languages,
  Image,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  Moon,
  Sun,
  Download,
  FileText,
  Search,
  ArrowRight,
  CreditCard,
  BarChart3,
} from 'lucide-react';

interface NavSubItem {
  id: string;
  label: string;
  href: string;
  badge?: number;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavSubItem[];
}

const navGroups: NavGroup[] = [
  {
    id: 'home',
    label: 'หน้าแรก',
    icon: <Home size={20} />,
    items: [
      { id: 'dashboard', label: 'แดชบอร์ด', href: '/app' },
    ],
  },
  {
    id: 'reading',
    label: 'อ่านนิยาย',
    icon: <BookOpen size={20} />,
    items: [
      { id: 'chapters', label: 'เลือกบท', href: '/app/chapters' },
      { id: 'reader', label: 'ห้องอ่าน', href: '/app/reader' },
      { id: 'manga', label: 'มังงะ', href: '/app/manga' },
    ],
  },
  {
    id: 'library',
    label: 'ห้องสมุด',
    icon: <Library size={20} />,
    items: [
      { id: 'library', label: 'ไลบรารี', href: '/app/library' },
      { id: 'offline', label: 'ออฟไลน์', href: '/app/offline' },
    ],
  },
  {
    id: 'tools',
    label: 'เครื่องมือ',
    icon: <Languages size={20} />,
    items: [
      { id: 'terminology', label: 'ศัพท์เฉพาะ', href: '/app/terminology' },
      { id: 'subscriptions', label: 'ติดตาม', href: '/app/subscriptions' },
      { id: 'stats', label: 'สถิติ', href: '/app/stats' },
    ],
  },
  {
    id: 'account',
    label: 'บัญชี',
    icon: <CreditCard size={20} />,
    items: [
      { id: 'profile', label: 'โปรไฟล์', href: '/app/profile' },
      { id: 'billing', label: 'สมัครสมาชิก', href: '/app/subscription' },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { darkMode, toggleDarkMode } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ type: 'novel' | 'page'; title: string; subtitle?: string; href: string; icon?: React.ReactNode }>>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [subscriptionBadgeCount, setSubscriptionBadgeCount] = useState(0);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    home: true,
    reading: true,
    library: true,
    tools: true,
    account: true,
  });

  // Merge subscription badge count into the navGroups
  const displayGroups = navGroups.map(group => {
    if (group.id === 'tools' && subscriptionBadgeCount > 0) {
      return {
        ...group,
        items: group.items.map(item =>
          item.id === 'subscriptions'
            ? { ...item, badge: subscriptionBadgeCount }
            : item
        ),
      };
    }
    return group;
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isItemActive = (href: string) => {
    if (href === '/app') return pathname === '/app';
    return pathname.startsWith(href);
  };

  // Fetch active subscription count for badge (lazy, only runs once on mount)
  const fetchSubscriptionBadge = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    try {
      const { getUserSubscriptions } = await import('@/lib/new-api');
      const response = await getUserSubscriptions(userId);
      const subs = response.data || [];
      const activeCount = subs.filter((s: any) => s.is_active).length;
      setSubscriptionBadgeCount(activeCount);
    } catch {
      // Silently fail - badge is non-critical
    }
  }, []);

  useEffect(() => {
    fetchSubscriptionBadge();
  }, [fetchSubscriptionBadge]);

  // Focus search input when search opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  // Keyboard shortcut: Ctrl+K or Cmd+K to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus trap for mobile menu
  useEffect(() => {
    if (!mobileMenuOpen) return;

    // Store the element that was focused before opening
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element in the menu
    const focusableElements = mobileMenuRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement> | undefined;
    const firstFocusable = focusableElements?.[0];
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !focusableElements) return;

      const focusableArray = Array.from(focusableElements).filter(el => el.offsetParent !== null);
      if (focusableArray.length === 0) return;

      const firstEl = focusableArray[0];
      const lastEl = focusableArray[focusableArray.length - 1];

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus when menu closes
      previousFocusRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  // Search logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: typeof searchResults = [];

    // Search novels
    FEATURED_NOVELS.forEach(novel => {
      if (
        novel.titleTh.toLowerCase().includes(query) ||
        novel.title.toLowerCase().includes(query) ||
        novel.authorTh.toLowerCase().includes(query) ||
        novel.author.toLowerCase().includes(query)
      ) {
        results.push({
          type: 'novel',
          title: novel.titleTh,
          subtitle: `${novel.authorTh} • ${novel.totalChapters} บท`,
          href: `/app/reader?novel=${novel.id}`,
        });
      }
    });

    // Search pages
    displayGroups.forEach(group => {
      group.items.forEach(item => {
        if (item.label.toLowerCase().includes(query)) {
          results.push({
            type: 'page',
            title: `${group.label} > ${item.label}`,
            href: item.href,
            icon: group.icon,
          });
        }
      });
    });

    setSearchResults(results.slice(0, 8));
  }, [searchQuery]);

  const isActive = (href: string) => {
    if (href === '/app') return pathname === '/app';
    return pathname.startsWith(href);
  };

  const handleLogout = () => {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Global Search Modal */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-24 px-4"
            role="dialog"
            aria-modal="true"
            aria-label="ค้นหา"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200 dark:border-gray-800">
                <Search size={20} className="text-gray-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหานิยาย หรือหน้า..."
                  className="flex-1 bg-transparent text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center px-2 py-1 text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                  ESC
                </kbd>
              </div>

              {/* Search Results */}
              <div className="max-h-80 overflow-y-auto py-2">
                {!searchQuery && (
                  <div className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    <Search size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">พิมพ์เพื่อค้นหานิยายหรือหน้า</p>
                    <p className="text-xs mt-1">หรือใช้ <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">Ctrl+K</kbd> เพื่อเปิด/ปิด</p>
                  </div>
                )}

                {searchQuery && searchResults.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">
                    <p className="text-sm">ไม่พบผลลัพธ์สำหรับ "{searchQuery}"</p>
                  </div>
                )}

                {searchResults.map((result, index) => (
                  <button
                    key={`${result.type}-${index}`}
                    onClick={() => {
                      router.push(result.href);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {result.type === 'novel' ? (
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen size={18} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                        {result.icon || <ArrowRight size={18} className="text-gray-500" />}
                      </div>
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{result.title}</p>
                      {result.subtitle && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{result.subtitle}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${result.type === 'novel' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                      }`}>
                      {result.type === 'novel' ? 'นิยาย' : 'หน้า'}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Desktop */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden lg:flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0"
        aria-label="แถบนำทางด้านข้าง"
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200 dark:border-gray-800">
          <motion.div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => router.push('/app')}
          >
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen size={20} className="text-white" />
            </div>
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  className="font-bold text-lg text-gray-900 dark:text-white whitespace-nowrap"
                >
                  BookReading
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {/* Search Button */}
          <button
            onClick={() => setSearchOpen(true)}
            className={`
              w-full flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-all mb-1
              text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800
              ${sidebarCollapsed ? 'justify-center px-0' : ''}
            `}
            aria-label="ค้นหา (Ctrl+K)"
          >
            <Search size={20} className="flex-shrink-0" />
            <AnimatePresence>
              {!sidebarCollapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="font-medium flex-1 text-left flex items-center justify-between"
                >
                  <span>ค้นหา</span>
                  <kbd className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">⌘K</kbd>
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          {/* Nav Groups */}
          {displayGroups.map((group) => {
            const isGroupActive = group.items.some(item => isItemActive(item.href));
            const activeItem = group.items.find(item => isItemActive(item.href));
            const isExpanded = expandedGroups[group.id];

            if (sidebarCollapsed) {
              // Collapsed mode: show group icon, highlight if active
              return (
                <button
                  key={group.id}
                  onClick={() => activeItem ? router.push(activeItem.href) : router.push(group.items[0]?.href || '/app')}
                  className={`
                    w-full flex items-center justify-center gap-3 px-4 py-3 mx-2 rounded-xl transition-all mb-1
                    ${isGroupActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }
                  `}
                  title={group.label}
                  aria-label={group.label}
                >
                  {group.icon}
                </button>
              );
            }

            return (
              <div key={group.id} className="mb-2">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`
                    w-full flex items-center justify-between px-4 py-2 mx-2 rounded-lg transition-all
                    ${isGroupActive
                      ? 'text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }
                  `}
                  aria-expanded={isExpanded}
                  aria-label={group.label}
                >
                  <div className="flex items-center gap-2">
                    {group.icon}
                    <span className="text-sm">{group.label}</span>
                  </div>
                  <motion.svg
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </motion.svg>
                </button>

                {/* Group Items */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => router.push(item.href)}
                          className={`
                            w-full flex items-center gap-3 pl-10 pr-4 py-2.5 mx-2 rounded-lg transition-all mb-0.5
                            ${isItemActive(item.href)
                              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }
                          `}
                          aria-current={isItemActive(item.href) ? 'page' : undefined}
                        >
                          <span className="flex-1 text-left text-sm">{item.label}</span>
                          {item.badge && item.badge > 0 && (
                            <span className="min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1.5">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={toggleDarkMode}
            className={`
              w-full flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-all mb-1
              text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800
              ${sidebarCollapsed ? 'justify-center px-0' : ''}
            `}
            aria-label={darkMode ? 'สลับไปโหมดสว่าง' : 'สลับไปโหมดมืด'}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            {!sidebarCollapsed && <span className="font-medium">{darkMode ? 'สว่าง' : 'มืด'}</span>}
          </button>
          <button
            onClick={handleLogout}
            className={`
              w-full flex items-center gap-3 px-4 py-3 mx-2 rounded-xl transition-all mb-1
              text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30
              ${sidebarCollapsed ? 'justify-center px-0' : ''}
            `}
            aria-label="ออกจากระบบ"
          >
            <LogOut size={20} />
            {!sidebarCollapsed && <span className="font-medium">ออกจากระบบ</span>}
          </button>

          {/* Collapse Toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center py-2 mt-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label={sidebarCollapsed ? 'ขยายแถบข้าง' : 'ยุบแถบข้าง'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </motion.aside>

      {/* Mobile Sidebar */}
      <motion.aside
        ref={mobileMenuRef}
        initial={{ x: -280 }}
        animate={{ x: mobileMenuOpen ? 0 : -280 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-900 z-50 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="เมนูนำทาง"
      >
        {/* Mobile Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <BookOpen size={20} className="text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">BookReading</span>
          </div>
          <button onClick={() => setMobileMenuOpen(false)} className="p-2" aria-label="ปิดเมนู">
            <X size={24} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Mobile Nav Items */}
        <nav className="flex-1 py-4 overflow-y-auto h-[calc(100vh-8rem)]">
          {displayGroups.map((group) => {
            const isGroupActive = group.items.some(item => isItemActive(item.href));
            const isExpanded = expandedGroups[group.id];

            return (
              <div key={group.id} className="mb-2">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`
                    w-full flex items-center justify-between px-4 py-2 mx-2 rounded-lg transition-all
                    ${isGroupActive
                      ? 'text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-gray-500 dark:text-gray-400'
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    {group.icon}
                    <span className="text-sm">{group.label}</span>
                  </div>
                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                {/* Group Items */}
                {isExpanded && (
                  <div className="overflow-hidden">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          router.push(item.href);
                          setMobileMenuOpen(false);
                        }}
                        className={`
                          w-full flex items-center gap-3 pl-10 pr-4 py-2.5 mx-2 rounded-lg transition-all mb-0.5
                          ${isItemActive(item.href)
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                          }
                        `}
                      >
                        <span className="flex-1 text-left text-sm">{item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <span className="min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1.5">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Mobile Bottom Actions */}
        <div className="py-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center gap-3 px-4 py-3 mx-2 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={darkMode ? 'สลับไปโหมดสว่าง' : 'สลับไปโหมดมืด'}
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            <span className="font-medium">{darkMode ? 'สว่าง' : 'มืด'}</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 mx-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            aria-label="ออกจากระบบ"
          >
            <LogOut size={20} />
            <span className="font-medium">ออกจากระบบ</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar - Mobile */}
        <header className="lg:hidden h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 sticky top-0 z-30">
          <button onClick={() => setMobileMenuOpen(true)} className="p-2 -ml-2" aria-label="เปิดเมนูนำทาง">
            <Menu size={24} className="text-gray-600 dark:text-gray-400" />
          </button>
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <BookOpen size={16} className="text-white" />
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">BookReading</span>
            </div>
          </div>
          <button onClick={toggleDarkMode} className="p-2 -mr-2" aria-label={darkMode ? 'สลับไปโหมดสว่าง' : 'สลับไปโหมดมืด'}>
            {darkMode ? <Sun size={20} className="text-gray-600 dark:text-gray-400" /> : <Moon size={20} className="text-gray-600 dark:text-gray-400" />}
          </button>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="p-4 lg:p-6"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 z-30">
          <div className="flex items-center justify-around py-2">
            {[
              { icon: <Home size={20} />, label: 'หน้าแรก', href: '/app' },
              { icon: <Library size={20} />, label: 'ไลบรารี', href: '/app/library' },
              { icon: <BookOpen size={20} />, label: 'อ่าน', href: '/app/reader' },
              { icon: <Languages size={20} />, label: 'ศัพท์', href: '/app/terminology' },
              { icon: <Settings size={20} />, label: 'ตั้งค่า', href: '/app/settings' },
            ].map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`
                  flex flex-col items-center gap-1 py-2 px-3 min-w-0
                  ${isActive(item.href)
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-gray-400 dark:text-gray-500'
                  }
                `}
                aria-label={item.label}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                {item.icon}
                <span className="text-[10px] font-medium truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
