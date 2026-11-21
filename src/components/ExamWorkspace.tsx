import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle2,
  Sparkles,
  Layers,
  HelpCircle,
  Edit2,
  Trash2,
  Save,
  X,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Award,
  Globe,
  Shuffle,
  AlertTriangle,
  RotateCcw,
  Download,
  FileDown,
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
} from 'lucide-react';
import { AcademicPaperPreview } from './AcademicPaperPreview';
import { AiResistantReviewModal } from './AiResistantReviewModal';
import { authFetch } from '../utils/auth';

interface DocumentInfo {
  id: string;
  filename: string;
  file_type: string;
  total_pages: number;
  detected_language: string;
  is_rtl: boolean;
  chunks_count: number;
  status: string;
}

export interface Question {
  id: string;
  exam_id: string;
  group_id: string;
  question_order: number;
  question_type: string;
  question_text: string;
  options?: string[] | null;
  correct_answer: string;
  explanation?: string | null;
  marks: number;
  difficulty: string;
  bloom_level?: string | null;
  source_document_name: string;
  source_page: number;
  source_chapter?: string | null;
  source_section?: string | null;
  source_chunk_id?: string | null;
  source_evidence: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExamGroup {
  id: string;
  exam_id: string;
  group_name: string;
  group_order: number;
  questions_count: number;
  questions: Question[];
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  institution?: string | null;
  faculty?: string | null;
  teacher_name?: string;
  grade_level?: string;
  exam_date?: string;
  duration_minutes: number;
  total_marks: number;
  language: string;
  is_rtl: boolean;
  bloom_enabled: boolean;
  status: string;
  groups_count: number;
  questions_count: number;
  groups: ExamGroup[];
}

interface AnswerKeyItem {
  question_number: number;
  question_type: string;
  correct_answer: string;
  explanation?: string;
  marks: number;
  source_reference: string;
  source_page: number;
}

interface AnswerKeyGroup {
  id: string;
  exam_id: string;
  group_id: string;
  group_name: string;
  items: AnswerKeyItem[];
}

export interface ExamWorkspaceProps {
  isLlmConfigured: boolean;
  externalActiveExamId?: string | null;
  preselectedDocumentId?: string | null;
  currentUser?: { full_name?: string; institution?: string } | null;
  onOpenHistory?: () => void;
  onExamsUpdated?: (exams: Exam[]) => void;
  onBackToDashboard?: () => void;
}

export function ExamWorkspace({
  isLlmConfigured: _isLlmConfigured,
  externalActiveExamId,
  preselectedDocumentId,
  currentUser,
  onOpenHistory,
  onExamsUpdated,
  onBackToDashboard,
}: ExamWorkspaceProps) {
  // Step navigation: 1: Upload, 2: Configure & Generate, 3: Review & Groups
  const [step, setStep] = useState<number>(1);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentInfo | null>(null);
  const [selectedPages, setSelectedPages] = useState<string>('all');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Exam Configuration State (Supports 1-10 groups)
  const [title, setTitle] = useState<string>('Cell Biology Midterm Examination');
  const [subject, setSubject] = useState<string>('Molecular & Cellular Biology');
  const [institution, setInstitution] = useState<string>('');
  const [faculty, setFaculty] = useState<string>('');
  const [groupsCount, setGroupsCount] = useState<number>(3);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [mcqCount, setMcqCount] = useState<number>(2);
  const [tfCount, setTfCount] = useState<number>(1);
  const [fillBlankCount, setFillBlankCount] = useState<number>(0);
  const [shortCount, setShortCount] = useState<number>(1);
  const [essayCount, setEssayCount] = useState<number>(1);
  const [bloomEnabled, setBloomEnabled] = useState<boolean>(true);
  const [difficultyProfile, setDifficultyProfile] = useState<'balanced' | 'easy' | 'challenging'>('balanced');

  const totalQuestions = mcqCount + tfCount + fillBlankCount + shortCount + essayCount;

  const getGroupLabelText = (count: number) => {
    if (count <= 1) return '1 Group (Group A)';
    const endLetter = String.fromCharCode(65 + count - 1);
    return `${count} Groups (Group A–${endLetter})`;
  };

  // Generation state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number>(0);
  const [answerKeys, setAnswerKeys] = useState<AnswerKeyGroup[]>([]);
  const [viewMode, setViewMode] = useState<'questions' | 'answer_keys'>('questions');
  const [workspaceView, setWorkspaceView] = useState<'editor' | 'preview'>('editor');
  const activeExamIdRef = useRef<string | null>(null);
  const externalActiveExamIdRef = useRef<string | null | undefined>(externalActiveExamId);
  activeExamIdRef.current = activeExam?.id ?? null;
  externalActiveExamIdRef.current = externalActiveExamId;

  // Export engine state
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportTarget, setExportTarget] = useState<'both' | 'exam' | 'answer_key'>('both');
  const [exportScope, setExportScope] = useState<'current' | 'all'>('current');
  const [includeProvenance, setIncludeProvenance] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<'docx' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const extractApiErrorMessage = async (res: Response, fallback: string): Promise<string> => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errData = await res.json().catch(() => null);
      if (errData && typeof errData === 'object') {
        if (typeof errData.detail === 'string' && errData.detail.trim()) return errData.detail.trim();
        if (typeof errData.message === 'string' && errData.message.trim()) return errData.message.trim();
        if (typeof errData.error === 'string' && errData.error.trim()) return errData.error.trim();
      }
    } else {
      const text = await res.text().catch(() => '');
      const cleanText = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanText && cleanText.length < 180) {
        return `${fallback} (HTTP ${res.status}: ${cleanText})`;
      }
    }
    return `${fallback} (HTTP ${res.status})`;
  };

  const downloadExamExport = async (
    format: 'docx' | 'pdf',
    targetOverride?: 'both' | 'exam' | 'answer_key',
    scopeOverride?: 'current' | 'all',
    includeRefsOverride?: boolean
  ) => {
    if (!activeExam || isExporting) return;
    setIsExporting(format);
    setExportError(null);

    const effectiveTarget = targetOverride ?? exportTarget;
    const effectiveScope = scopeOverride ?? exportScope;
    const effectiveIncludeRefs = includeRefsOverride ?? includeProvenance;

    const selectedGroup = activeExam.groups[activeGroupIndex] || activeExam.groups[0];
    const currentGroupId = effectiveScope === 'all' ? '' : (selectedGroup?.id || '');
    const params = new URLSearchParams({
      target: effectiveTarget,
      include_references: String(effectiveIncludeRefs),
    });
    if (currentGroupId) {
      params.set('group_id', currentGroupId);
    }

    const url = `/api/exams/${encodeURIComponent(activeExam.id)}/export/${format}?${params.toString()}`;

    try {
      const res = await authFetch(url);
      if (!res.ok) {
        const msg = await extractApiErrorMessage(res, `Failed to export ${format.toUpperCase()}`);
        throw new Error(msg);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i);
      const downloadName = filenameMatch?.[1]?.trim() || `Exam_${activeExam.id}.${format}`;

      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      console.error(`Export ${format} error:`, err);
      setExportError(err?.message || `Failed to export ${format.toUpperCase()} document.`);
    } finally {
      setIsExporting(null);
    }
  };

  const handleExport = (format: 'docx' | 'pdf') => {
    void downloadExamExport(format);
  };

  // Question editing state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [editMarks, setEditMarks] = useState<number>(1);
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState<string>('');
  const [editExplanation, setEditExplanation] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Question delete confirmation state
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Question reordering state
  const [reorderingQuestionId, setReorderingQuestionId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  // Question regeneration state
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<string | null>(null);
  const [promptRegenerateQuestionId, setPromptRegenerateQuestionId] = useState<string | null>(null);
  const [regenerateInstructions, setRegenerateInstructions] = useState<string>('');
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  // AI-Resistant Questions Generation & Review State
  const [showAiResistantModal, setShowAiResistantModal] = useState<boolean>(false);
  const [isGeneratingAiResistant, setIsGeneratingAiResistant] = useState<boolean>(false);
  const [isApplyingAiResistant, setIsApplyingAiResistant] = useState<boolean>(false);
  const [aiResistantDraft, setAiResistantDraft] = useState<any | null>(null);
  const [aiResistantSuccessMessage, setAiResistantSuccessMessage] = useState<string | null>(null);
  const [aiResistantError, setAiResistantError] = useState<string | null>(null);

  const handleGenerateAiResistant = async () => {
    if (!activeExam) return;
    if (activeExam.id === 'exam-cell-bio-midterm') {
      setAiResistantError(
        activeExam.is_rtl
          ? 'آزمون پیش‌فرض زیست‌شناسی صرفاً جنبه آموزشی داشته و قابل تغییر نیست. لطفاً از طریق اسناد آپلودشده خود آزمون جدید ایجاد فرمایید.'
          : 'Default seed examination is read-only. Please create an examination from your uploaded documents to generate AI-resistant questions.'
      );
      setTimeout(() => setAiResistantError(null), 6000);
      return;
    }

    setIsGeneratingAiResistant(true);
    setAiResistantError(null);
    try {
      const res = await authFetch(`/api/exams/${activeExam.id}/generate-ai-resistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to generate AI-resistant draft questions.');
      }
      const data = await res.json();
      setAiResistantDraft(data);
      setShowAiResistantModal(true);
    } catch (err: any) {
      setAiResistantError(err.message || 'Error generating AI-resistant draft.');
      setTimeout(() => setAiResistantError(null), 6000);
    } finally {
      setIsGeneratingAiResistant(false);
    }
  };

  const handleApplyAiResistant = async (draftGroups: any[]) => {
    if (!activeExam) return;
    setIsApplyingAiResistant(true);
    setAiResistantError(null);
    try {
      const res = await authFetch(`/api/exams/${activeExam.id}/apply-ai-resistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_groups: draftGroups }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to apply AI-resistant questions.');
      }
      const result = await res.json();
      setActiveExam(result.exam);
      if (result.answer_keys) {
        setAnswerKeys(result.answer_keys);
      }
      setShowAiResistantModal(false);
      setAiResistantSuccessMessage(
        activeExam.is_rtl
          ? 'سوالات تحلیلی و مستند (مقاوم در برابر هوش مصنوعی) با موفقیت در تمام گروه‌ها اعمال شدند.'
          : 'AI-Resistant analytical questions successfully applied across all exam variants.'
      );
      setTimeout(() => setAiResistantSuccessMessage(null), 6000);

      if (onExamsUpdated) {
        authFetch('/api/exams')
          .then((r) => r.json())
          .then((list) => {
            if (Array.isArray(list)) onExamsUpdated(list);
          })
          .catch(() => {});
      }
    } catch (err: any) {
      setAiResistantError(err.message || 'Error applying AI-resistant questions.');
    } finally {
      setIsApplyingAiResistant(false);
    }
  };

  const loadExamById = async (examId: string) => {
    try {
      const res = await authFetch(`/api/exams/${examId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveExam(data);
        setActiveGroupIndex(0);
        setWorkspaceView('editor');
        setStep(3);
        loadAnswerKeys(data.id);
      }
    } catch (e) {
      console.error('Failed to load exam by id:', e);
    }
  };

  // Hydrate default exam parameters from teacher preferences
  useEffect(() => {
    if (currentUser?.institution) {
      setInstitution((prev) => prev || currentUser.institution || '');
    }
    try {
      const savedPrefs = localStorage.getItem('examcraft_teacher_preferences');
      if (savedPrefs) {
        const p = JSON.parse(savedPrefs);
        if (p.faculty) setFaculty((prev) => prev || p.faculty);
        if (typeof p.duration === 'number' && p.duration >= 15) setDurationMinutes(p.duration);
        if (typeof p.groupsCount === 'number' && p.groupsCount >= 1 && p.groupsCount <= 10) setGroupsCount(p.groupsCount);
        if (p.bloom !== undefined) setBloomEnabled(Boolean(p.bloom));
      }
    } catch {
      // ignore invalid JSON
    }
  }, [currentUser?.institution]);

  const applyDefaultTitleForDoc = (doc: DocumentInfo) => {
    const cleanDocTitle = doc.filename.replace(/\.[^/.]+$/, '');
    if (doc.id === 'doc-cell-biology-101') {
      setTitle('Cell Biology Midterm Examination');
      setSubject('Molecular & Cellular Biology');
    } else if (doc.is_rtl || doc.detected_language === 'fa' || doc.detected_language === 'ps') {
      setTitle(doc.detected_language === 'ps' ? `د ${cleanDocTitle} ازموینه` : `آزمون ${cleanDocTitle}`);
      setSubject(cleanDocTitle.includes('دموکراسی') ? 'علوم سیاسی و مبانی مردم‌سالاری' : 'محتوای آموزشی و تخصصی');
    } else {
      setTitle(`${cleanDocTitle} Examination`);
      setSubject('General Educational Subject');
    }
  };

  // React to preselected document from Teacher Dashboard
  useEffect(() => {
    if (preselectedDocumentId && documents.length > 0) {
      const target = documents.find((d) => d.id === preselectedDocumentId);
      if (target) {
        setSelectedDoc(target);
        applyDefaultTitleForDoc(target);
        setStep(2);
      }
    }
  }, [preselectedDocumentId, documents]);

  // React to external active exam changes
  useEffect(() => {
    if (externalActiveExamId) {
      loadExamById(externalActiveExamId);
    } else if (externalActiveExamId === null && !preselectedDocumentId) {
      setActiveExam(null);
      setStep(1);
    }
  }, [externalActiveExamId, preselectedDocumentId]);

  // Load existing documents & exams on mount and listen to auth changes
  useEffect(() => {
    fetchDocuments();
    fetchExams();

    const handleAuthChange = () => {
      fetchDocuments();
      fetchExams();
    };

    window.addEventListener('examcraft_auth_changed', handleAuthChange);
    window.addEventListener('examcraft_auth_expired', handleAuthChange);
    return () => {
      window.removeEventListener('examcraft_auth_changed', handleAuthChange);
      window.removeEventListener('examcraft_auth_expired', handleAuthChange);
    };
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await authFetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        if (data.length > 0 && !selectedDoc) {
          setSelectedDoc(data[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load documents:', e);
    }
  };

  const fetchExams = async () => {
    try {
      const res = await authFetch('/api/exams');
      if (res.ok) {
        const data: Exam[] = await res.json();
        if (onExamsUpdated) {
          onExamsUpdated(data);
        }
        const currentActiveId = activeExamIdRef.current;
        if (currentActiveId && !externalActiveExamIdRef.current) {
          const matchingExam = data.find((e) => e.id === currentActiveId);
          if (matchingExam) {
            setActiveExam(matchingExam);
            setActiveGroupIndex((prevIdx) =>
              matchingExam.groups.length > 0 ? Math.min(prevIdx, matchingExam.groups.length - 1) : 0
            );
            loadAnswerKeys(matchingExam.id);
          } else if (data.length > 0) {
            setActiveExam(data[0]);
            setActiveGroupIndex(0);
            loadAnswerKeys(data[0].id);
          } else {
            setActiveExam(null);
            setActiveGroupIndex(0);
            setStep(1);
          }
        } else if (data.length > 0 && !currentActiveId && !externalActiveExamIdRef.current) {
          setActiveExam(data[0]);
          setActiveGroupIndex(0);
          loadAnswerKeys(data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load exams:', e);
    }
  };

  const loadAnswerKeys = async (examId: string) => {
    try {
      const res = await authFetch(`/api/exams/${examId}/answer-key`);
      if (res.ok) {
        const data = await res.json();
        setAnswerKeys(data);
      }
    } catch (e) {
      console.error('Failed to load answer keys:', e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', 'teacher_session');

    try {
      const res = await authFetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }

      const newDoc = await res.json();
      setDocuments((prev) => [newDoc, ...prev]);
      setSelectedDoc(newDoc);
      const cleanDocTitle = newDoc.filename.replace(/\.[^/.]+$/, '');
      if (newDoc.is_rtl || newDoc.detected_language === 'fa') {
        setTitle(`آزمون ${cleanDocTitle}`);
        setSubject(cleanDocTitle.includes('دموکراسی') ? 'علوم سیاسی و مبانی مردم‌سالاری' : 'محتوای آموزشی و تخصصی');
      } else {
        setTitle(`${cleanDocTitle} Examination`);
        setSubject('General Educational Subject');
      }
      setStep(2);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateExam = async () => {
    if (!selectedDoc) {
      setGenerationError('Please select or upload a document first.');
      return;
    }

    if (totalQuestions <= 0) {
      setGenerationError('Please specify at least 1 question across the question types.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);

    let parsedPages: number[] | null = null;
    if (selectedPages !== 'all') {
      parsedPages = selectedPages
        .split(',')
        .map((p) => parseInt(p.trim(), 10))
        .filter((p) => !isNaN(p));
    }

    const diffMap: Record<string, Record<string, number>> = {
      balanced: { easy: 40, medium: 40, hard: 20 },
      easy: { easy: 70, medium: 25, hard: 5 },
      challenging: { easy: 15, medium: 45, hard: 40 },
    };

    const payload = {
      document_id: selectedDoc.id,
      selected_pages: parsedPages,
      title: title || 'Examination',
      subject: subject || 'General Subject',
      institution: institution.trim() || undefined,
      faculty: faculty.trim() || undefined,
      teacher_name: currentUser?.full_name || 'Instructor',
      grade_level: 'Undergraduate',
      duration_minutes: Math.max(10, Math.min(300, durationMinutes || 60)),
      total_marks: 100.0,
      language: selectedDoc.detected_language || 'en',
      is_rtl: selectedDoc.is_rtl,
      bloom_enabled: bloomEnabled,
      groups_count: Math.min(10, Math.max(1, groupsCount)),
      difficulty_distribution: diffMap[difficultyProfile] || diffMap.balanced,
      question_types_config: {
        mcq: Math.max(0, mcqCount),
        true_false: Math.max(0, tfCount),
        fill_blank: Math.max(0, fillBlankCount),
        short_answer: Math.max(0, shortCount),
        essay: Math.max(0, essayCount),
      },
    };

    try {
      const res = await authFetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Generation failed');
      }

      const examData: Exam = await res.json();
      setActiveExam(examData);
      setActiveGroupIndex(0);
      setStep(3);
      loadAnswerKeys(examData.id);
      fetchExams();
    } catch (err: any) {
      setGenerationError(err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const normalizeCorrectAnswer = (correct: string, options?: string[] | null) => {
    if (!options || options.length === 0) return correct;
    const exact = options.find((opt) => opt === correct);
    if (exact) return exact;
    const letters = ['A', 'B', 'C', 'D', 'E'];
    for (let idx = 0; idx < options.length; idx++) {
      const l = letters[idx];
      if (correct.trim() === l || correct.startsWith(`${l})`) || correct.startsWith(`${l}.`)) {
        return options[idx];
      }
    }
    const sub = options.find((opt) => correct.includes(opt) || opt.includes(correct));
    if (sub) return sub;
    return options[0] || correct;
  };

  const handleStartEdit = (q: Question) => {
    setEditingQuestionId(q.id);
    setEditText(
      (q.question_text || '')
        .replace(/^(Regenerated:\s*|Focused Concept\s*\([^)]*\):\s*)+/i, '')
        .trim()
    );
    setEditMarks(q.marks);

    let initialOptions: string[] = [];
    if ((q.question_type || '').toLowerCase() === 'mcq') {
      const cleanOpts = (q.options || [])
        .map((o) => String(o).trim())
        .filter((o) => o.length > 0 && !/^New Option\b/i.test(o) && !/^گزینه جدید/i.test(o));

      if (cleanOpts.length === 4) {
        initialOptions = cleanOpts;
      } else {
        initialOptions = cleanOpts.slice(0, 4);
        const defaultLetters = activeExam?.is_rtl ? ['الف', 'ب', 'ج', 'د'] : ['A', 'B', 'C', 'D'];
        while (initialOptions.length < 4) {
          const l = defaultLetters[initialOptions.length];
          initialOptions.push(activeExam?.is_rtl ? `گزینه ${l}` : `Choice ${l}`);
        }
      }
    }

    setEditOptions(initialOptions);
    setEditCorrectAnswer(normalizeCorrectAnswer(q.correct_answer || '', initialOptions));
    setEditExplanation(
      (q.explanation || '')
        .replace(/^(Regenerated:\s*|Focused Concept\s*\([^)]*\):\s*)+/i, '')
        .trim()
    );
    setEditError(null);
  };

  const handleSaveEdit = async (questionId: string) => {
    if (!activeExam) return;
    setIsSavingEdit(true);
    setEditError(null);

    const currentGroup = activeExam.groups[activeGroupIndex];
    const currentQ = currentGroup?.questions.find((q) => q.id === questionId);
    const isMcq = (currentQ?.question_type || '').toLowerCase() === 'mcq' || (editOptions && editOptions.length > 0);

    const sanitizedText = editText
      .replace(/^(Regenerated:\s*|Focused Concept\s*\([^)]*\):\s*)+/i, '')
      .trim();

    if (!sanitizedText) {
      setEditError('Question text cannot be empty.');
      setIsSavingEdit(false);
      return;
    }

    if (isMcq) {
      if (!editOptions || editOptions.length !== 4) {
        setEditError('Multiple-choice questions must contain exactly 4 choices (A, B, C, D).');
        setIsSavingEdit(false);
        return;
      }

      const trimmedOpts = editOptions.map((o) => o.trim());
      for (let i = 0; i < trimmedOpts.length; i++) {
        if (!trimmedOpts[i]) {
          setEditError(`Choice ${i + 1} cannot be empty.`);
          setIsSavingEdit(false);
          return;
        }
        if (/^New Option\b/i.test(trimmedOpts[i]) || /^گزینه جدید/i.test(trimmedOpts[i])) {
          setEditError(`Please provide authentic text for Choice ${i + 1} rather than a placeholder.`);
          setIsSavingEdit(false);
          return;
        }
      }

      const distinct = new Set(trimmedOpts.map((o) => o.toLowerCase()));
      if (distinct.size !== 4) {
        setEditError('All 4 multiple-choice options must be unique.');
        setIsSavingEdit(false);
        return;
      }

      if (!trimmedOpts.includes(editCorrectAnswer.trim())) {
        setEditError('Please select one of the 4 choices as the correct answer.');
        setIsSavingEdit(false);
        return;
      }
    }

    try {
      const payload: any = {
        question_text: sanitizedText,
        marks: editMarks,
        explanation: editExplanation,
      };

      if (isMcq && editOptions && editOptions.length === 4) {
        payload.options = editOptions.map((o) => o.trim());
        payload.correct_answer = editCorrectAnswer.trim();
      } else {
        const trimmedNonMcqAns = editCorrectAnswer.trim();
        if (!trimmedNonMcqAns) {
          setEditError('Correct answer cannot be blank.');
          setIsSavingEdit(false);
          return;
        }
        payload.correct_answer = trimmedNonMcqAns;
      }

      const res = await authFetch(`/api/exams/${encodeURIComponent(activeExam.id)}/questions/${encodeURIComponent(questionId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updatedQ: Question = await res.json();
        // Fetch fresh exam state to guarantee synchronization across all groups and variants
        const examRes = await authFetch(`/api/exams/${encodeURIComponent(activeExam.id)}`);
        if (examRes.ok) {
          const freshExam = await examRes.json();
          setActiveExam(freshExam);
        } else {
          setActiveExam((prev) => {
            if (!prev) return prev;
            const newGroups = prev.groups.map((g) => {
              const hasQ = g.questions.some((q) => q.id === questionId);
              if (hasQ) {
                return {
                  ...g,
                  questions: g.questions.map((q) => (q.id === questionId ? updatedQ : q)),
                };
              }
              return g;
            });
            const activeGroup = newGroups[activeGroupIndex] || newGroups[0];
            const newTotal = activeGroup?.questions.reduce((sum, q) => sum + (q.marks || 0), 0) || prev.total_marks;
            return { ...prev, groups: newGroups, total_marks: newTotal };
          });
        }
        setEditingQuestionId(null);
        setEditError(null);
        await loadAnswerKeys(activeExam.id);
        fetchExams();
      } else {
        const msg = await extractApiErrorMessage(res, 'Failed to save question edits');
        throw new Error(msg);
      }
    } catch (e: any) {
      console.error('Failed to update question:', e);
      setEditError(e.message || 'Failed to update question');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!activeExam || !deletingQuestion) return;
    setIsDeletingQuestion(true);
    setDeleteError(null);

    try {
      const res = await authFetch(
        `/api/exams/${encodeURIComponent(activeExam.id)}/questions/${encodeURIComponent(deletingQuestion.id)}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        const data = await res.json();
        // Fetch fresh exam state from server to ensure perfect synchronization
        const examRes = await authFetch(`/api/exams/${encodeURIComponent(activeExam.id)}`);
        if (examRes.ok) {
          const freshExam = await examRes.json();
          setActiveExam(freshExam);
        } else {
          // Fallback optimistic update targeting the deleted question's group only
          setActiveExam((prev) => {
            if (!prev) return prev;
            const targetGroupId = deletingQuestion.group_id || prev.groups[activeGroupIndex]?.id;
            const updatedGroups = prev.groups.map((g) => {
              if (g.id === targetGroupId) {
                const filtered = g.questions.filter((q) => q.id !== deletingQuestion.id);
                const resequenced = filtered.map((q, idx) => ({ ...q, question_order: idx + 1 }));
                return {
                  ...g,
                  questions: resequenced,
                  questions_count: resequenced.length,
                };
              }
              return g;
            });
            const newTotalCount = updatedGroups.reduce((acc, g) => acc + g.questions.length, 0);
            return {
              ...prev,
              groups: updatedGroups,
              questions_count: newTotalCount,
              total_marks: data.new_total_marks ?? prev.total_marks,
            };
          });
        }
        await loadAnswerKeys(activeExam.id);
        setDeletingQuestion(null);
        fetchExams();
      } else {
        const msg = await extractApiErrorMessage(res, 'Failed to delete question from exam.');
        throw new Error(msg);
      }
    } catch (err: any) {
      console.error('Delete question error:', err);
      setDeleteError(err.message || 'Failed to delete question');
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleMoveQuestion = async (currentIndex: number, direction: 'up' | 'down') => {
    if (!activeExam) return;
    const currentGroup = activeExam.groups[activeGroupIndex];
    if (!currentGroup) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentGroup.questions.length) return;

    const targetQ = currentGroup.questions[currentIndex];
    setReorderingQuestionId(targetQ.id);
    setReorderError(null);

    const questionsCopy = [...currentGroup.questions];
    const [moved] = questionsCopy.splice(currentIndex, 1);
    questionsCopy.splice(targetIndex, 0, moved);

    const newQuestionIds = questionsCopy.map((q) => q.id);

    try {
      const res = await authFetch(
        `/api/exams/${encodeURIComponent(activeExam.id)}/groups/${encodeURIComponent(currentGroup.id)}/reorder`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question_ids: newQuestionIds }),
        }
      );

      if (res.ok) {
        const reorderedQuestions: Question[] = await res.json();
        setActiveExam((prev) => {
          if (!prev) return prev;
          const updatedGroups = prev.groups.map((g, idx) => {
            if (idx === activeGroupIndex) {
              return {
                ...g,
                questions: reorderedQuestions,
              };
            }
            return g;
          });
          return {
            ...prev,
            groups: updatedGroups,
          };
        });
        await loadAnswerKeys(activeExam.id);
        fetchExams();
      } else {
        const msg = await extractApiErrorMessage(res, 'Failed to update question order on server.');
        throw new Error(msg);
      }
    } catch (err: any) {
      console.error('Reorder question error:', err);
      setReorderError(err.message || 'Failed to reorder question');
    } finally {
      setReorderingQuestionId(null);
    }
  };

  const handleRegenerateQuestion = async (questionId: string) => {
    if (!activeExam) return;
    setRegeneratingQuestionId(questionId);
    setRegenerateError(null);

    try {
      const payload: { instructions?: string } = {};
      if (regenerateInstructions.trim()) {
        payload.instructions = regenerateInstructions.trim();
      }

      const res = await authFetch(
        `/api/exams/${encodeURIComponent(activeExam.id)}/questions/${encodeURIComponent(questionId)}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        const updatedQ: Question = await res.json();
        // Fetch fresh exam state from server to guarantee exact database synchronization
        const examRes = await authFetch(`/api/exams/${encodeURIComponent(activeExam.id)}`);
        if (examRes.ok) {
          const freshExam = await examRes.json();
          setActiveExam(freshExam);
        } else {
          setActiveExam((prev) => {
            if (!prev) return prev;
            const updatedGroups = prev.groups.map((g) => ({
              ...g,
              questions: g.questions.map((q) => {
                if (q.id === questionId) {
                  return updatedQ;
                }
                return q;
              }),
            }));
            return {
              ...prev,
              groups: updatedGroups,
            };
          });
        }
        setPromptRegenerateQuestionId(null);
        setRegenerateInstructions('');
        await loadAnswerKeys(activeExam.id);
        fetchExams();
      } else {
        const msg = await extractApiErrorMessage(res, 'Failed to regenerate question from source evidence.');
        throw new Error(msg);
      }
    } catch (err: any) {
      console.error('Regenerate question error:', err);
      setRegenerateError(err.message || 'Failed to regenerate question');
    } finally {
      setRegeneratingQuestionId(null);
    }
  };

  const currentGroup = activeExam?.groups?.[activeGroupIndex] || null;

  return (
    <div className="space-y-6">
      {/* Workflow Navigation Rail */}
      <div className="no-print bg-white/95 p-1.5 sm:p-2 rounded-2xl border border-stone-200/85 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {onBackToDashboard && (
            <>
              <button
                onClick={onBackToDashboard}
                className="px-3 py-2 rounded-xl text-xs font-bold text-[#9D174D] bg-pink-50/90 hover:bg-pink-100 border border-pink-200/80 flex items-center gap-1.5 transition-all cursor-pointer shrink-0 min-h-[40px] sm:min-h-[38px]"
                title="Return to Teacher Dashboard"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                <span>Dashboard</span>
              </button>
              <div className="h-5 w-px bg-stone-200 hidden sm:block shrink-0" />
            </>
          )}

          <div className="flex flex-1 flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 min-w-0">
            <button
              onClick={() => setStep(1)}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center sm:justify-start gap-2 transition-all cursor-pointer min-h-[40px] sm:min-h-[38px] whitespace-nowrap ${
                step === 1
                  ? 'bg-[#9D174D] text-white shadow-xs'
                  : 'bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200/70'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 tabular-nums ${
                  step === 1
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-stone-600 border border-stone-200'
                }`}
              >
                1
              </span>
              <span className="hidden md:inline">Upload & Select Document</span>
              <span className="md:hidden">Document</span>
            </button>

            <ArrowRight className="w-3.5 h-3.5 text-stone-300 hidden md:block shrink-0" />

            <button
              onClick={() => setStep(2)}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center sm:justify-start gap-2 transition-all cursor-pointer min-h-[40px] sm:min-h-[38px] whitespace-nowrap ${
                step === 2
                  ? 'bg-[#9D174D] text-white shadow-xs'
                  : 'bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200/70'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 tabular-nums ${
                  step === 2
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-stone-600 border border-stone-200'
                }`}
              >
                2
              </span>
              <span className="hidden md:inline">Exam Configuration</span>
              <span className="md:hidden">Configure</span>
            </button>

            <ArrowRight className="w-3.5 h-3.5 text-stone-300 hidden md:block shrink-0" />

            <button
              onClick={() => activeExam && setStep(3)}
              disabled={!activeExam}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center sm:justify-start gap-2 transition-all min-h-[40px] sm:min-h-[38px] whitespace-nowrap ${
                step === 3
                  ? 'bg-[#9D174D] text-white shadow-xs cursor-pointer'
                  : activeExam
                  ? 'bg-stone-50 text-stone-700 hover:bg-stone-100 border border-stone-200/70 cursor-pointer'
                  : 'bg-stone-50/60 text-stone-300 border border-stone-100 cursor-not-allowed'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 tabular-nums ${
                  step === 3
                    ? 'bg-white/20 text-white'
                    : activeExam
                    ? 'bg-white text-stone-600 border border-stone-200'
                    : 'bg-stone-100 text-stone-300'
                }`}
              >
                3
              </span>
              <span className="hidden md:inline">Review Groups & Answer Keys</span>
              <span className="md:hidden">Review</span>
            </button>
          </div>
        </div>
      </div>

      {/* STEP 1: Upload & Select Document */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="bg-white p-5 sm:p-7 rounded-2xl border border-stone-200/90 shadow-xs space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-stone-900 tracking-tight flex items-center gap-2">
                <Upload className="w-4 h-4 text-[#9D174D] shrink-0" />
                <span>Upload Educational Reference Document (PDF or DOCX)</span>
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                ExamCraft AI strictly derives all examination questions directly from your uploaded
                curriculum or syllabus materials.
              </p>
            </div>

            <div className="border-2 border-dashed border-stone-200 hover:border-[#9D174D]/50 rounded-2xl p-6 sm:p-10 text-center transition-all bg-stone-50/50 hover:bg-pink-50/20">
              <input
                type="file"
                id="doc-upload-input"
                accept=".pdf,.docx,.txt"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
              <label
                htmlFor="doc-upload-input"
                className="cursor-pointer flex flex-col items-center justify-center gap-2.5"
              >
                <div className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-100 text-[#9D174D] flex items-center justify-center mb-0.5">
                  <Upload className="w-5 h-5" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-stone-800">
                  {isUploading ? 'Parsing & Indexing Document...' : 'Click to Upload PDF or DOCX'}
                </span>
                <span className="text-[11px] text-stone-500">
                  Supports English, Dari, Pashto, Arabic, and multilingual materials
                </span>
              </label>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* List of Loaded Documents */}
          {documents.length > 0 && (
            <div className="bg-white p-5 sm:p-7 rounded-2xl border border-stone-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider tabular-nums">
                  Available Source Documents ({documents.length})
                </h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {documents.map((doc) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        setSelectedDoc(doc);
                        const cleanDocTitle = doc.filename.replace(/\.[^/.]+$/, '');
                        if (doc.id === 'doc-cell-biology-101') {
                          setTitle('Cell Biology Midterm Examination');
                          setSubject('Molecular & Cellular Biology');
                        } else if (doc.is_rtl || doc.detected_language === 'fa') {
                          setTitle(`آزمون ${cleanDocTitle}`);
                          setSubject(cleanDocTitle.includes('دموکراسی') ? 'علوم سیاسی و مبانی مردم‌سالاری' : 'محتوای آموزشی و تخصصی');
                        } else {
                          setTitle(`${cleanDocTitle} Examination`);
                          setSubject('General Educational Subject');
                        }
                      }}
                      className={`p-4 rounded-xl border text-left cursor-pointer transition-all min-w-0 ${
                        isSelected
                          ? 'border-[#9D174D] bg-pink-50/35 ring-2 ring-[#9D174D]/15'
                          : 'border-stone-200 hover:border-stone-300 bg-white hover:bg-stone-50/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText
                            className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#9D174D]' : 'text-stone-400'}`}
                          />
                          <span className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                            {doc.filename}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-md bg-[#9D174D] text-white text-[10px] font-bold shrink-0">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2.5 text-[11px] text-stone-500 tabular-nums">
                        <span>{doc.total_pages} Pages</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.chunks_count} Chunks</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 font-mono uppercase text-[10px] text-stone-600">
                          <Globe className="w-3 h-3 text-stone-400" />
                          {doc.detected_language}
                          {doc.is_rtl ? ' (RTL)' : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedDoc && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setStep(2)}
                    className="w-full sm:w-auto px-5 py-2.5 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[44px] sm:min-h-[40px]"
                  >
                    <span>Proceed to Exam Configuration</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Configure & Generate */}
      {step === 2 && (
        <div className="bg-white p-5 sm:p-7 md:p-8 rounded-2xl border border-stone-200/90 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-stone-100 pb-4">
            <div className="min-w-0 space-y-0.5">
              <h3 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                Examination Specification & Psychometrics
              </h3>
              <p className="text-xs text-stone-500 truncate">
                Derived exclusively from: <span className="font-semibold text-stone-800">{selectedDoc?.filename}</span>
              </p>
            </div>
            {selectedDoc?.is_rtl && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold inline-flex items-center gap-1 self-start sm:self-center shrink-0">
                <Globe className="w-3 h-3" /> Right-to-Left (RTL) Active
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">Exam Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Institution / School / University <span className="text-stone-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Kabul University or High School Name"
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Faculty / Department <span className="text-stone-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={faculty}
                  onChange={(e) => setFaculty(e.target.value)}
                  placeholder="e.g. Faculty of Law or Department of Computer Science"
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[40px]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Source Page Range
                </label>
                <input
                  type="text"
                  value={selectedPages}
                  onChange={(e) => setSelectedPages(e.target.value)}
                  placeholder="e.g. all or 1,2"
                  className="w-full px-3.5 py-2.5 sm:py-2 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[40px]"
                />
                <span className="text-[11px] text-stone-400 mt-1 block">
                  Leave 'all' to use all pages, or specify comma-separated page numbers.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Math.max(10, Math.min(300, parseInt(e.target.value, 10) || 60)))}
                    className="w-full px-3.5 py-2.5 sm:py-2 border border-stone-200 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[40px] tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Difficulty Profile
                  </label>
                  <select
                    value={difficultyProfile}
                    onChange={(e) => setDifficultyProfile(e.target.value as 'balanced' | 'easy' | 'challenging')}
                    className="w-full px-3.5 py-2.5 sm:py-2 border border-stone-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none cursor-pointer min-h-[40px]"
                  >
                    <option value="balanced">Balanced (40% Easy / 40% Med / 20% Hard)</option>
                    <option value="easy">Foundational (70% Easy / 25% Med / 5% Hard)</option>
                    <option value="challenging">Advanced (15% Easy / 45% Med / 40% Hard)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 space-y-5">
              {/* Dynamic Groups (1-10 Groups) */}
              <div className="p-4 sm:p-5 bg-pink-50/45 rounded-xl border border-pink-200/70 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#9D174D] flex items-center gap-1.5">
                    <Shuffle className="w-3.5 h-3.5 shrink-0" />
                    <span>Anti-Cheating Examination Groups (1–10)</span>
                  </label>
                  <span className="text-xs font-bold text-[#9D174D] bg-white border border-pink-200 px-2.5 py-0.5 rounded-lg font-mono tabular-nums">
                    {getGroupLabelText(groupsCount)}
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed">
                  Generates distinct, source-grounded parallel exam variants ({getGroupLabelText(groupsCount)}) from
                  unique curriculum evidence across the document, ensuring genuine anti-cheating separation while
                  maintaining consistent question types, difficulty, and grading rubrics.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={groupsCount}
                    onChange={(e) => setGroupsCount(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="w-full accent-[#9D174D] cursor-pointer"
                  />
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={groupsCount}
                    onChange={(e) => setGroupsCount(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    className="w-14 px-2 py-1.5 text-center text-xs font-bold border border-pink-200 rounded-lg bg-white outline-none focus:ring-1 focus:ring-[#9D174D] tabular-nums min-h-[38px]"
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-stone-500 tabular-nums">
                  <span>1 (A)</span>
                  <span>3 (A–C)</span>
                  <span>6 (A–F)</span>
                  <span>10 (A–J)</span>
                </div>
              </div>

              {/* Exact Question Quotas per Group */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-stone-800">
                    Exact Question Quotas (Per Group)
                  </label>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-lg tabular-nums ${totalQuestions > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    Total: {totalQuestions} {totalQuestions === 1 ? 'Question' : 'Questions'}
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  Select and enter exact quantities for each question type you need. Set unneeded types to 0.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  <div className="p-3 border border-stone-200 rounded-xl text-center bg-stone-50/50 space-y-1">
                    <span className="text-[11px] font-semibold text-stone-800 block">MCQ (4 Options)</span>
                    <span className="text-[10px] text-stone-400 block">2 marks each</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={mcqCount}
                      onChange={(e) => setMcqCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center text-sm font-bold border border-stone-300 rounded-lg py-1.5 px-1 bg-white focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[44px] tabular-nums"
                    />
                  </div>
                  <div className="p-3 border border-stone-200 rounded-xl text-center bg-stone-50/50 space-y-1">
                    <span className="text-[11px] font-semibold text-stone-800 block">True / False</span>
                    <span className="text-[10px] text-stone-400 block">1 mark each</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={tfCount}
                      onChange={(e) => setTfCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center text-sm font-bold border border-stone-300 rounded-lg py-1.5 px-1 bg-white focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[44px] tabular-nums"
                    />
                  </div>
                  <div className="p-3 border border-stone-200 rounded-xl text-center bg-stone-50/50 space-y-1">
                    <span className="text-[11px] font-semibold text-stone-800 block">Fill in the Blank</span>
                    <span className="text-[10px] text-stone-400 block">2 marks each</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={fillBlankCount}
                      onChange={(e) => setFillBlankCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center text-sm font-bold border border-stone-300 rounded-lg py-1.5 px-1 bg-white focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[44px] tabular-nums"
                    />
                  </div>
                  <div className="p-3 border border-stone-200 rounded-xl text-center bg-stone-50/50 space-y-1">
                    <span className="text-[11px] font-semibold text-stone-800 block">Short Answer</span>
                    <span className="text-[10px] text-stone-400 block">3 marks each</span>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={shortCount}
                      onChange={(e) => setShortCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center text-sm font-bold border border-stone-300 rounded-lg py-1.5 px-1 bg-white focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[44px] tabular-nums"
                    />
                  </div>
                  <div className="p-3 border border-stone-200 rounded-xl text-center bg-stone-50/50 space-y-1 col-span-2 sm:col-span-1">
                    <span className="text-[11px] font-semibold text-stone-800 block">Essay / Long Answer</span>
                    <span className="text-[10px] text-stone-400 block">5 marks each</span>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={essayCount}
                      onChange={(e) => setEssayCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center text-sm font-bold border border-stone-300 rounded-lg py-1.5 px-1 bg-white focus:ring-2 focus:ring-[#9D174D]/25 focus:border-[#9D174D] outline-none min-h-[44px] tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="bloom-cb"
                  checked={bloomEnabled}
                  onChange={(e) => setBloomEnabled(e.target.checked)}
                  className="mt-0.5 rounded text-[#9D174D] focus:ring-[#9D174D] w-4 h-4 cursor-pointer"
                />
                <label htmlFor="bloom-cb" className="text-xs text-stone-700 font-medium cursor-pointer leading-relaxed">
                  Enforce Bloom's Cognitive Taxonomy (Remember, Understand, Apply, Analyze)
                </label>
              </div>
            </div>
          </div>

          {generationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{generationError}</span>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2.5 border border-stone-200 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer text-center min-h-[44px] sm:min-h-[40px]"
            >
              Back to Documents
            </button>

            <button
              type="button"
              onClick={handleGenerateExam}
              disabled={isGenerating}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs min-h-[44px] sm:min-h-[40px] ${
                isGenerating
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed'
                  : 'bg-[#9D174D] hover:bg-[#83133E] text-white cursor-pointer'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>
                {isGenerating ? 'Generating Questions...' : 'Generate Questions'}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Review Groups & Answer Keys */}
      {step === 3 && activeExam && (
        <div className="space-y-6">
          {/* Exam Summary Card: Sectioned Academic Header, Metadata & Dedicated Toolbar */}
          <div className={`bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden ${workspaceView === 'preview' ? 'no-print' : ''}`}>
            {/* a. Header & b. Metadata */}
            <div className="p-5 sm:p-6 md:p-7 space-y-3.5">
              {/* a. Header: Full-width Exam Title + Clearly Separated Status Badge */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-6">
                <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-stone-950 tracking-tight leading-snug break-words min-w-0 flex-1">
                  {activeExam.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pt-0.5">
                  <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-pink-50/90 text-[#9D174D] font-bold border border-pink-200/80 tabular-nums whitespace-nowrap">
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {activeExam.groups_count} {activeExam.groups_count === 1 ? 'Group' : 'Groups'} Generated
                    </span>
                  </span>
                  {activeExam.is_rtl && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span>RTL Script</span>
                    </span>
                  )}
                </div>
              </div>

              {/* b. Metadata: Compact, readable information */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-stone-600 tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-stone-400">Subject:</span>
                  <strong className="font-semibold text-stone-800">{activeExam.subject}</strong>
                </span>
                {activeExam.institution && (
                  <>
                    <span aria-hidden="true" className="text-stone-300">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-stone-400">Institution:</span>
                      <strong className="font-semibold text-stone-800">{activeExam.institution}</strong>
                    </span>
                  </>
                )}
                {activeExam.faculty && (
                  <>
                    <span aria-hidden="true" className="text-stone-300">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-stone-400">Faculty / Dept:</span>
                      <strong className="font-semibold text-stone-800">{activeExam.faculty}</strong>
                    </span>
                  </>
                )}
                <span aria-hidden="true" className="text-stone-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-stone-400">Total Questions:</span>
                  <strong className="font-semibold text-stone-800">{activeExam.questions_count}</strong>
                </span>
                {activeExam.duration_minutes > 0 && (
                  <>
                    <span aria-hidden="true" className="text-stone-300">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-stone-400">Duration:</span>
                      <strong className="font-semibold text-stone-800">{activeExam.duration_minutes} Mins</strong>
                    </span>
                  </>
                )}
                <span aria-hidden="true" className="text-stone-300">·</span>
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>All Questions Source-Grounded</span>
                </span>
              </div>
            </div>

            {/* c. Actions: Dedicated, Well-Aligned Toolbar Below Metadata */}
            <div className="px-5 sm:px-6 md:px-7 py-3.5 sm:py-4 bg-stone-50/75 border-t border-stone-200/80">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap lg:items-center gap-2 sm:gap-2.5">
                {workspaceView === 'editor' && (
                  <div className="col-span-2 sm:col-auto grid grid-cols-2 sm:inline-flex items-center p-1 bg-stone-200/70 rounded-xl border border-stone-200/80 gap-1">
                    <button
                      onClick={() => setViewMode('questions')}
                      className={`px-3 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all text-center whitespace-nowrap min-h-[40px] sm:min-h-[34px] ${
                        viewMode === 'questions'
                          ? 'bg-white text-[#9D174D] font-bold shadow-2xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <span className="hidden md:inline">Questions View</span>
                      <span className="md:hidden">Questions</span>
                    </button>
                    <button
                      onClick={() => setViewMode('answer_keys')}
                      className={`px-3 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all text-center whitespace-nowrap min-h-[40px] sm:min-h-[34px] ${
                        viewMode === 'answer_keys'
                          ? 'bg-white text-[#9D174D] font-bold shadow-2xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <span className="hidden lg:inline">Answer Keys & Scoring Rubrics</span>
                      <span className="lg:hidden">Answer Keys</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setWorkspaceView(workspaceView === 'editor' ? 'preview' : 'editor')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[44px] sm:min-h-[38px] ${
                    workspaceView === 'preview'
                      ? 'col-span-1 sm:col-auto bg-[#9D174D] text-white shadow-xs'
                      : 'col-span-1 sm:col-auto bg-white text-[#9D174D] border border-pink-200 hover:bg-pink-50 shadow-2xs'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden md:inline">{workspaceView === 'preview' ? 'Return to Editor' : 'Paper Preview & Print'}</span>
                  <span className="md:hidden">{workspaceView === 'preview' ? 'Editor' : 'Preview'}</span>
                </button>

                <div className="hidden lg:block lg:flex-1" />

                <button
                  onClick={handleGenerateAiResistant}
                  disabled={isGeneratingAiResistant}
                  className="col-span-1 sm:col-auto px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all bg-gradient-to-r from-[#7E1248] via-[#9D174D] to-[#BE185D] hover:from-[#6B0F3D] hover:to-[#9D174D] text-white shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap min-h-[44px] sm:min-h-[38px]"
                  title={
                    activeExam.is_rtl
                      ? 'تولید سوالات تحلیلی و مستند (مقاوم در برابر هوش مصنوعی)'
                      : 'Generate AI-Resistant Questions'
                  }
                >
                  {isGeneratingAiResistant ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                      <span>{activeExam.is_rtl ? 'در حال تحلیل...' : 'Generating Draft...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-pink-200 shrink-0" />
                      <span className="hidden md:inline">
                        {activeExam.is_rtl
                          ? 'تولید سوالات تحلیلی و مستند (مقاوم در برابر AI)'
                          : 'Generate AI-Resistant Questions'}
                      </span>
                      <span className="md:hidden">
                        {activeExam.is_rtl ? 'سوالات تحلیلی (AI)' : 'AI-Resistant'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setExportError(null);
                    setShowExportModal(true);
                  }}
                  className="col-span-2 sm:col-auto px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[44px] sm:min-h-[38px]"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>Export Exam (DOCX / PDF)</span>
                </button>
              </div>
            </div>
          </div>

          {activeExam.id === 'exam-cell-bio-midterm' && (
            <div className="no-print p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-start sm:items-center gap-2 min-w-0">
                <HelpCircle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5 sm:mt-0" />
                <span>
                  Viewing the read-only sample examination. Upload or select a source document in Step 1 to generate an editable examination.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 font-bold text-xs hover:bg-amber-100/70 cursor-pointer shrink-0 self-start sm:self-center"
              >
                Create New Exam
              </button>
            </div>
          )}

          {/* Export Error Banner */}
          {exportError && !showExportModal && (
            <div className="no-print p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="break-words">{exportError}</span>
              </div>
              <button
                type="button"
                onClick={() => setExportError(null)}
                className="p-1 text-rose-500 hover:text-rose-800 cursor-pointer shrink-0"
                aria-label="Dismiss export error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* AI-Resistant Notification Banners */}
          {aiResistantSuccessMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2 shadow-2xs">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{aiResistantSuccessMessage}</span>
            </div>
          )}

          {aiResistantError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium flex items-center gap-2 shadow-2xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{aiResistantError}</span>
            </div>
          )}

          {/* Conditional View: Academic Paper Preview vs Interactive Editor */}
          {workspaceView === 'preview' ? (
            <AcademicPaperPreview
              exam={activeExam}
              activeGroupIndex={activeGroupIndex}
              onGroupSelect={setActiveGroupIndex}
              onClose={() => setWorkspaceView('editor')}
              onExport={(format, target, exportAll) => {
                setExportTarget(target);
                setExportScope(exportAll ? 'all' : 'current');
                void downloadExamExport(format, target, exportAll ? 'all' : 'current', true);
              }}
            />
          ) : (
            <>
              {/* Group Tabs Selector Rail (Group A–J) */}
              <div className="bg-stone-100/90 p-1.5 rounded-2xl border border-stone-200/80 flex flex-wrap items-center gap-1.5 max-w-full">
            {activeExam.groups.map((g, idx) => {
              const isSelected = activeGroupIndex === idx;
              return (
                <button
                  key={g.id}
                  onClick={() => setActiveGroupIndex(idx)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 whitespace-nowrap min-h-[38px] ${
                    isSelected
                      ? 'bg-[#9D174D] text-white shadow-xs'
                      : 'bg-white/85 text-stone-700 hover:bg-white hover:text-stone-900 border border-stone-200/70'
                  }`}
                >
                  <Shuffle className={`w-3 h-3 shrink-0 ${isSelected ? 'text-pink-200' : 'text-[#9D174D]'}`} />
                  <span>{g.group_name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums leading-none font-semibold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {g.questions.length} Qs
                  </span>
                </button>
              );
            })}
          </div>

          {/* QUESTIONS VIEW */}
          {viewMode === 'questions' && currentGroup && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-stone-500 px-1 py-0.5">
                <span>
                  Viewing <strong className="text-stone-900 font-semibold">{currentGroup.group_name}</strong> (Distinct grounded exam variant with synchronized answer key)
                </span>
                <span className="font-semibold text-stone-800 tabular-nums shrink-0">
                  Total Marks: {currentGroup.questions.reduce((a, b) => a + b.marks, 0)} pts
                </span>
              </div>

              {reorderError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{reorderError}</span>
                </div>
              )}

              {currentGroup.questions.map((q, qIndex) => {
                const isEditing = editingQuestionId === q.id;
                const isFirst = qIndex === 0;
                const isLast = qIndex === currentGroup.questions.length - 1;
                const isReorderingThis = reorderingQuestionId === q.id;
                const isRegeneratingThis = regeneratingQuestionId === q.id;
                const isPromptingRegen = promptRegenerateQuestionId === q.id;

                return (
                  <div
                    key={q.id}
                    className="p-4 sm:p-6 bg-white rounded-2xl border border-stone-200/90 shadow-xs space-y-3.5 min-w-0"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200/70 text-[#9D174D] font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
                          {q.question_order}
                        </span>
                        <span className="text-[11px] uppercase font-mono font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80">
                          {q.question_type.replace('_', ' ')}
                        </span>
                        <span className="text-xs capitalize font-medium text-emerald-700">
                          {q.difficulty}
                        </span>
                        {q.bloom_level && (
                          <>
                            <span aria-hidden="true" className="text-stone-300">·</span>
                            <span className="text-xs capitalize font-medium text-stone-600">
                              Bloom: {q.bloom_level}
                            </span>
                          </>
                        )}
                        <span aria-hidden="true" className="text-stone-300">·</span>
                        <span className="text-xs font-semibold text-stone-700 tabular-nums">
                          {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {!isEditing ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Reorder Buttons: Move Up / Down */}
                            <div className="flex items-center rounded-lg border border-stone-200 bg-stone-50 overflow-hidden shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleMoveQuestion(qIndex, 'up')}
                                disabled={isFirst || Boolean(reorderingQuestionId)}
                                className="p-1.5 hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent text-stone-600 transition-colors cursor-pointer disabled:cursor-not-allowed min-w-[32px] min-h-[32px] flex items-center justify-center"
                                title={isFirst ? 'Already at top' : 'Move Question Up'}
                                aria-label={`Move question ${q.question_order} up`}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <div className="w-[1px] h-4 bg-stone-200" />
                              <button
                                type="button"
                                onClick={() => handleMoveQuestion(qIndex, 'down')}
                                disabled={isLast || Boolean(reorderingQuestionId)}
                                className="p-1.5 hover:bg-stone-200 disabled:opacity-30 disabled:hover:bg-transparent text-stone-600 transition-colors cursor-pointer disabled:cursor-not-allowed min-w-[32px] min-h-[32px] flex items-center justify-center"
                                title={isLast ? 'Already at bottom' : 'Move Question Down'}
                                aria-label={`Move question ${q.question_order} down`}
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Regenerate Question Button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (isPromptingRegen) {
                                  setPromptRegenerateQuestionId(null);
                                  setRegenerateError(null);
                                } else {
                                  setPromptRegenerateQuestionId(q.id);
                                  setRegenerateInstructions('');
                                  setRegenerateError(null);
                                }
                              }}
                              disabled={Boolean(regeneratingQuestionId)}
                              className={`py-1.5 px-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs min-h-[34px] whitespace-nowrap ${
                                isPromptingRegen
                                  ? 'bg-pink-50 border-[#9D174D] text-[#9D174D]'
                                  : 'bg-white hover:bg-stone-50 border-stone-200 text-stone-700'
                              } disabled:opacity-50`}
                              title="Regenerate this question from source document"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${isRegeneratingThis ? 'animate-spin text-[#9D174D]' : 'text-stone-500'}`} />
                              <span>{isRegeneratingThis ? 'Regenerating...' : 'Regenerate'}</span>
                            </button>

                            {/* Edit Button */}
                            <button
                              type="button"
                              onClick={() => handleStartEdit(q)}
                              className="py-1.5 px-2.5 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-50 border border-stone-200 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs min-h-[34px] whitespace-nowrap"
                              title="Edit Question, Choices, Answer & Rubric"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-stone-500" />
                              <span>Edit</span>
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingQuestion(q);
                                setDeleteError(null);
                              }}
                              className="py-1.5 px-2.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs min-h-[34px] whitespace-nowrap"
                              title="Delete Question from this group"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                              <span className="hidden sm:inline">Delete Question</span>
                              <span className="sm:hidden">Delete</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(q.id)}
                              disabled={isSavingEdit}
                              className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1 hover:bg-emerald-700 transition-all cursor-pointer shadow-2xs disabled:opacity-50 min-h-[34px]"
                            >
                              <Save className="w-3 h-3" />
                              <span>{isSavingEdit ? 'Saving...' : 'Save'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingQuestionId(null);
                                setEditError(null);
                              }}
                              className="p-1.5 text-stone-400 hover:text-stone-600 rounded-lg cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline Question Regeneration Prompt Drawer */}
                    {isPromptingRegen && !isEditing && (
                      <div className="p-3.5 bg-pink-50/70 border border-pink-200 rounded-xl space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#9D174D] flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" />
                            Regenerate Question {q.question_order}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPromptRegenerateQuestionId(null);
                              setRegenerateError(null);
                            }}
                            className="text-stone-400 hover:text-stone-600 p-0.5 rounded cursor-pointer"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-stone-600 text-[11px] leading-relaxed">
                          Refreshes this question from source document evidence (Page {q.source_page || 1}). You can optionally supply custom focal instructions:
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            placeholder="Optional instructions (e.g. Focus on mitochondrial ATP synthesis)"
                            value={regenerateInstructions}
                            onChange={(e) => setRegenerateInstructions(e.target.value)}
                            disabled={isRegeneratingThis}
                            className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#9D174D] disabled:bg-stone-50 min-h-[38px]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleRegenerateQuestion(q.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRegenerateQuestion(q.id)}
                            disabled={isRegeneratingThis}
                            className="px-3.5 py-2 bg-[#9D174D] hover:bg-[#83133E] text-white font-bold text-xs rounded-lg transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1.5 shrink-0 disabled:opacity-50 min-h-[38px]"
                          >
                            <RotateCcw className={`w-3 h-3 ${isRegeneratingThis ? 'animate-spin' : ''}`} />
                            <span>{isRegeneratingThis ? 'Regenerating...' : 'Confirm'}</span>
                          </button>
                        </div>
                        {regenerateError && (
                          <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{regenerateError}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Question Content & Full Edit Mode */}
                    {isEditing ? (
                      <div className="space-y-3 pt-1 border-t border-stone-100">
                        {editError && (
                          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{editError}</span>
                          </div>
                        )}

                        <div>
                          <label className="text-xs font-bold text-stone-700 block mb-1">
                            Question Stem / Text:
                          </label>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full p-2.5 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/30 focus:border-[#9D174D] outline-none"
                            rows={3}
                            placeholder="Enter question text..."
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-stone-700">Marks (Points):</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={editMarks}
                            onChange={(e) => {
                              const parsed = parseFloat(e.target.value);
                              setEditMarks(isNaN(parsed) ? 0 : Math.max(0, parsed));
                            }}
                            className="w-24 px-2.5 py-1 border border-stone-300 rounded-lg text-xs"
                          />
                        </div>

                        {/* MCQ Options Editing (Supports all 4-5 options, correct answer selection, and reordering) */}
                        {editOptions && editOptions.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-stone-100">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <label className="text-xs font-bold text-stone-700">
                                Answer Choices ({editOptions.length} Options):
                              </label>
                              <span className="text-[11px] text-stone-500">
                                Select radio button next to choice to set as correct answer. Use arrows to reorder.
                              </span>
                            </div>

                            <div className="space-y-2">
                              {editOptions.slice(0, 4).map((opt, i) => {
                                const letters = activeExam?.is_rtl ? ['الف', 'ب', 'ج', 'د'] : ['A', 'B', 'C', 'D'];
                                const label = letters[i] || `${i + 1}`;
                                const isChecked = editCorrectAnswer === opt;

                                return (
                                  <div
                                    key={i}
                                    className={`p-2 sm:p-2.5 rounded-xl border flex items-center gap-2 transition-all min-w-0 ${
                                      isChecked
                                        ? 'border-emerald-400 bg-emerald-50/70 shadow-2xs'
                                        : 'border-stone-200 bg-stone-50/50'
                                    }`}
                                  >
                                    <label
                                      className="flex items-center gap-1.5 cursor-pointer shrink-0"
                                      title="Mark as correct answer"
                                    >
                                      <input
                                        type="radio"
                                        name={`correct_choice_${q.id}`}
                                        checked={isChecked}
                                        onChange={() => setEditCorrectAnswer(opt)}
                                        className="accent-emerald-600 cursor-pointer w-4 h-4"
                                      />
                                      <span
                                        className={`w-6 h-6 rounded-md text-[11px] font-bold flex items-center justify-center shrink-0 border ${
                                          isChecked
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : 'bg-white text-stone-700 border-stone-200'
                                        }`}
                                      >
                                        {label}
                                      </span>
                                    </label>

                                    <input
                                      type="text"
                                      value={opt}
                                      onChange={(e) => {
                                        const newOpts = [...editOptions];
                                        const oldVal = newOpts[i];
                                        const newVal = e.target.value;
                                        newOpts[i] = newVal;
                                        setEditOptions(newOpts);
                                        // If this was the correct answer, keep correct answer in sync
                                        if (isChecked || editCorrectAnswer === oldVal) {
                                          setEditCorrectAnswer(newVal);
                                        }
                                      }}
                                      className="flex-1 min-w-0 px-2.5 sm:px-3 py-2 sm:py-1.5 border border-stone-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-emerald-500 outline-none"
                                      placeholder={`Choice ${label}`}
                                    />

                                    {/* Reorder Up and Down buttons */}
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <button
                                        type="button"
                                        disabled={i === 0}
                                        onClick={() => {
                                          if (i === 0) return;
                                          const newOpts = [...editOptions];
                                          const temp = newOpts[i];
                                          newOpts[i] = newOpts[i - 1];
                                          newOpts[i - 1] = temp;
                                          setEditOptions(newOpts);
                                        }}
                                        className={`p-1 rounded cursor-pointer ${
                                          i === 0
                                            ? 'text-stone-300 cursor-not-allowed'
                                            : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/70'
                                        }`}
                                        title="Move choice up"
                                      >
                                        <ChevronUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        disabled={i === Math.min(3, editOptions.length - 1)}
                                        onClick={() => {
                                          if (i >= editOptions.length - 1) return;
                                          const newOpts = [...editOptions];
                                          const temp = newOpts[i];
                                          newOpts[i] = newOpts[i + 1];
                                          newOpts[i + 1] = temp;
                                          setEditOptions(newOpts);
                                        }}
                                        className={`p-1 rounded cursor-pointer ${
                                          i === Math.min(3, editOptions.length - 1)
                                            ? 'text-stone-300 cursor-not-allowed'
                                            : 'text-stone-500 hover:text-stone-800 hover:bg-stone-200/70'
                                        }`}
                                        title="Move choice down"
                                      >
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Non-MCQ Correct Answer Input */}
                        {(!editOptions || editOptions.length === 0) && (
                          <div className="space-y-1 pt-2 border-t border-stone-100">
                            <label className="text-xs font-bold text-stone-700 block">
                              Correct Answer:
                            </label>
                            <input
                              type="text"
                              value={editCorrectAnswer}
                              onChange={(e) => setEditCorrectAnswer(e.target.value)}
                              className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
                              placeholder="Enter official correct answer..."
                            />
                          </div>
                        )}

                        {/* Pedagogical Explanation / Scoring Rubric */}
                        <div className="space-y-1 pt-2 border-t border-stone-100">
                          <label className="text-xs font-bold text-stone-700 block">
                            Scoring Rubric & Pedagogical Explanation:
                          </label>
                          <textarea
                            value={editExplanation}
                            onChange={(e) => setEditExplanation(e.target.value)}
                            className="w-full p-2.5 border border-stone-300 rounded-xl text-xs focus:ring-2 focus:ring-[#9D174D]/30 focus:border-[#9D174D] outline-none"
                            rows={2}
                            placeholder="Enter rationale, rubric criteria, or textbook context..."
                          />
                        </div>
                      </div>
                    ) : (
                      <p
                        className={`text-sm sm:text-[15px] font-semibold text-stone-900 leading-relaxed ${
                          activeExam.is_rtl ? 'text-right' : 'text-left'
                        }`}
                        dir={activeExam.is_rtl ? 'rtl' : 'ltr'}
                      >
                        {q.question_text}
                      </p>
                    )}

                    {/* Multiple Choice Options Display (in view mode) */}
                    {!isEditing && q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-0.5">
                        {q.options.map((opt, i) => {
                          const letters = ['A', 'B', 'C', 'D', 'E'];
                          const isCorrect = q.correct_answer.includes(opt) || q.correct_answer.startsWith(letters[i]);
                          return (
                            <div
                              key={i}
                              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                                isCorrect
                                  ? 'border-emerald-300 bg-emerald-50/60 font-semibold text-emerald-900'
                                  : 'border-stone-200 bg-stone-50/40 text-stone-700'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center shrink-0 border ${
                                  isCorrect
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white border-stone-200 text-stone-500'
                                }`}
                              >
                                {letters[i]}
                              </span>
                              <span className="leading-relaxed break-words">{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Correct Answer & Pedagogical Explanation Display (in view mode) */}
                    {!isEditing && (
                      <div className="p-3.5 bg-stone-50/80 rounded-xl border border-stone-200/70 text-xs space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="font-bold text-emerald-800">Correct Answer:</span>
                          <span className="text-stone-900 font-semibold break-words">{q.correct_answer}</span>
                        </div>
                        {q.explanation && (
                          <p className="text-[11px] text-stone-600 leading-relaxed">
                            <strong className="text-stone-700">Rationale / Rubric:</strong> {q.explanation}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Strict Source Grounding Citation */}
                    <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-stone-500">
                      <span className="font-semibold text-stone-700 inline-flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#9D174D] shrink-0" />
                        <span>Source Reference:</span>
                      </span>
                      <span className="font-mono text-[10px] text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                        {q.source_document_name}
                      </span>
                      <span className="tabular-nums">Page {q.source_page}</span>
                      {q.source_chapter && (
                        <>
                          <span aria-hidden="true" className="text-stone-300">·</span>
                          <span>{q.source_chapter}</span>
                        </>
                      )}
                      {q.source_evidence && (
                        <span className="italic text-stone-500 block w-full mt-1 leading-relaxed bg-stone-50/60 px-3 py-2 rounded-lg">
                          "{q.source_evidence}"
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ANSWER KEYS VIEW */}
          {viewMode === 'answer_keys' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                Official Answer Keys & Scoring Rubrics for All Groups
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {answerKeys.map((keyGroup) => (
                  <div
                    key={keyGroup.id}
                    className="p-4 sm:p-5 bg-white rounded-2xl border border-stone-200/90 shadow-xs space-y-3 min-w-0"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 pb-2 gap-2">
                      <h5 className="font-bold text-xs text-[#9D174D] flex items-center gap-1.5 min-w-0 truncate">
                        <Award className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{keyGroup.group_name} Answer Key</span>
                      </h5>
                      <span className="text-[10px] text-stone-400 tabular-nums shrink-0">
                        {keyGroup.items.length} Questions
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {keyGroup.items.map((item) => (
                        <div
                          key={item.question_number}
                          className="p-2.5 rounded-lg border border-stone-100 bg-stone-50/50 text-xs space-y-1 min-w-0"
                        >
                          <div className="flex items-center justify-between gap-2 tabular-nums">
                            <span className="font-bold text-stone-900">
                              Q{item.question_number} ({item.question_type})
                            </span>
                            <span className="text-emerald-700 font-bold shrink-0">
                              {item.marks} pts
                            </span>
                          </div>
                          <div className="text-emerald-800 font-semibold break-words">
                            Answer: {item.correct_answer}
                          </div>
                          {item.explanation && (
                            <p className="text-[11px] text-stone-500 break-words leading-relaxed">{item.explanation}</p>
                          )}
                          <div className="text-[10px] text-stone-400 break-words">
                            Ref: {item.source_reference} (P. {item.source_page})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )}

      {/* Export Engine Modal */}
      {showExportModal && activeExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full p-4 sm:p-6 space-y-5 animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <FileDown className="w-5 h-5 text-emerald-600 shrink-0" />
                <h3 className="text-base font-bold text-stone-900">Export Examination Package</h3>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                aria-label="Close export modal"
                className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Target Scope */}
              <div className="space-y-1.5">
                <label className="font-bold text-stone-700 block">Groups Selection</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportScope('current')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all min-h-[44px] ${
                      exportScope === 'current'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-bold'
                        : 'border-stone-200 hover:bg-stone-50 text-stone-600'
                    }`}
                  >
                    <div>Current Group ({activeExam.groups[activeGroupIndex]?.group_name})</div>
                    <div className="text-[10px] text-stone-400 font-normal">Only selected exam variant</div>
                  </button>
                  <button
                    onClick={() => setExportScope('all')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all min-h-[44px] ${
                      exportScope === 'all'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-bold'
                        : 'border-stone-200 hover:bg-stone-50 text-stone-600'
                    }`}
                  >
                    <div>All Groups (Compiled Master)</div>
                    <div className="text-[10px] text-stone-400 font-normal">All {activeExam.groups_count} groups separated by page breaks</div>
                  </button>
                </div>
              </div>

              {/* Document Components */}
              <div className="space-y-1.5">
                <label className="font-bold text-stone-700 block">Document Components</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => setExportTarget('both')}
                    className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all min-h-[42px] ${
                      exportTarget === 'both'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-bold'
                        : 'border-stone-200 hover:bg-stone-50 text-stone-600'
                    }`}
                  >
                    Paper + Answer Key
                  </button>
                  <button
                    onClick={() => setExportTarget('exam')}
                    className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all min-h-[42px] ${
                      exportTarget === 'exam'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-bold'
                        : 'border-stone-200 hover:bg-stone-50 text-stone-600'
                    }`}
                  >
                    Student Paper Only
                  </button>
                  <button
                    onClick={() => setExportTarget('answer_key')}
                    className={`p-2.5 rounded-xl border text-center cursor-pointer transition-all min-h-[42px] ${
                      exportTarget === 'answer_key'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900 font-bold'
                        : 'border-stone-200 hover:bg-stone-50 text-stone-600'
                    }`}
                  >
                    Answer Key Only
                  </button>
                </div>
              </div>

              {/* Provenance flag */}
              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="includeProv"
                  checked={includeProvenance}
                  onChange={(e) => setIncludeProvenance(e.target.checked)}
                  className="mt-0.5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="includeProv" className="text-stone-700 cursor-pointer leading-relaxed">
                  Include source evidence citations & page references in Answer Key
                </label>
              </div>
              {exportError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="break-words">{exportError}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setExportError(null);
                }}
                disabled={Boolean(isExporting)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer text-center min-h-[42px] sm:min-h-[38px] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleExport('docx')}
                disabled={Boolean(isExporting)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-[38px] disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isExporting === 'docx' ? 'Exporting DOCX...' : 'Download DOCX (.docx)'}</span>
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={Boolean(isExporting)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-[38px] disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting === 'pdf' ? 'Exporting PDF...' : 'Download PDF (.pdf)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Question Confirmation Dialog */}
      {deletingQuestion && activeExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-3 sm:p-4 no-print">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-md w-full p-4 sm:p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <h3 className="text-sm font-bold text-stone-900">
                  Delete Question {deletingQuestion.question_order}?
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Are you sure you want to delete this question? This action will remove the question from {currentGroup?.group_name || 'this group'}, automatically update sequential numbering in this group, and recalculate marks and answer keys. Sibling groups remain intact.
                </p>
              </div>
            </div>

            {/* Question preview snippet */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200/80 text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-stone-400">Question Content:</span>
              <p className="text-stone-800 line-clamp-3 font-medium">"{deletingQuestion.question_text}"</p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-stone-500 tabular-nums">
                <span>Marks: {deletingQuestion.marks} pt</span>
                <span>•</span>
                <span>Type: {deletingQuestion.question_type.toUpperCase()}</span>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Dialog Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setDeletingQuestion(null);
                  setDeleteError(null);
                }}
                disabled={isDeletingQuestion}
                className="px-4 py-2.5 sm:py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer disabled:opacity-50 text-center min-h-[42px] sm:min-h-[36px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteQuestion}
                disabled={isDeletingQuestion}
                className="px-4 py-2.5 sm:py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 min-h-[42px] sm:min-h-[36px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingQuestion ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI-Resistant Question Review & Confirmation Modal */}
      {showAiResistantModal && activeExam && aiResistantDraft && (
        <AiResistantReviewModal
          isOpen={showAiResistantModal}
          onClose={() => setShowAiResistantModal(false)}
          onApply={handleApplyAiResistant}
          currentExam={activeExam}
          draftGroups={aiResistantDraft.draft_groups || []}
          isApplying={isApplyingAiResistant}
        />
      )}
    </div>
  );
}
