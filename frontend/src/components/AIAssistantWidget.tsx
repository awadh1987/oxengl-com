import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  Sparkles,
  X,
  Send,
  Bot,
  User as UserIcon,
  Mic,
  MicOff,
  Copy,
  Check,
  RefreshCw,
  FileText,
  AlertTriangle,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Trash2,
  Download,
  Building2,
  Truck,
  TrendingDown,
  Receipt,
  FileSpreadsheet,
  Globe,
  MapPin,
  Volume2,
  VolumeX,
  Cpu,
  ShieldCheck,
  Scale,
  Compass,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatCurrency, formatTonnage } from '../utils/formatters';

interface MessageSource {
  title: string;
  uri: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
  webSources?: MessageSource[];
  mapSources?: MessageSource[];
  suggestedActions?: { labelAr: string; labelEn: string; query: string }[];
  isDocument?: boolean;
}

interface AIAssistantWidgetProps {
  isOpenExternal?: boolean;
  onCloseExternal?: () => void;
  onNavigateToTab?: (tab: any) => void;
}

export const AIAssistantWidget: React.FC<AIAssistantWidgetProps> = ({
  isOpenExternal,
  onCloseExternal,
  onNavigateToTab,
}) => {
  const {
    currentUser,
    language,
    setLanguage,
    kpis,
    accessibleOperations,
    crushers,
    transporters,
    customers,
    vouchers,
    brandConfig,
    isOnline,
    showToast,
  } = useApp();

  const isAr = language === 'ar';

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState("thread_" + Math.random().toString(36).substring(7));
  const [pendingDraft, setPendingDraft] = useState<any>(null);

  // Model & Role Configuration
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.7-flash');
  const [selectedRole, setSelectedRole] = useState<string>('auditor');
  const [useSearch, setUseSearch] = useState<boolean>(false);
  const [useMaps, setUseMaps] = useState<boolean>(false);

  // Floating Launcher Minimized State (to prevent obstructing scrollbars/pagination)
  const [isLauncherMinimized, setIsLauncherMinimized] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('oxengl_ai_widget_minimized') === 'true';
    }
    return false;
  });

  const toggleLauncherMinimized = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLauncherMinimized((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('oxengl_ai_widget_minimized', String(next));
      }
      return next;
    });
  };

  // Sync with external opener if provided (e.g. from top Navbar)
  useEffect(() => {
    if (typeof isOpenExternal === 'boolean') {
      setIsOpen(isOpenExternal);
    }
  }, [isOpenExternal]);

  // Initial welcome message
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('meayon_ai_chat_history');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [
      {
        id: 'welcome-msg',
        role: 'assistant',
        content: isAr
          ? `مرحباً بك **${currentUser.fullNameAr || currentUser.fullName}**! 👋

أنا **ذكاء العمليات OxenGL** لمتابعة التوريد والخدمات اللوجستية.

أمتلك وصولاً مباشراً للسجلات والبيانات الحية للنظام:
- 🚛 **متابعة فاقد النقل وتذاكر الميزان** لكشف أي تلاعب أو نقص غير مبرر في الحمولات.
- 🏭 **مطابقة حسابات موردي المواد الخام** وأرصدة الموردين وسندات الصرف ومقارنة أسعار الشراء.
- 🧾 **مراجعة فواتير العملاء** والامتثال لضريبة القيمة المضافة ZATCA (15%).
- 🌐 **البحث التنظيمي والسوقي** للوائح النقل وأسعار الديزل الرسمية.
- 📍 **الاستعلام الجغرافي اللوجستي** لمواقع التوريد ومحطات الميزان الذكية.

كيف يمكنني مساعدتك اليوم؟`
          : `Hello **${currentUser.fullName}**! 👋

I am **OxenGL Operational Intelligence** for supply-chain and logistics operations.

I can analyze fleet operations, weighbridge tickets, raw-material sourcing, and customer billing context.

How can I assist you with your operations today?`,
        timestamp: new Date().toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        suggestedActions: [
          {
            labelAr: '🔍 تدقيق رحلات الفاقد العالي (>1.5 MT طن)',
            labelEn: '🔍 Audit High-Loss Trips (>1.5 MT tons)',
            query: 'أريد تقريراً تفصيلياً بالرحلات التي تجاوز فيها الفاقد 1.5 MT طن ومزودي الخدمات المسؤولين عنها.',
          },
          {
            labelAr: '📊 ملخص الأرباح ومستحقات موردي المواد الخام',
            labelEn: '📊 Profit Margins & Raw Materials Payables',
            query: 'ما هو صافي أرباح العمليات الحالية وإجمالي مستحقات موردي المواد الخام المتبقية؟',
          },
          {
            labelAr: '📍 منشآت الإرسال ومحطات الميزان بالرياض',
            labelEn: '📍 Dispatch Facilities & Weigh Stations',
            query: 'ما هي أقرب محطات ميزان ومنشآت توريد مواد خام حول جنوب وشرق الرياض؟',
          },
        ],
      },
    ];
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  // Persist messages
  useEffect(() => {
    localStorage.setItem('meayon_ai_chat_history', JSON.stringify(messages.slice(-20)));
  }, [messages]);

  // Keyboard shortcut: Ctrl+J / Cmd+J to toggle assistant, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleClose = () => {
    setIsOpen(false);
    if (onCloseExternal) {
      onCloseExternal();
    }
  };

  const handleClearHistory = () => {
    if (confirm(isAr ? 'هل تريد مسح سجل المحادثة؟' : 'Clear conversation history?')) {
      const resetMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: isAr
          ? 'تم مسح المحادثة. جاهز لأي استفسار أو تدقيق تشغيلي جديد.'
          : 'Conversation cleared. Ready for your next audit or operational query.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([resetMsg]);
      localStorage.removeItem('meayon_ai_chat_history');
    }
  };

  // Text to Speech playback
  const handleSpeakText = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) return;

    if (isSpeakingId === msgId) {
      window.speechSynthesis.cancel();
      setIsSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    // Strip markdown formatting for cleaner speech
    const cleanText = text.replace(/\*\*/g, '').replace(/###/g, '').replace(/#/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = isAr ? 'ar-SA' : 'en-US';
    utterance.rate = 1.0;
    utterance.onend = () => setIsSpeakingId(null);
    utterance.onerror = () => setIsSpeakingId(null);

    setIsSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (queryText?: string) => {
    const textToSend = queryText || input.trim();
    if (!textToSend || loading) return;

    const userMessage = textToSend;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/agent/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMessage,
          current_route: typeof window !== 'undefined' ? window.location.pathname : '/',
          thread_id: threadId,
        }),
      });

      if (!res.ok) {
        throw new Error('API server error');
      }

      const data = await res.json();

      if (data.status === 'awaiting_approval') {
        setPendingDraft(data.draft);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || (data.status === 'awaiting_approval'
          ? (isAr ? 'تم إعداد مسودة العملية وتتطلب اعتمادك للمتابعة.' : 'Draft created. Action requires approval to execute.')
          : (isAr ? 'تمت معالجة الطلب بنجاح.' : 'Action processed successfully.')),
        modelUsed: 'OxenGL Operational Intelligence (LangGraph)',
        timestamp: new Date().toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.warn('AI Agent interact API error:', err);
      const fallbackReply: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: isAr
          ? 'تعذر الاتصال بمحرك العمليات الذكي (LangGraph Agent). يرجى التأكد من تشغيل الخادم وتوفر المسار.'
          : 'Failed to communicate with Operational Intelligence (LangGraph Agent). Please verify backend connection.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveExecute = async (approved: boolean) => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          approved,
        }),
      });
      const data = await res.json();

      const execMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || (approved
          ? (isAr ? 'تم اعتماد وتنفيذ العملية بنجاح في قاعدة البيانات.' : 'Action successfully committed to the database.')
          : (isAr ? 'تم إلغاء تنفيذ العملية.' : 'Execution cancelled by user.')),
        modelUsed: 'OxenGL Operational Intelligence (LangGraph)',
        timestamp: new Date().toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setMessages((prev) => [...prev, execMsg]);
    } catch (err) {
      console.error('Agent execute error:', err);
      const errMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: isAr ? 'فشل تنفيذ الإجراء.' : 'Failed to execute action.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMessage]);
    } finally {
      setPendingDraft(null);
      setThreadId("thread_" + Math.random().toString(36).substring(7));
      setLoading(false);
    }
  };

  // Voice speech-to-text dictation
  const handleToggleVoice = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast(
        isAr
          ? 'خاصية التعرف على الصوت غير مدعومة في متصفحك الحالي.'
          : 'Speech recognition is not supported in this browser.',
        'error'
      );
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = isAr ? 'ar-SA' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e) {
      console.error('Failed to start voice recognition:', e);
      setIsListening(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickChips = [
    {
      icon: TrendingDown,
      labelAr: 'كشف فاقد الشاحنات',
      labelEn: 'High Wastage Audit',
      query: 'حلل سجلات الفاقد وحدد الشاحنات ومزودي الخدمات الذين تجاوزوا الحد المسموح به مع حساب الأثر المالي.',
    },
    {
      icon: Building2,
      labelAr: 'مطابقة موردي المواد الخام والمستحقات',
      labelEn: 'Raw Materials Supplier Balances',
      query: 'ما هي مستحقات موردي المواد الخام غير المسددة ومقارنة أسعار الشراء للطن بين مختلف الموردين؟',
    },
    {
      icon: MapPin,
      labelAr: 'منشآت التوريد ومحطات الميزان',
      labelEn: 'Quarry & Scale Maps',
      query: 'أريد مواقع كسارات الرياض ومحطات ميزان البسكول مع روابط الخرائط.',
    },
    {
      icon: Globe,
      labelAr: 'لوائح النقل وأسعار الديزل',
      labelEn: 'Regulations & Fuel',
      query: 'ابحث عن أحدث لوائح الهيئة العامة للنقل لأوزان الشاحنات وأسعار الديزل المعتمدة.',
    },
  ];

  return (
    <>
      {/* Floating Smart Launcher Button (When widget is minimized / closed) */}
      {!isOpen && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
          className={`erp-mobile-fab ${isAr ? 'erp-mobile-fab-left' : 'erp-mobile-fab-right'}`}
        >
          {isLauncherMinimized ? (
            /* Compact Icon-Only Launcher Rail Mode to never block pagination or table scrollbars */
            <div className="relative group flex items-center">
              <button
                id="floating-ai-assistant-compact-button"
                onClick={() => setIsOpen(true)}
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-orange-300/80 bg-gradient-to-r from-orange-950 via-orange-800 to-purple-900 text-white shadow-lg shadow-orange-950/30 transition-all hover:scale-110 active:scale-95"
                title={isAr ? 'المساعد الذكي OxenGL (اضغط للفتح)' : 'OxenGL AI Intelligence (Click to open)'}
              >
                <Sparkles className="h-5 w-5 text-amber-300 animate-pulse" />
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              </button>

              {/* Restore Full Badge Trigger */}
              <button
                type="button"
                onClick={toggleLauncherMinimized}
                className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-2 -start-2 bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white rounded-full p-1 shadow-sm"
                title={isAr ? 'توسيع شارة المساعد الذكي' : 'Expand AI Badge'}
              >
                <Maximize2 className="h-3 w-3 text-orange-400" />
              </button>
            </div>
          ) : (
            /* Full Badge Launcher with Minimize Toggle */
            <div className="relative flex items-center">
              <button
                id="floating-ai-assistant-button"
                onClick={() => setIsOpen(true)}
                className="group relative flex items-center gap-2 rounded-full border border-orange-300/80 bg-gradient-to-r from-orange-950 via-orange-800 to-purple-900 px-3 py-2 text-white shadow-xl shadow-orange-950/30 transition-all hover:scale-[1.02] hover:shadow-orange-500/30 active:scale-95"
                title={isAr ? 'فتح المساعد الذكي (Ctrl + J)' : 'Open AI Assistant (Ctrl + J)'}
              >
                <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 opacity-60 blur-xs group-hover:opacity-100 transition-opacity" />

                <div className="relative flex items-center gap-2.5">
                  <div className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white shadow-inner backdrop-blur-md">
                    <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                  </div>

                  <div className="hidden flex-col text-right sm:flex">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black tracking-wide">
                        {isAr ? 'ذكاء العمليات OxenGL' : 'OxenGL Operational Intelligence'}
                      </span>
                      <span className="rounded-md bg-amber-400/25 px-1.5 py-0.2 text-[9px] font-extrabold text-amber-300">
                        Live
                      </span>
                    </div>
                    <span className="text-[10px] text-orange-200">
                      {isAr ? 'تدقيق العمليات • خرائط • بحث حي' : 'Fleet & Audit • Maps • Search'}
                    </span>
                  </div>
                </div>
              </button>

              {/* Minimize to compact orb button */}
              <button
                type="button"
                id="ai-widget-minimize-toggle"
                onClick={toggleLauncherMinimized}
                className="absolute -top-2 -end-2 flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white shadow-md transition-colors"
                title={isAr ? 'تصغير الشارة لتجنب تغطية الجداول' : 'Minimize badge to prevent covering tables'}
              >
                <Minimize2 className="h-3 w-3 text-orange-400" />
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Interactive AI Assistant Modal / Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="erp-drawer-backdrop fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
            />

            <motion.div
              id="meayon-ai-assistant-widget"
              role="dialog"
              aria-modal="true"
              aria-label={isAr ? 'المساعد الذكي' : 'AI Assistant'}
              dir={isAr ? 'rtl' : 'ltr'}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className={`fixed z-50 flex flex-col overflow-hidden rounded-3xl border border-orange-200/80 bg-white shadow-2xl shadow-neutral-950/20 transition-all dark:border-slate-800 dark:bg-slate-900 ${
                isExpanded
                  ? 'inset-4 md:inset-8'
                  : `bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 ${
                      isAr ? 'left-4 sm:left-6' : 'right-4 sm:right-6'
                    } w-[calc(100vw-2rem)] sm:w-[490px] md:w-[540px] h-[670px] max-h-[calc(100dvh-2rem)]`
              }`}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-orange-100 dark:border-slate-800 bg-gradient-to-r from-orange-950 via-neutral-950 to-slate-900 px-4 py-3 text-white">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600/50 text-amber-300 ring-2 ring-orange-400/30">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-xs font-black tracking-wide">
                        {isAr ? 'المساعد الذكي OxenGL' : 'OxenGL Operational Intelligence'}
                      </h2>
                      <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                        {isAr ? 'مباشر' : 'Live'}
                      </span>
                    </div>
                    <p className="text-[10px] text-orange-200">
                      {isAr ? 'تدقيق أوزان • مطابقة كسارات • بحث وخرائط' : 'Weighbridge • Ledgers • Maps • Search'}
                    </p>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleClearHistory}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-orange-200 hover:bg-white/10 hover:text-white transition-colors"
                    title={isAr ? 'مسح المحادثة' : 'Clear Chat'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="hidden sm:flex h-7 w-7 items-center justify-center rounded-lg text-orange-200 hover:bg-white/10 hover:text-white transition-colors"
                    title={isExpanded ? (isAr ? 'تصغير' : 'Collapse') : isAr ? 'تكبير' : 'Expand'}
                  >
                    {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>

                  <button
                    onClick={handleClose}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-orange-200 hover:bg-white/10 hover:text-white transition-colors"
                    title={isAr ? 'إغلاق' : 'Close'}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Model & Role Selector Control Strip */}
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/95 px-3 py-1.5 text-[11px] dark:border-slate-800 dark:bg-[#101322]">
                <div className="flex items-center gap-2">
                  {/* Model Switcher */}
                  <div className="flex items-center gap-1">
                    <Cpu className="h-3 w-3 text-orange-600" />
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <option value="gemini-3.7-flash">Standard operational analysis</option>
                      <option value="gemini-3.5-flash">Research and location analysis</option>
                      <option value="gemini-3.1-pro-preview">Advanced operational reasoning</option>
                      <option value="gemini-3.1-flash-lite">Fast operational response</option>
                    </select>
                  </div>

                  {/* Role Persona */}
                  <div className="flex items-center gap-1">
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-orange-700 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-orange-400"
                    >
                      <option value="auditor">{isAr ? 'مدقق أوزان ولوجستيات' : 'Senior Auditor'}</option>
                      <option value="dispute_officer">{isAr ? 'مسؤول نزاعات وخطابات' : 'Dispute Officer'}</option>
                      <option value="financial_tax">{isAr ? 'مستشار مالي وضريبي' : 'Financial Advisor'}</option>
                      <option value="fleet_dispatcher">{isAr ? 'موجه الأسطول والمسارات' : 'Fleet Dispatcher'}</option>
                    </select>
                  </div>
                </div>

                {/* Grounding Tool Toggles */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUseSearch(!useSearch);
                      if (!useSearch) setUseMaps(false);
                    }}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                      useSearch
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                    title={isAr ? 'تفعيل البحث التنظيمي والسوقي' : 'Regulatory and market research'}
                  >
                    <Globe className="h-2.5 w-2.5" />
                    <span>{isAr ? 'بحث' : 'Search'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUseMaps(!useMaps);
                      if (!useMaps) setUseSearch(false);
                    }}
                    className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-all ${
                      useMaps
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                    }`}
                    title={isAr ? 'تفعيل الاستعلام الجغرافي للمواقع والموازين' : 'Logistics location research'}
                  >
                    <MapPin className="h-2.5 w-2.5" />
                    <span>{isAr ? 'خرائط' : 'Maps'}</span>
                  </button>
                </div>
              </div>

              {/* Chat Message Scrollable Container */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-gradient-to-b from-slate-50/30 to-white dark:from-slate-900/50 dark:to-slate-900">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-600 to-amber-600 text-white shadow-xs">
                          <Bot className="h-4 w-4" />
                        </div>
                      )}

                      <div
                        className={`group relative max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                          isUser
                            ? 'bg-gradient-to-r from-orange-600 to-orange-700 text-white font-medium'
                            : 'bg-white border border-slate-200/90 text-slate-800 dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {/* Control buttons for Assistant Messages */}
                        {!isUser && (
                          <div className="absolute top-2 left-2 hidden group-hover:flex items-center gap-1 bg-white/90 backdrop-blur-xs rounded-md p-0.5 shadow-xs border border-slate-200 dark:bg-slate-800/90 dark:border-slate-700">
                            <button
                              onClick={() => handleSpeakText(msg.id, msg.content)}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-orange-600 transition-colors dark:text-slate-400 dark:hover:bg-slate-700"
                              title={isSpeakingId === msg.id ? (isAr ? 'إيقاف الصوت' : 'Stop Audio') : (isAr ? 'استماع للرد' : 'Listen')}
                            >
                              {isSpeakingId === msg.id ? (
                                <VolumeX className="h-3 w-3 text-rose-600 animate-pulse" />
                              ) : (
                                <Volume2 className="h-3 w-3" />
                              )}
                            </button>

                            <button
                              onClick={() => handleCopyText(msg.id, msg.content)}
                              className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-orange-600 transition-colors dark:text-slate-400 dark:hover:bg-slate-700"
                              title={isAr ? 'نسخ النص' : 'Copy'}
                            >
                              {copiedId === msg.id ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        )}

                        {/* Message Content with Markdown rendering */}
                        <div className="whitespace-pre-wrap space-y-1.5">
                          {msg.content.split('\n\n').map((paragraph, pIdx) => (
                            <p key={pIdx}>
                              {paragraph.split('\n').map((line, lIdx) => {
                                const boldSegments = line.split(/(\*\*.*?\*\*)/g);
                                return (
                                  <span key={lIdx} className="block">
                                    {boldSegments.map((segment, sIdx) => {
                                      if (segment.startsWith('**') && segment.endsWith('**')) {
                                        return (
                                          <strong
                                            key={sIdx}
                                            className={
                                              isUser ? 'text-orange-100 font-bold' : 'text-slate-950 font-bold dark:text-white'
                                            }
                                          >
                                            {segment.slice(2, -2)}
                                          </strong>
                                        );
                                      }
                                      return segment;
                                    })}
                                  </span>
                                );
                              })}
                            </p>
                          ))}
                        </div>

                        {/* Web Sources Grounding Citations */}
                        {msg.webSources && msg.webSources.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-700 dark:text-blue-400">
                              <Globe className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                              <span>{isAr ? 'مصادر البحث الموثوقة:' : 'Search Sources:'}</span>
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {msg.webSources.map((source, sIdx) => (
                                <a
                                  key={sIdx}
                                  href={source.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50/70 px-2 py-0.5 text-[10px] text-blue-800 hover:bg-blue-100 transition-colors dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
                                >
                                  <span>{source.title}</span>
                                  <ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Google Maps Grounding Links */}
                        {msg.mapSources && msg.mapSources.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                              <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                              <span>{isAr ? 'المواقع المحددة على خرائط جوجل:' : 'Google Maps Places:'}</span>
                            </span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {msg.mapSources.map((place, pIdx) => (
                                <a
                                  key={pIdx}
                                  href={place.uri}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-0.5 text-[10px] font-medium text-emerald-800 hover:bg-emerald-100 transition-colors dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                                >
                                  <span>{place.title}</span>
                                  <ArrowUpRight className="h-2.5 w-2.5 opacity-70" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Timestamp & Model Used */}
                        <div
                          className={`mt-2 flex items-center justify-between text-[9px] ${
                            isUser ? 'text-orange-200' : 'text-slate-400'
                          }`}
                        >
                          <span>{msg.modelUsed ? 'OxenGL Operational Intelligence' : ''}</span>
                          <span>{msg.timestamp}</span>
                        </div>

                        {/* Suggested Follow-up Actions */}
                        {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              {isAr ? '💡 مقترحات سريعة:' : '💡 Follow-up:'}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {msg.suggestedActions.map((action, aIdx) => (
                                <button
                                  key={aIdx}
                                  onClick={() => handleSendMessage(action.query)}
                                  className="flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50/70 px-2 py-0.5 text-[10px] font-semibold text-orange-800 transition-all hover:bg-orange-100 hover:border-orange-300 text-right dark:border-orange-800/60 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-900/40"
                                >
                                  <span>{isAr ? action.labelAr : action.labelEn}</span>
                                  <ArrowUpRight className="h-2.5 w-2.5 opacity-60" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {isUser && (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700 font-bold text-xs shadow-xs dark:bg-slate-700 dark:text-slate-200">
                          {currentUser.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Loading indicator */}
                {loading && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-xs">
                      <Bot className="h-4 w-4 animate-spin" />
                    </div>
                    <div className="rounded-2xl border border-orange-100 bg-white p-3 shadow-xs text-xs text-slate-600 flex items-center gap-2 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-600" />
                      </span>
                      <span>
                        {useMaps
                          ? (isAr ? 'جاري استرداد بيانات المواقع من خرائط جوجل...' : 'Retrieving Google Maps locations...')
                          : useSearch
                          ? (isAr ? 'جاري البحث في الويب واللوائح المعتمدة...' : 'Searching live web regulations...')
                          : (isAr ? 'جاري تدقيق البيانات وصياغة الرد الذكي...' : 'Auditing operations and drafting response...')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Pending Draft Action Approval Card */}
                {pendingDraft && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30">
                    <div className="mb-2 flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300 text-xs">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span>{isAr ? 'إجراء يتطلب اعتمادك' : 'Action Requires Approval'}</span>
                    </div>
                    <pre className="mb-3 max-h-48 overflow-x-auto overflow-y-auto rounded-lg bg-slate-900 p-2 text-[11px] font-mono text-emerald-400 dark:bg-black/80">
                      {JSON.stringify(pendingDraft, null, 2)}
                    </pre>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveExecute(true)}
                        disabled={loading}
                        className="flex-1 rounded-lg bg-emerald-600 py-1.5 px-3 font-bold text-white text-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                      >
                        {isAr ? 'اعتماد وتنفيذ' : 'Approve & Execute'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproveExecute(false)}
                        disabled={loading}
                        className="flex-1 rounded-lg bg-slate-200 py-1.5 px-3 font-bold text-slate-700 text-xs hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
                      >
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick Starter Chips */}
              <div className="shrink-0 border-t border-slate-100 bg-white px-3 py-1.5 dark:border-slate-800 dark:bg-[#101322]">
                <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                  {quickChips.map((chip, idx) => {
                    const Icon = chip.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(chip.query)}
                        className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-950 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                      >
                        <Icon className="h-3 w-3 text-orange-600" />
                        <span>{isAr ? chip.labelAr : chip.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Input Bar with Voice Support */}
              <div className="shrink-0 border-t border-slate-200/90 bg-white p-2.5 dark:border-slate-800 dark:bg-[#101322]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  {/* Voice Button */}
                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                      isListening
                        ? 'border-rose-400 bg-rose-50 text-rose-600 animate-pulse ring-2 ring-rose-300 dark:bg-rose-950/40 dark:border-rose-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white'
                    }`}
                    title={
                      isListening
                        ? isAr
                          ? 'جاري الاستماع... اضغط للإيقاف'
                          : 'Listening... click to stop'
                        : isAr
                        ? 'إملاء صوتي (تحدث بالسؤال)'
                        : 'Voice Dictation'
                    }
                  >
                    {isListening ? <MicOff className="h-4 w-4 text-rose-600" /> : <Mic className="h-4 w-4" />}
                  </button>

                  {/* Text Input */}
                  <input
                    type="text"
                    value={input}
                    disabled={loading || !!pendingDraft}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                      pendingDraft
                        ? isAr
                          ? 'يرجى اعتماد أو إلغاء الإجراء أعلاه للمتابعة...'
                          : 'Please approve or cancel the action above...'
                        : isListening
                        ? isAr
                          ? 'جاري الاستماع لصوتك...'
                          : 'Listening to your voice...'
                        : isAr
                        ? 'اكتب سؤالك أو استفسارك هنا...'
                        : 'Ask about weighbridge loss, crusher accounts...'
                    }
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500 disabled:opacity-60"
                  />

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={loading || !input.trim() || !!pendingDraft}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-md shadow-orange-200 disabled:opacity-40 hover:opacity-95 transition-all dark:shadow-none"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>

                <div className="mt-1 flex items-center justify-between px-1 text-[9px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-600" />
                    <span>{isAr ? 'بيانات مؤمنة ومتطابقة مع هيئة الزكاة (ZATCA)' : 'ZATCA Compliant Audit'}</span>
                  </span>
                  <span>{isAr ? 'وضع التحليل التشغيلي' : 'Operational analysis mode'}</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
