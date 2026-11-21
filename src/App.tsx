import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Layers,
  User,
  LogOut,
  Sparkles,
  LayoutDashboard,
  Settings,
} from 'lucide-react';
import { SecureLLMSettingsModal } from './components/SecureLLMSettingsModal';
import { ExamWorkspace } from './components/ExamWorkspace';
import { TeacherDashboard } from './components/TeacherDashboard';
import { AuthModal } from './components/AuthModal';
import { ExamHistoryModal, SavedExamSummary } from './components/ExamHistoryModal';
import {
  TeacherUser,
  getSavedUser,
  getAuthToken,
  setSavedUser,
  removeAuthToken,
  removeSavedUser,
  resetGuestSessionId,
  authFetch,
} from './utils/auth';

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLlmConfigured, setIsLlmConfigured] = useState(false);
  const [activeModel, setActiveModel] = useState('openrouter/free');

  // Authentication & History States
  const [currentUser, setCurrentUser] = useState<TeacherUser | null>(null);
  const [mainView, setMainView] = useState<'dashboard' | 'workspace'>('workspace');
  // Immediately start in validating mode only if an educator token exists in localStorage
  const [isSessionValidating, setIsSessionValidating] = useState<boolean>(() => Boolean(getAuthToken()));
  const [authInitialNotice, setAuthInitialNotice] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [savedExams, setSavedExams] = useState<SavedExamSummary[]>([]);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [preselectedDocId, setPreselectedDocId] = useState<string | null>(null);

  // Check LLM status on mount
  const checkStatus = async () => {
    try {
      const res = await fetch('/api/llm/status');
      if (res.ok) {
        const data = await res.json();
        setIsLlmConfigured(data.is_configured);
        if (data.model) setActiveModel(data.model);
      }
    } catch {
      // Backend may be booting
    }
  };

  // Fetch initial exams list for history modal count
  const fetchExamsList = async () => {
    try {
      const res = await authFetch('/api/exams');
      if (res.ok) {
        const data = await res.json();
        setSavedExams(data);
      }
    } catch {
      // Backend booting
    }
  };

  useEffect(() => {
    checkStatus();

    const validateSessionOnStartup = async () => {
      const token = getAuthToken();
      if (!token) {
        // Pure guest mode: immediately available without blocking
        setIsSessionValidating(false);
        fetchExamsList();
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            setSavedUser(data.user);
            setCurrentUser(data.user);
            setMainView('dashboard');
            setIsSessionValidating(false);
            fetchExamsList();
            return;
          }
        }

        // Token is expired, revoked, or invalid
        removeAuthToken();
        removeSavedUser();
        setCurrentUser(null);
        setMainView('workspace');
        setIsSessionValidating(false);
        setAuthInitialNotice('Your previous educator session has expired or was revoked. Please sign in again.');
        setIsAuthModalOpen(true);
        fetchExamsList();
      } catch (err) {
        console.warn('Session verification warning:', err);
        // On network error, do not aggressively discard credentials; keep in safe workspace view
        setIsSessionValidating(false);
        fetchExamsList();
      }
    };

    validateSessionOnStartup();

    const handleAuthExpired = () => {
      setCurrentUser(null);
      setMainView('workspace');
      setAuthInitialNotice('Your educator session has expired. Please sign in again.');
      setIsAuthModalOpen(true);
      fetchExamsList();
    };

    window.addEventListener('examcraft_auth_expired', handleAuthExpired);
    return () => {
      window.removeEventListener('examcraft_auth_expired', handleAuthExpired);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // proceed with local cleanup
    }
    removeAuthToken();
    removeSavedUser();
    resetGuestSessionId();
    setCurrentUser(null);
    setAuthInitialNotice(null);
    setMainView('workspace');
    setIsAuthModalOpen(false);
    window.dispatchEvent(new CustomEvent('examcraft_auth_changed'));
    fetchExamsList();
  };

  const handleAuthSuccess = (user: TeacherUser) => {
    setAuthInitialNotice(null);
    setCurrentUser(user);
    setMainView('dashboard');
    window.dispatchEvent(new CustomEvent('examcraft_auth_changed'));
    fetchExamsList();
  };

  const handleSelectExamFromHistory = (examId: string) => {
    setPreselectedDocId(null);
    setActiveExamId(examId);
    setMainView('workspace');
  };

  const handleCreateNewExam = (documentId?: string) => {
    setActiveExamId(null);
    setPreselectedDocId(documentId || null);
    setMainView('workspace');
  };

  const handleDeleteExamFromHistory = (examId: string) => {
    setSavedExams((prev) => prev.filter((e) => e.id !== examId));
    window.dispatchEvent(new CustomEvent('examcraft_auth_changed'));
  };

  // While validating saved teacher credentials on startup, present a clean themed loading state
  // to avoid flashing Guest mode or private dashboard data before confirmation
  if (isSessionValidating) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#9D174D] text-white flex items-center justify-center font-black text-2xl shadow-md mb-4 animate-pulse">
          E
        </div>
        <div className="flex items-center gap-2 text-stone-800 font-bold text-sm">
          <Sparkles className="w-4 h-4 text-[#9D174D] animate-spin" />
          <span>Verifying Educator Session...</span>
        </div>
        <p className="text-xs text-stone-500 mt-1.5 max-w-xs">
          Validating institutional authorization and loading your private workspace
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FAF9F6] via-pink-50/25 to-stone-50/90 text-[#1F1924] flex flex-col">
      {/* Top Navigation Bar */}
      <header className="no-print border-b border-stone-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          {/* Left Branding */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-[#9D174D] text-white flex items-center justify-center font-black text-xs sm:text-base shadow-xs shrink-0">
              E
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1 sm:gap-1.5">
                <span className="font-bold text-xs sm:text-base lg:text-lg tracking-tight text-[#9D174D] whitespace-nowrap">
                  ExamCraft<span className="hidden sm:inline"> AI</span>
                </span>
              </div>
              <p className="hidden xl:block text-[11px] text-stone-500 font-medium leading-tight">
                Source-Grounded Examination Platform
              </p>
            </div>
          </div>

          {/* View Switcher Controls (Teacher Dashboard is exclusively for authenticated educators) */}
          {currentUser ? (
            <div className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-stone-100/90 rounded-xl border border-stone-200/80 shrink-0">
              <button
                onClick={() => setMainView('dashboard')}
                className={`inline-flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[34px] ${
                  mainView === 'dashboard'
                    ? 'bg-white text-[#9D174D] shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <LayoutDashboard className="w-3.5 h-3.5 hidden sm:inline shrink-0" />
                <span className="hidden md:inline">Teacher Dashboard</span>
                <span className="md:hidden">Dashboard</span>
              </button>
              <button
                onClick={() => setMainView('workspace')}
                className={`inline-flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all cursor-pointer whitespace-nowrap min-h-[34px] ${
                  mainView === 'workspace'
                    ? 'bg-white text-[#9D174D] shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 hidden sm:inline shrink-0" />
                <span className="hidden md:inline">Exam Workspace</span>
                <span className="md:hidden">Workspace</span>
              </button>
            </div>
          ) : (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100/90 text-stone-700 text-xs font-bold border border-stone-200/70 shadow-2xs shrink-0">
              <Layers className="w-3.5 h-3.5 text-[#9D174D]" />
              <span>Exam Workspace</span>
            </div>
          )}

          {/* Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Exam History Button (Exclusively for Authenticated Teachers) */}
          {currentUser && (
              <button
                onClick={() => setIsHistoryModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl border border-pink-200 bg-pink-50/80 hover:bg-pink-100 text-[#9D174D] text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 min-h-[36px]"
                title="Examination History"
                aria-label="Exam History"
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">Exam History</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] leading-none bg-[#9D174D] text-white font-bold tabular-nums">
                  {savedExams.length}
                </span>
              </button>
            )}

            {/* Teacher Auth / Guest Status Indicator */}
            {currentUser ? (
              <div className="flex items-center gap-1 sm:gap-1.5 pl-1.5 sm:pl-2 border-l border-stone-200 shrink-0">
                <div
                  className="flex items-center gap-2 sm:px-2.5 sm:py-1 rounded-xl sm:bg-stone-100/90 sm:border sm:border-stone-200/80 text-stone-800 text-xs font-semibold shrink-0 sm:min-h-[36px]"
                  title={`${currentUser.full_name}${currentUser.institution ? ` · ${currentUser.institution}` : ''}`}
                >
                  <div className="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-[#9D174D] text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                    {currentUser.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left hidden xl:block">
                    <div className="leading-tight font-bold truncate max-w-[120px]">{currentUser.full_name}</div>
                    <div className="text-[10px] text-stone-500 font-normal truncate max-w-[120px]">
                      {currentUser.institution || 'Teacher'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  title="Log Out"
                  className="p-1.5 sm:p-2 rounded-xl border border-stone-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-stone-500 hover:text-rose-600 transition-colors cursor-pointer shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center"
                  aria-label="Log Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-stone-200 shrink-0">
                <div className="px-2.5 py-1 rounded-xl bg-stone-100 text-stone-600 text-xs font-medium hidden lg:flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400" />
                  <span>Guest Mode</span>
                </div>
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0 min-h-[36px]"
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Sign In / Register</span>
                  <span className="sm:hidden">Sign In</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7 md:py-8 flex-1 w-full space-y-6 sm:space-y-8 min-w-0">
        {mainView === 'dashboard' && currentUser ? (
          <TeacherDashboard
            currentUser={currentUser}
            onSelectExam={(examId) => {
              setPreselectedDocId(null);
              setActiveExamId(examId);
              setMainView('workspace');
            }}
            onCreateNewExam={(documentId) => {
              handleCreateNewExam(documentId);
            }}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            onProfileUpdated={(user) => {
              setCurrentUser(user);
            }}
          />
        ) : (
          <div className="space-y-6 min-w-0">
            {/* Active Educator Examination Workspace */}
            <ExamWorkspace
              isLlmConfigured={isLlmConfigured}
              externalActiveExamId={activeExamId}
              preselectedDocumentId={preselectedDocId}
              currentUser={currentUser}
              onOpenHistory={currentUser ? () => setIsHistoryModalOpen(true) : undefined}
              onExamsUpdated={(exams) => setSavedExams(exams as any)}
              onBackToDashboard={currentUser ? () => setMainView('dashboard') : undefined}
            />
          </div>
        )}
      </main>

      {/* Clean Academic Footer with Developer/Admin Settings Area */}
      <footer className="no-print border-t border-stone-200/80 bg-white/90 py-3.5 px-3 sm:px-6 lg:px-8 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs sm:text-[11px] text-stone-500 text-center sm:text-left">
          <span>ExamCraft AI · Academic Examination Generation Platform</span>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-stone-500 hover:text-[#9D174D] hover:bg-pink-50/70 transition-colors cursor-pointer min-h-[36px] sm:min-h-0"
            title="Developer / Admin AI Provider Settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Developer / Admin Settings</span>
          </button>
        </div>
      </footer>

      {/* Secure LLM Settings Modal */}
      <SecureLLMSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onStatusChange={(configured) => setIsLlmConfigured(configured)}
      />

      {/* Teacher Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setAuthInitialNotice(null);
        }}
        onSuccess={handleAuthSuccess}
        initialNotice={authInitialNotice}
      />

      {/* Exam History Modal (Exclusively for Authenticated Teachers) */}
      {currentUser && (
        <ExamHistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          exams={savedExams}
          activeExamId={activeExamId}
          onSelectExam={handleSelectExamFromHistory}
          onCreateNewExam={handleCreateNewExam}
          onDeleteExam={handleDeleteExamFromHistory}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}
    </div>
  );
}
