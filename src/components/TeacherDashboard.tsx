import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Building2,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Trash2,
  ExternalLink,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Award,
  Globe,
  User,
  Save,
  RefreshCw,
  Eye,
  X,
  ChevronRight,
  Info,
  Calendar,
  Shield,
  FileCheck2,
} from 'lucide-react';
import { TeacherUser, authFetch, setSavedUser, getSavedUser } from '../utils/auth';
import { SavedExamSummary } from './ExamHistoryModal';

export interface DocumentSummary {
  id: string;
  user_id?: string | null;
  session_id?: string | null;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  detected_language: string;
  is_rtl: boolean;
  total_pages: number;
  status: string;
  metadata?: any;
  chunks_count: number;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  page_number: number;
  chapter?: string | null;
  section?: string | null;
  content: string;
  token_count: number;
  chunk_index: number;
}

export interface TeacherDashboardProps {
  currentUser: TeacherUser | null;
  onSelectExam: (examId: string) => void;
  onCreateNewExam: (documentId?: string) => void;
  onOpenAuth: () => void;
  onProfileUpdated?: (user: TeacherUser) => void;
}

type DashboardTab = 'overview' | 'exams' | 'documents' | 'preferences';

export function TeacherDashboard({
  currentUser,
  onSelectExam,
  onCreateNewExam,
  onOpenAuth,
  onProfileUpdated,
}: TeacherDashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Data states
  const [exams, setExams] = useState<SavedExamSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Filter state for My Examinations
  const [examSearch, setExamSearch] = useState<string>('');
  const [examGroupFilter, setExamGroupFilter] = useState<'all' | 'single' | 'multi'>('all');
  const [examLangFilter, setExamLangFilter] = useState<'all' | 'rtl' | 'ltr'>('all');
  const [examSort, setExamSort] = useState<'newest' | 'oldest' | 'questions' | 'marks' | 'title'>('newest');

  // Document Management state
  const [selectedDocForChunks, setSelectedDocForChunks] = useState<DocumentSummary | null>(null);
  const [docChunks, setDocChunks] = useState<DocumentChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState<boolean>(false);
  const [docSearch, setDocSearch] = useState<string>('');
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Action confirmations & export progress
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Institution Preferences form state
  const [prefFullName, setPrefFullName] = useState<string>(currentUser?.full_name || '');
  const [prefInstitution, setPrefInstitution] = useState<string>(currentUser?.institution || '');
  const [prefFaculty, setPrefFaculty] = useState<string>('');
  const [prefDuration, setPrefDuration] = useState<number>(60);
  const [prefGroupsCount, setPrefGroupsCount] = useState<number>(3);
  const [prefBloom, setPrefBloom] = useState<boolean>(true);
  const [prefSaving, setPrefSaving] = useState<boolean>(false);
  const [prefMessage, setPrefMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (currentUser) {
      setPrefFullName(currentUser.full_name || '');
      setPrefInstitution(currentUser.institution || '');
    }
    const savedPrefs = localStorage.getItem('examcraft_teacher_preferences');
    if (savedPrefs) {
      try {
        const p = JSON.parse(savedPrefs);
        if (p.faculty) setPrefFaculty(p.faculty);
        if (p.duration) setPrefDuration(p.duration);
        if (p.groupsCount) setPrefGroupsCount(p.groupsCount);
        if (p.bloom !== undefined) setPrefBloom(Boolean(p.bloom));
      } catch {
        // ignore JSON parse error
      }
    }
  }, [currentUser]);

  // Fetch teacher's authorized exams and documents
  const fetchData = useCallback(async () => {
    const activeUser = currentUser || getSavedUser();
    if (!activeUser) {
      setExams([]);
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [examsRes, docsRes] = await Promise.all([
        authFetch('/api/exams'),
        authFetch('/api/documents'),
      ]);

      if (!examsRes.ok) {
        throw new Error(`Failed to fetch examinations (HTTP ${examsRes.status})`);
      }
      if (!docsRes.ok) {
        throw new Error(`Failed to fetch documents (HTTP ${docsRes.status})`);
      }

      const examsData = await examsRes.json();
      const docsData = await docsRes.json();

      setExams(Array.isArray(examsData) ? examsData : []);
      setDocuments(Array.isArray(docsData) ? docsData : []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to connect to ExamCraft AI backend.');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    fetchData();

    const handleDataChanged = () => {
      fetchData();
    };

    window.addEventListener('examcraft_auth_changed', handleDataChanged);
    return () => {
      window.removeEventListener('examcraft_auth_changed', handleDataChanged);
    };
  }, [fetchData]);

  // Summary statistics calculated strictly from authorized live data
  const stats = useMemo(() => {
    const totalExams = exams.length;
    const totalQuestions = exams.reduce((sum, e) => sum + (e.questions_count || 0), 0);
    const totalGroups = exams.reduce((sum, e) => sum + (e.groups_count || 1), 0);
    const totalDocs = documents.length;
    const totalMarks = exams.reduce((sum, e) => sum + (e.total_marks || 0), 0);
    const avgQuestionsPerExam = totalExams > 0 ? (totalQuestions / totalExams).toFixed(1) : '0';

    return {
      totalExams,
      totalQuestions,
      totalGroups,
      totalDocs,
      totalMarks,
      avgQuestionsPerExam,
    };
  }, [exams, documents]);

  // Filtered & sorted examinations list
  const filteredExams = useMemo(() => {
    let result = [...exams];

    if (examSearch.trim()) {
      const q = examSearch.toLowerCase().trim();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q) ||
          (e.institution && e.institution.toLowerCase().includes(q))
      );
    }

    if (examGroupFilter === 'single') {
      result = result.filter((e) => (e.groups_count || 1) <= 1);
    } else if (examGroupFilter === 'multi') {
      result = result.filter((e) => (e.groups_count || 1) >= 2);
    }

    if (examLangFilter === 'rtl') {
      result = result.filter(
        (e) =>
          /[\u0600-\u06FF]/.test(e.title) ||
          /[\u0600-\u06FF]/.test(e.subject)
      );
    } else if (examLangFilter === 'ltr') {
      result = result.filter(
        (e) =>
          !/[\u0600-\u06FF]/.test(e.title) &&
          !/[\u0600-\u06FF]/.test(e.subject)
      );
    }

    result.sort((a, b) => {
      if (examSort === 'newest') {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      if (examSort === 'oldest') {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      }
      if (examSort === 'questions') {
        return (b.questions_count || 0) - (a.questions_count || 0);
      }
      if (examSort === 'marks') {
        return (b.total_marks || 0) - (a.total_marks || 0);
      }
      if (examSort === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return result;
  }, [exams, examSearch, examGroupFilter, examLangFilter, examSort]);

  // Filtered documents list
  const filteredDocs = useMemo(() => {
    if (!docSearch.trim()) return documents;
    const q = docSearch.toLowerCase().trim();
    return documents.filter((d) => d.filename.toLowerCase().includes(q));
  }, [documents, docSearch]);

  // Export handler
  const handleExport = async (examId: string, format: 'docx' | 'pdf', e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingId(`${examId}-${format}`);
    try {
      const res = await authFetch(`/api/exams/${examId}/export/${format}?target=both`);
      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Exam_${examId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMsg(`Export error: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Delete exam handler
  const handleDeleteExam = async (examId: string) => {
    try {
      const res = await authFetch(`/api/exams/${examId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete examination.');
      }
      setExams((prev) => prev.filter((e) => e.id !== examId));
      setDeletingExamId(null);
      setActionSuccessMsg('Examination deleted successfully.');
      setTimeout(() => setActionSuccessMsg(null), 4000);
      window.dispatchEvent(new CustomEvent('examcraft_auth_changed'));
    } catch (err: any) {
      setErrorMsg(`Delete error: ${err.message}`);
    }
  };

  // Delete document handler
  const handleDeleteDoc = async (docId: string) => {
    try {
      const res = await authFetch(`/api/documents/${docId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete document.');
      }
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setDeletingDocId(null);
      if (selectedDocForChunks?.id === docId) {
        setSelectedDocForChunks(null);
      }
      setActionSuccessMsg('Document removed from library.');
      setTimeout(() => setActionSuccessMsg(null), 4000);
      window.dispatchEvent(new CustomEvent('examcraft_auth_changed'));
    } catch (err: any) {
      setErrorMsg(`Document deletion error: ${err.message}`);
    }
  };

  // Document upload handler
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    setUploadError(null);
    setUploadSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await authFetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Upload failed with HTTP ${res.status}`);
      }

      const uploadedDoc = await res.json();
      setUploadSuccess(`"${uploadedDoc.filename}" successfully indexed (${uploadedDoc.chunks_count || 0} chunks).`);
      setDocuments((prev) => [uploadedDoc, ...prev]);
      window.dispatchEvent(new CustomEvent('examcraft_auth_changed'));
      setTimeout(() => setUploadSuccess(null), 5000);
    } catch (err: any) {
      setUploadError(err.message || 'File upload failed.');
    } finally {
      setIsUploadingDoc(false);
      e.target.value = '';
    }
  };

  // Inspect chunks handler
  const handleInspectDocChunks = async (doc: DocumentSummary) => {
    setSelectedDocForChunks(doc);
    setLoadingChunks(true);
    try {
      const res = await authFetch(`/api/documents/${doc.id}/chunks`);
      if (res.ok) {
        const chunks = await res.json();
        setDocChunks(Array.isArray(chunks) ? chunks : []);
      } else {
        setDocChunks([]);
      }
    } catch {
      setDocChunks([]);
    } finally {
      setLoadingChunks(false);
    }
  };

  // Save institution & exam preferences
  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefSaving(true);
    setPrefMessage(null);

    try {
      if (currentUser) {
        const res = await authFetch('/api/auth/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            full_name: prefFullName.trim(),
            institution: prefInstitution.trim(),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'Failed to update teacher profile on server.');
        }

        const data = await res.json();
        if (data.user) {
          setSavedUser(data.user);
          if (onProfileUpdated) onProfileUpdated(data.user);
        }
      }

      // Save local exam defaults
      const localPrefs = {
        faculty: prefFaculty.trim(),
        duration: prefDuration,
        groupsCount: prefGroupsCount,
        bloom: prefBloom,
      };
      localStorage.setItem('examcraft_teacher_preferences', JSON.stringify(localPrefs));

      setPrefMessage({
        type: 'success',
        text: 'Institution details and exam preferences saved successfully.',
      });
      setTimeout(() => setPrefMessage(null), 5000);
    } catch (err: any) {
      setPrefMessage({ type: 'error', text: err.message || 'Failed to save preferences.' });
    } finally {
      setPrefSaving(false);
    }
  };

  // Format file size
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-6 text-center animate-in fade-in duration-200">
        <div className="w-16 h-16 rounded-3xl bg-pink-50 text-[#9D174D] flex items-center justify-center mx-auto shadow-inner">
          <Shield className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-stone-900 tracking-tight">
            Teacher Dashboard & Document Archive
          </h2>
          <p className="text-sm text-stone-600 max-w-md mx-auto leading-relaxed">
            The Teacher Dashboard, persistent examination histories, and institutional document libraries are reserved exclusively for authenticated educators.
          </p>
        </div>

        <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs text-left space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-pink-50 text-[#9D174D] flex items-center justify-center shrink-0 mt-0.5">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-900">Isolated Examination History</h4>
              <p className="text-xs text-stone-500">Securely archive, retrieve, reorder, and reopen your multi-group examination papers across sessions.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-pink-50 text-[#9D174D] flex items-center justify-center shrink-0 mt-0.5">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-900">Private Document Library</h4>
              <p className="text-xs text-stone-500">Store and index your course syllabus, PDF materials, and textbooks with chunk-level inspection.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-pink-50 text-[#9D174D] flex items-center justify-center shrink-0 mt-0.5">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-900">Department Preferences</h4>
              <p className="text-xs text-stone-500">Preset institutional branding, faculty headers, default test durations, and Bloom's taxonomy settings.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={onOpenAuth}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <User className="w-4 h-4" />
            <span>Sign In or Register as Teacher</span>
          </button>
          <button
            onClick={() => onCreateNewExam()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-xl border border-stone-200 transition-all cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span>Continue as Guest in Workspace</span>
          </button>
        </div>

        <p className="text-[11px] text-stone-400">
          Guest educators can freely generate and export source-grounded exams in the Workspace without creating an account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Success Toast */}
      {actionSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Teacher Profile & Welcome Hero */}
      <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-6 md:p-8 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-pink-100/40 via-pink-50/20 to-transparent rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-6">
          <div className="space-y-2 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-[#9D174D]">
              {currentUser ? 'Educator Workspace' : 'Guest Educator Workspace'}
            </div>

            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight break-words">
              {currentUser
                ? `Welcome back, ${currentUser.full_name}`
                : 'Welcome to ExamCraft AI'}
            </h1>

            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-stone-600 pt-1">
              {currentUser ? (
                <>
                  <div className="flex items-center gap-1.5 font-medium min-w-0">
                    <Building2 className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{currentUser.institution || 'Institutional Affiliation Not Set'}</span>
                  </div>
                  <span aria-hidden="true" className="text-stone-300 hidden sm:inline">·</span>
                  <div className="flex items-center gap-1.5 font-medium min-w-0">
                    <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="truncate">{currentUser.email}</span>
                  </div>
                  <span aria-hidden="true" className="text-stone-300 hidden sm:inline">·</span>
                  <div className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    <span>Verified Teacher Account</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
                    Guest Mode Active
                  </span>
                  <button
                    onClick={onOpenAuth}
                    className="text-[#9D174D] font-bold underline hover:text-[#83133E] cursor-pointer"
                  >
                    Register or Sign In to sync across devices
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
            <button
              onClick={() => onCreateNewExam()}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer min-h-[42px] sm:min-h-[38px]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Create New Examination</span>
            </button>
            <button
              onClick={fetchData}
              title="Refresh Data"
              aria-label="Refresh Data"
              className="p-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 transition-colors cursor-pointer min-w-[42px] min-h-[42px] sm:min-w-[38px] sm:min-h-[38px] flex items-center justify-center shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Zero-pill discipline, responsive wrapping segmented bar) */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 border-b border-stone-200/90 sm:overflow-x-auto pb-px">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
            activeTab === 'overview'
              ? 'border-[#9D174D] text-[#9D174D]'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 shrink-0" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('exams')}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
            activeTab === 'exams'
              ? 'border-[#9D174D] text-[#9D174D]'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>My Examinations</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] leading-none bg-stone-100 text-stone-700 font-semibold tabular-nums">
            {exams.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
            activeTab === 'documents'
              ? 'border-[#9D174D] text-[#9D174D]'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span>Document Library</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] leading-none bg-stone-100 text-stone-700 font-semibold tabular-nums">
            {documents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('preferences')}
          className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap min-h-[44px] ${
            activeTab === 'preferences'
              ? 'border-[#9D174D] text-[#9D174D]'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Institution & Exam Preferences</span>
          <span className="sm:hidden">Preferences</span>
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="p-8 text-center bg-white rounded-2xl border border-stone-200/80 space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#9D174D] mx-auto" />
          <p className="text-xs text-stone-500 font-medium">Loading authenticated examination records...</p>
        </div>
      )}

      {/* Global Error Banner */}
      {!loading && errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1 bg-white border border-rose-200 text-rose-700 rounded-lg font-bold hover:bg-rose-100 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {!loading && !errorMsg && activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Metric Cards (Calculated directly from authorized data) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] sm:text-xs font-medium text-stone-500 truncate">Saved Examinations</span>
                <div className="w-7 h-7 rounded-lg bg-pink-50 text-[#9D174D] flex items-center justify-center shrink-0">
                  <BookOpen className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight tabular-nums">
                {stats.totalExams}
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 truncate tabular-nums">
                {stats.totalExams === 1 ? '1 examination created' : `${stats.totalExams} examinations total`}
              </div>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] sm:text-xs font-medium text-stone-500 truncate">Total Questions</span>
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Award className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight tabular-nums">
                {stats.totalQuestions}
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 truncate tabular-nums">
                Avg. {stats.avgQuestionsPerExam} questions/exam
              </div>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] sm:text-xs font-medium text-stone-500 truncate">Exam Groups (A–J)</span>
                <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <Layers className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight tabular-nums">
                {stats.totalGroups}
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 truncate">
                Anti-cheating variants
              </div>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-1.5 sm:space-y-2">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px] sm:text-xs font-medium text-stone-500 truncate">Indexed Documents</span>
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <FileText className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight tabular-nums">
                {stats.totalDocs}
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 truncate">
                Curriculum sources
              </div>
            </div>
          </div>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
            <div
              onClick={() => onCreateNewExam()}
              className="p-4 sm:p-5 bg-gradient-to-br from-pink-50/70 to-white rounded-2xl border border-pink-200/80 hover:border-[#9D174D] transition-all cursor-pointer group shadow-2xs space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-[#9D174D] text-white flex items-center justify-center mb-1 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-stone-900 group-hover:text-[#9D174D] transition-colors">
                Generate Questions
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Upload or select a textbook to generate source-grounded questions across dynamic groups A–J.
              </p>
            </div>

            <div
              onClick={() => setActiveTab('documents')}
              className="p-4 sm:p-5 bg-white rounded-2xl border border-stone-200/90 hover:border-stone-400 transition-all cursor-pointer group shadow-2xs space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center mb-1 transition-transform">
                <Upload className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-stone-900 group-hover:text-[#9D174D] transition-colors">
                Manage Documents
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Add new curriculum materials, inspect indexed chunks, and review source page references.
              </p>
            </div>

            <div
              onClick={() => setActiveTab('preferences')}
              className="p-4 sm:p-5 bg-white rounded-2xl border border-stone-200/90 hover:border-stone-400 transition-all cursor-pointer group shadow-2xs space-y-2"
            >
              <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center mb-1 transition-transform">
                <Building2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-stone-900 group-hover:text-[#9D174D] transition-colors">
                Institution Preferences
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Customize university name, department, default duration, and exam header standards.
              </p>
            </div>
          </div>

          {/* Recent Examinations Section */}
          <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-stone-900">Recent Examinations</h3>
                <p className="text-xs text-stone-500">Your most recently created exam papers</p>
              </div>
              <button
                onClick={() => setActiveTab('exams')}
                className="text-xs font-bold text-[#9D174D] hover:underline flex items-center gap-1 cursor-pointer shrink-0 py-1.5 px-2 rounded-lg hover:bg-pink-50/70"
              >
                <span className="tabular-nums">View All ({exams.length})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {exams.length === 0 ? (
              <div className="p-6 sm:p-8 text-center rounded-xl bg-stone-50 border border-dashed border-stone-200 space-y-3">
                <BookOpen className="w-8 h-8 text-stone-400 mx-auto" />
                <p className="text-xs text-stone-500 font-medium">No saved examinations found yet.</p>
                <button
                  onClick={() => onCreateNewExam()}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[#9D174D] text-white text-xs font-bold rounded-xl hover:bg-[#83133E] transition-all cursor-pointer"
                >
                  Create Your First Examination
                </button>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {exams.slice(0, 4).map((exam) => (
                  <div
                    key={exam.id}
                    onClick={() => onSelectExam(exam.id)}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/70 -mx-2 px-2 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs sm:text-sm text-stone-900 group-hover:text-[#9D174D] transition-colors break-words">
                          {exam.title}
                        </span>
                        {exam.id === 'exam-cell-bio-midterm' && (
                          <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-medium shrink-0">
                            Tutorial Demo
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500 tabular-nums">
                        <span className="truncate max-w-[200px] sm:max-w-none">{exam.subject}</span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.questions_count || 0} questions</span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.groups_count || 1} groups</span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.total_marks || 0} marks</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-stretch sm:self-center justify-end shrink-0">
                      <button
                        onClick={(e) => handleExport(exam.id, 'docx', e)}
                        title="Download Word Document"
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[34px]"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>Word</span>
                      </button>
                      <button
                        onClick={(e) => handleExport(exam.id, 'pdf', e)}
                        title="Download PDF Document"
                        className="px-2.5 py-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[34px]"
                      >
                        <Download className="w-3.5 h-3.5 text-rose-600" />
                        <span>PDF</span>
                      </button>
                      <span className="text-xs font-bold text-[#9D174D] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 ml-1">
                        Open <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: MY EXAMINATIONS */}
      {!loading && !errorMsg && activeTab === 'exams' && (
        <div className="space-y-4">
          {/* Filter, Search & Sort Bar */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs space-y-3">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={examSearch}
                  onChange={(e) => setExamSearch(e.target.value)}
                  placeholder="Search examinations by title, subject, or institution..."
                  className="w-full pl-9 pr-8 py-2.5 sm:py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 focus:border-[#9D174D] min-h-[40px]"
                />
                {examSearch && (
                  <button
                    onClick={() => setExamSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
                {/* Group Filter */}
                <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-xl shrink-0">
                  <button
                    onClick={() => setExamGroupFilter('all')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px] sm:min-h-[32px] whitespace-nowrap ${
                      examGroupFilter === 'all'
                        ? 'bg-white text-stone-900 shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    All Groups
                  </button>
                  <button
                    onClick={() => setExamGroupFilter('single')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px] sm:min-h-[32px] whitespace-nowrap ${
                      examGroupFilter === 'single'
                        ? 'bg-white text-stone-900 shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    1 Group
                  </button>
                  <button
                    onClick={() => setExamGroupFilter('multi')}
                    className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer min-h-[36px] sm:min-h-[32px] whitespace-nowrap ${
                      examGroupFilter === 'multi'
                        ? 'bg-white text-stone-900 shadow-2xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    2–10 Groups
                  </button>
                </div>

                {/* Sort Selector */}
                <div className="flex items-center gap-1.5 shrink-0 text-xs">
                  <ArrowUpDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <select
                    value={examSort}
                    onChange={(e) => setExamSort(e.target.value as any)}
                    className="w-full sm:w-auto bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 cursor-pointer min-h-[40px]"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="questions">Most Questions</option>
                    <option value="marks">Highest Marks</option>
                    <option value="title">Alphabetical (A–Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Language orientation filter */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-stone-500 pt-2.5 border-t border-stone-100 gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-stone-500">Language:</span>
                <button
                  onClick={() => setExamLangFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    examLangFilter === 'all' ? 'bg-[#9D174D] text-white' : 'hover:bg-stone-100 text-stone-600'
                  }`}
                >
                  All Scripts
                </button>
                <button
                  onClick={() => setExamLangFilter('rtl')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    examLangFilter === 'rtl' ? 'bg-[#9D174D] text-white' : 'hover:bg-stone-100 text-stone-600'
                  }`}
                >
                  فارسی / دری (RTL)
                </button>
                <button
                  onClick={() => setExamLangFilter('ltr')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    examLangFilter === 'ltr' ? 'bg-[#9D174D] text-white' : 'hover:bg-stone-100 text-stone-600'
                  }`}
                >
                  English (LTR)
                </button>
              </div>

              <span className="text-[11px] text-stone-400 tabular-nums">Showing {filteredExams.length} of {exams.length} examinations</span>
            </div>
          </div>

          {/* Examinations List */}
          {filteredExams.length === 0 ? (
            <div className="bg-white p-8 sm:p-12 text-center rounded-2xl border border-stone-200/90 space-y-3">
              <BookOpen className="w-10 h-10 text-stone-300 mx-auto" />
              <h4 className="text-sm font-bold text-stone-800">No Examinations Found</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                {examSearch || examGroupFilter !== 'all' || examLangFilter !== 'all'
                  ? 'No examinations matched your active search or filters. Try clearing your filters.'
                  : 'You have not created any examinations yet. Get started by generating your first examination.'}
              </p>
              <button
                onClick={() => onCreateNewExam()}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Create New Examination
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredExams.map((exam) => {
                const isRtl = /[\u0600-\u06FF]/.test(exam.title);
                const isSeedExam = exam.id === 'exam-cell-bio-midterm';

                return (
                  <div
                    key={exam.id}
                    className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-2xs hover:border-[#9D174D]/60 transition-all flex flex-col justify-between gap-4 min-w-0"
                  >
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 flex-1 min-w-0">
                          <h4
                            dir={isRtl ? 'rtl' : 'ltr'}
                            className="text-sm font-bold text-stone-900 line-clamp-2 leading-snug"
                          >
                            {exam.title}
                          </h4>
                          <p
                            dir={isRtl ? 'rtl' : 'ltr'}
                            className="text-xs text-[#9D174D] font-semibold line-clamp-1"
                          >
                            {exam.subject}
                          </p>
                        </div>

                        {isSeedExam ? (
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium shrink-0">
                            Tutorial Seed
                          </span>
                        ) : (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-medium shrink-0">
                            Saved
                          </span>
                        )}
                      </div>

                      {/* Metadata Chips / Unboxed details */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-stone-500 pt-1 tabular-nums">
                        <span className="font-semibold text-stone-700">{exam.questions_count || 0} Questions</span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.groups_count || 1} Groups ({exam.groups_count && exam.groups_count > 1 ? `A–${String.fromCharCode(65 + exam.groups_count - 1)}` : 'A'})</span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.total_marks || 0} Marks</span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.duration_minutes || 60} min</span>
                      </div>

                      {exam.institution && (
                        <div className="text-[11px] text-stone-400 truncate">
                          Institution: {exam.institution}
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-100">
                      <button
                        onClick={() => onSelectExam(exam.id)}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs min-h-[38px] sm:min-h-[34px]"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>Open in Workspace</span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={(e) => handleExport(exam.id, 'docx', e)}
                          title="Export Word (DOCX)"
                          aria-label="Export Word (DOCX)"
                          className="p-2 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold cursor-pointer min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                        <button
                          onClick={(e) => handleExport(exam.id, 'pdf', e)}
                          title="Export PDF"
                          aria-label="Export PDF"
                          className="p-2 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-semibold cursor-pointer min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center"
                        >
                          <Download className="w-3.5 h-3.5 text-rose-600" />
                        </button>

                        {!isSeedExam && (
                          <button
                            onClick={() => setDeletingExamId(exam.id)}
                            title="Delete Examination"
                            aria-label="Delete Examination"
                            className="p-2 rounded-lg border border-stone-200 hover:bg-rose-50 hover:border-rose-200 text-stone-400 hover:text-rose-600 cursor-pointer transition-colors min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Delete Confirmation Modal / Inline warning */}
                    {deletingExamId === exam.id && (
                      <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                        <p className="text-xs text-rose-800 font-semibold">
                          Are you sure you want to delete this examination?
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteExam(exam.id)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                          >
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => setDeletingExamId(null)}
                            className="px-3 py-1.5 bg-white border border-stone-200 text-stone-700 text-xs font-semibold rounded-lg hover:bg-stone-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DOCUMENT LIBRARY */}
      {!loading && !errorMsg && activeTab === 'documents' && (
        <div className="space-y-4">
          {/* Document Upload & Search Bar */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200/90 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-stone-900">Curriculum Source Documents</h3>
                <p className="text-xs text-stone-500">
                  Authorized textbooks and course syllabus documents used as exam source material
                </p>
              </div>

              {/* Upload Button */}
              <div className="shrink-0 w-full md:w-auto">
                <label className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer min-h-[42px] md:min-h-[38px]">
                  <Upload className={`w-4 h-4 ${isUploadingDoc ? 'animate-bounce' : ''}`} />
                  <span>{isUploadingDoc ? 'Indexing Document...' : 'Upload Textbook (PDF / DOCX)'}</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleUploadFile}
                    disabled={isUploadingDoc}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            {/* Upload notifications */}
            {uploadSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}
            {uploadError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Document search */}
            <div className="relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search documents by filename..."
                className="w-full pl-9 pr-3 py-2.5 sm:py-2 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 focus:border-[#9D174D] min-h-[40px]"
              />
            </div>
          </div>

          {/* Document Cards */}
          {filteredDocs.length === 0 ? (
            <div className="bg-white p-8 sm:p-12 text-center rounded-2xl border border-stone-200/90 space-y-3">
              <FileText className="w-10 h-10 text-stone-300 mx-auto" />
              <h4 className="text-sm font-bold text-stone-800">No Documents Found</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                No educational documents found in library. Upload a PDF or DOCX file to begin.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDocs.map((doc) => {
                const isSeedDoc = doc.id === 'doc-cell-biology-101';
                const isPersianDoc = doc.detected_language === 'fa' || doc.is_rtl;

                return (
                  <div
                    key={doc.id}
                    className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 shadow-2xs hover:border-stone-400 transition-all flex flex-col justify-between gap-4 min-w-0"
                  >
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-stone-900 break-words leading-snug">
                            {doc.filename}
                          </h4>
                          <div className="text-[11px] text-stone-400 tabular-nums">
                            Indexed: {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Active'}
                          </div>
                        </div>

                        {isSeedDoc ? (
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium shrink-0">
                            Shared Tutorial Source
                          </span>
                        ) : (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-medium shrink-0">
                            User Library
                          </span>
                        )}
                      </div>

                      {/* Metadata properties */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-stone-500 pt-1 tabular-nums">
                        <span className="font-semibold text-stone-700">{doc.total_pages || 1} Pages</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.chunks_count || 0} Chunks</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytes(doc.file_size_bytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{isPersianDoc ? 'فارسی / دری (RTL)' : 'English (LTR)'}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-100">
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <button
                          onClick={() => onCreateNewExam(doc.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs min-h-[38px] sm:min-h-[34px]"
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          <span>Generate Questions</span>
                        </button>

                        <button
                          onClick={() => handleInspectDocChunks(doc)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer min-h-[38px] sm:min-h-[34px]"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span>Inspect Chunks</span>
                        </button>
                      </div>

                      {!isSeedDoc && (
                        <button
                          onClick={() => setDeletingDocId(doc.id)}
                          title="Delete Document"
                          aria-label="Delete Document"
                          className="p-2 rounded-lg border border-stone-200 hover:bg-rose-50 hover:border-rose-200 text-stone-400 hover:text-rose-600 cursor-pointer transition-colors min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Delete Confirmation */}
                    {deletingDocId === doc.id && (
                      <div className="mt-2 p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                        <p className="text-xs text-rose-800 font-semibold">
                          Delete this document? Questions already generated from it will be preserved.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                          >
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => setDeletingDocId(null)}
                            className="px-3 py-1.5 bg-white border border-stone-200 text-stone-700 text-xs font-semibold rounded-lg hover:bg-stone-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Chunk Inspection Drawer / Modal */}
          {selectedDocForChunks && (
            <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
              <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-stone-200 flex items-center justify-between gap-3 shrink-0">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-stone-900 truncate">
                      Chunks: {selectedDocForChunks.filename}
                    </h3>
                    <p className="text-[11px] text-stone-500 tabular-nums">
                      {selectedDocForChunks.chunks_count} sections indexed from document
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDocForChunks(null)}
                    aria-label="Close chunks modal"
                    className="p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-0">
                  {loadingChunks ? (
                    <div className="p-8 text-center text-stone-500 text-xs">Loading document sections...</div>
                  ) : docChunks.length === 0 ? (
                    <div className="p-8 text-center text-stone-500 text-xs">No chunk segments found.</div>
                  ) : (
                    docChunks.map((chunk, idx) => (
                      <div
                        key={chunk.id || idx}
                        className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 space-y-1.5 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-stone-600 tabular-nums">
                          <span>Page {chunk.page_number} {chunk.chapter ? `· ${chunk.chapter}` : ''}</span>
                          <span className="font-mono text-stone-400">~{chunk.token_count || 0} tokens</span>
                        </div>
                        <p
                          dir={selectedDocForChunks.is_rtl ? 'rtl' : 'ltr'}
                          className="text-stone-700 leading-relaxed line-clamp-4"
                        >
                          {chunk.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-3 border-t border-stone-200 bg-stone-50/50 flex justify-end shrink-0">
                  <button
                    onClick={() => setSelectedDocForChunks(null)}
                    className="w-full sm:w-auto px-4 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 text-xs font-semibold rounded-xl cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INSTITUTION & EXAM PREFERENCES */}
      {!loading && !errorMsg && activeTab === 'preferences' && (
        <div className="max-w-2xl bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-6 md:p-8 shadow-2xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-stone-900">Institution & Exam Preferences</h3>
            <p className="text-xs text-stone-500 leading-relaxed mt-1">
              Configure your institutional affiliation, department name, and default examination parameters. These details appear automatically on generated examination papers.
            </p>
          </div>

          {prefMessage && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                prefMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {prefMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{prefMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleSavePreferences} className="space-y-4">
            {/* Teacher Details */}
            <div className="space-y-3 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#9D174D]">
                Teacher Profile
              </h4>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">Full Name</label>
                <input
                  type="text"
                  value={prefFullName}
                  onChange={(e) => setPrefFullName(e.target.value)}
                  placeholder="e.g. Dr. Ahmad Rahimi"
                  className="w-full px-3 py-2.5 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 focus:border-[#9D174D] min-h-[40px]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">University / Institution</label>
                <input
                  type="text"
                  value={prefInstitution}
                  onChange={(e) => setPrefInstitution(e.target.value)}
                  placeholder="e.g. Herat University (پوهنتون هرات)"
                  className="w-full px-3 py-2.5 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 focus:border-[#9D174D] min-h-[40px]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-700 block">Faculty / Department</label>
                <input
                  type="text"
                  value={prefFaculty}
                  onChange={(e) => setPrefFaculty(e.target.value)}
                  placeholder="e.g. Faculty of Science, Department of Biology"
                  className="w-full px-3 py-2.5 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 focus:border-[#9D174D] min-h-[40px]"
                />
              </div>
            </div>

            {/* Default Exam Parameters */}
            <div className="space-y-3 pt-4 border-t border-stone-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#9D174D]">
                Default Examination Defaults
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">Default Duration (Minutes)</label>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    value={prefDuration}
                    onChange={(e) => setPrefDuration(parseInt(e.target.value, 10) || 60)}
                    className="w-full px-3 py-2.5 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 focus:border-[#9D174D] min-h-[40px] tabular-nums"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-stone-700 block">Default Group Count (1–10)</label>
                  <select
                    value={prefGroupsCount}
                    onChange={(e) => setPrefGroupsCount(parseInt(e.target.value, 10) || 3)}
                    className="w-full px-3 py-2.5 text-xs border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#9D174D]/20 focus:border-[#9D174D] cursor-pointer min-h-[40px] bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num}>
                        {num === 1 ? '1 Group (Group A)' : `${num} Groups (A–${String.fromCharCode(65 + num - 1)})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-2">
                <input
                  type="checkbox"
                  id="prefBloom"
                  checked={prefBloom}
                  onChange={(e) => setPrefBloom(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 text-[#9D174D] focus:ring-[#9D174D] cursor-pointer w-4 h-4"
                />
                <label htmlFor="prefBloom" className="text-xs text-stone-700 cursor-pointer leading-relaxed">
                  Enforce Bloom's Revised Taxonomy cognitive level balancing by default
                </label>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={prefSaving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50 min-h-[44px] sm:min-h-[40px]"
              >
                <Save className="w-4 h-4 shrink-0" />
                <span>{prefSaving ? 'Saving Changes...' : 'Save Preferences'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
