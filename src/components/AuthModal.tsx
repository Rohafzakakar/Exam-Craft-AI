import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  BookOpen,
  FileText,
  Building2,
} from 'lucide-react';
import {
  TeacherUser,
  setAuthToken,
  setSavedUser,
  getGuestSessionId,
} from '../utils/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: TeacherUser) => void;
  initialNotice?: string | null;
}

export function AuthModal({ isOpen, onClose, onSuccess, initialNotice }: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  // Explicit consent checkbox MUST be unchecked by default
  const [consentImportGuest, setConsentImportGuest] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const clearFormState = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setInstitution('');
    setConsentImportGuest(false);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Reset sensitive fields on modal open/close and apply initialNotice if present
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg(initialNotice || null);
      setSuccessMsg(null);
      setConsentImportGuest(false);
    } else {
      setPassword('');
    }
  }, [isOpen, initialNotice]);

  // Cleanly wipe all form details on logout or token expiration
  useEffect(() => {
    const handleAuthReset = () => {
      clearFormState();
      setTab('login');
    };
    window.addEventListener('examcraft_auth_changed', handleAuthReset);
    window.addEventListener('examcraft_auth_expired', handleAuthReset);
    return () => {
      window.removeEventListener('examcraft_auth_changed', handleAuthReset);
      window.removeEventListener('examcraft_auth_expired', handleAuthReset);
    };
  }, []);

  const handleTabSwitch = (newTab: 'login' | 'register') => {
    if (newTab === tab) return;
    setTab(newTab);
    // Clear password whenever switching between Sign In and Create Account
    setPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
    setConsentImportGuest(false);
    if (newTab === 'login') {
      setFullName('');
      setInstitution('');
    }
  };

  const handleClose = () => {
    setPassword('');
    setErrorMsg(null);
    setSuccessMsg(null);
    onClose();
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      const cleanEmail = (email || '').trim().toLowerCase();

      if (tab === 'login') {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || 'Login failed. Please check your credentials.');
        }

        setAuthToken(data.token);
        setSavedUser(data.user);
        setPassword('');
        setSuccessMsg('Welcome back! Loading your saved examinations...');
        setTimeout(() => {
          onSuccess(data.user);
          clearFormState();
          onClose();
        }, 600);
      } else {
        const guestId = getGuestSessionId();
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            password,
            full_name: fullName.trim(),
            institution: institution.trim(),
            import_guest_session_id: guestId,
            consent_import_guest: consentImportGuest,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || 'Registration failed. Please check your details.');
        }

        setAuthToken(data.token);
        setSavedUser(data.user);
        setPassword('');
        setSuccessMsg(
          consentImportGuest && data.guest_migration?.transferredExams > 0
            ? 'Account created and guest examination successfully linked!'
            : 'Teacher account created successfully!'
        );
        setTimeout(() => {
          onSuccess(data.user);
          clearFormState();
          onClose();
        }, 800);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div
        className="w-full max-w-4xl bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200 overflow-hidden grid grid-cols-1 md:grid-cols-12 my-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Column: Teacher Dashboard & Document Archive Explanation (Hidden on mobile below md) */}
        <div className="hidden md:flex md:col-span-5 bg-gradient-to-br from-pink-50/90 via-pink-50/50 to-white p-6 sm:p-7 border-b md:border-b-0 md:border-r border-pink-100 flex-col justify-between space-y-6 overflow-y-auto">
          <div className="space-y-5">
            {/* Header badge & title */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-100/90 text-[#9D174D] text-xs font-bold w-fit">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Educator Platform</span>
              </div>
              <h3 className="text-lg font-black text-stone-900 tracking-tight leading-snug">
                Teacher Dashboard & Document Archive
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                The Teacher Dashboard, persistent examination histories, and institutional document libraries are reserved exclusively for authenticated educators.
              </p>
            </div>

            {/* Feature List */}
            <div className="space-y-3.5 pt-1">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-pink-200/80 text-[#9D174D] flex items-center justify-center shrink-0 mt-0.5">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-stone-900">Isolated Examination History</h4>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Securely archive, retrieve, reorder, and reopen your multi-group examination papers across sessions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-pink-200/80 text-[#9D174D] flex items-center justify-center shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-stone-900">Private Document Library</h4>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Store and index your course syllabus, PDF materials, and textbooks with chunk-level inspection.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white shadow-2xs border border-pink-200/80 text-[#9D174D] flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-stone-900">Department Preferences</h4>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Preset institutional branding, faculty headers, default test durations, and Bloom's taxonomy settings.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-pink-200/60 flex items-center gap-2 text-[11px] text-stone-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Encrypted passwords & private educator archive</span>
          </div>
        </div>

        {/* Right Column: Sign In / Create Account Form */}
        <div className="col-span-1 md:col-span-7 flex flex-col justify-between overflow-y-auto min-h-0">
          {/* Modal Header */}
          <div className="bg-gradient-to-br from-[#9D174D] to-[#83133E] text-white p-4 sm:p-6 relative shrink-0">
            <button
              onClick={handleClose}
              className="absolute top-4 sm:top-5 right-4 sm:right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-2 pr-10">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center font-black text-lg shrink-0">
                E
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold">ExamCraft Educator Portal</h2>
                <p className="text-xs text-pink-100 font-medium">
                  Persistent examination storage & multi-group management
                </p>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex bg-black/20 p-1 rounded-xl mt-4">
              <button
                type="button"
                onClick={() => handleTabSwitch('login')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  tab === 'login'
                    ? 'bg-white text-[#9D174D] shadow-xs'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch('register')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  tab === 'register'
                    ? 'bg-white text-[#9D174D] shadow-xs'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <span>{errorMsg}</span>
                    {errorMsg.includes('already exists') && tab === 'register' && (
                      <button
                        type="button"
                        onClick={() => handleTabSwitch('login')}
                        className="block font-bold text-[#9D174D] hover:underline cursor-pointer"
                      >
                        Click here to Sign In with this email &rarr;
                      </button>
                    )}
                  </div>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {tab === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Full Name & Title
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        required
                        placeholder="Prof. Jane Harrison"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-[#9D174D]/30 focus:border-[#9D174D]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Academic Institution / Department
                    </label>
                    <div className="relative">
                      <GraduationCap className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="Department of Biological Sciences"
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-[#9D174D]/30 focus:border-[#9D174D]"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="instructor@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-[#9D174D]/30 focus:border-[#9D174D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-[#9D174D]/30 focus:border-[#9D174D]"
                  />
                </div>
                {tab === 'login' && (
                  <p className="text-[11px] text-stone-500 mt-1.5 leading-tight">
                    Registered accounts preserve personal exam archives. <span className="text-stone-400">(Offline/local deployment: credential recovery via administrator)</span>
                  </p>
                )}
              </div>

              {/* Explicit Consent Checkbox for Guest Data Migration */}
              {tab === 'register' && (
                <div className="p-3.5 rounded-xl bg-pink-50/70 border border-pink-200/90 space-y-1.5">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentImportGuest}
                      onChange={(e) => setConsentImportGuest(e.target.checked)}
                      className="mt-0.5 rounded text-[#9D174D] focus:ring-[#9D174D]"
                    />
                    <span className="text-xs font-bold text-stone-800 leading-tight">
                      Import my current guest examination & documents into my new account
                    </span>
                  </label>
                  <p className="text-[11px] text-stone-500 pl-6 leading-relaxed">
                    If checked, your active guest session exam and documents will be permanently assigned to your teacher account. If unchecked, your account will start fresh.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                {isLoading ? (
                  <span className="inline-block animate-spin mr-1">⏳</span>
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                <span>
                  {tab === 'login' ? 'Sign In to Account' : 'Create Teacher Account'}
                </span>
              </button>

              <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
                <span>Prefer testing without an account?</span>
                <button
                  type="button"
                  onClick={handleClose}
                  className="font-semibold text-[#9D174D] hover:underline cursor-pointer"
                >
                  Continue in Guest Mode
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
