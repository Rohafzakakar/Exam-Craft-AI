import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Calendar,
  Layers,
  Award,
  Download,
  FileText,
  FileCheck2,
  Trash2,
  ExternalLink,
  PlusCircle,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { authFetch, TeacherUser } from '../utils/auth';

interface ExamGroup {
  id: string;
  group_name: string;
  questions_count: number;
}

export interface SavedExamSummary {
  id: string;
  title: string;
  subject: string;
  institution?: string | null;
  faculty?: string | null;
  teacher_name?: string;
  exam_date?: string;
  duration_minutes: number;
  total_marks: number;
  groups_count: number;
  questions_count: number;
  created_at: string;
  groups?: ExamGroup[];
}

interface ExamHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  exams: SavedExamSummary[];
  activeExamId: string | null;
  onSelectExam: (examId: string) => void;
  onCreateNewExam: () => void;
  onDeleteExam: (examId: string) => void;
  currentUser?: TeacherUser | null;
  onOpenAuth?: () => void;
}

export function ExamHistoryModal({
  isOpen,
  onClose,
  exams,
  activeExamId,
  onSelectExam,
  onCreateNewExam,
  onDeleteExam,
  currentUser,
  onOpenAuth,
}: ExamHistoryModalProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

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
      setErrorMsg(err.message || 'Failed to download export file.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmDelete = async (examId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await authFetch(`/api/exams/${examId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to delete examination.');
      }
      onDeleteExam(examId);
      setDeletingId(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete examination.');
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#9D174D] to-[#83133E] text-white p-4 sm:p-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center font-black text-xl shrink-0">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold">Examination History & Archive</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white tabular-nums">
                  {exams.length} {exams.length === 1 ? 'Exam' : 'Exams'}
                </span>
              </div>
              <p className="text-xs text-pink-100 font-medium">
                Switch between previously generated examination papers or start fresh
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <button
              onClick={() => {
                onCreateNewExam();
                onClose();
              }}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 sm:py-1.5 rounded-xl bg-white text-[#9D174D] hover:bg-pink-50 text-xs font-bold transition-all shadow-xs cursor-pointer min-h-[38px] sm:min-h-[34px]"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Create New Exam</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="m-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-600 hover:text-rose-800 font-bold shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
          {!currentUser ? (
            <div className="text-center py-12 px-4 space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-3xl bg-pink-50 text-[#9D174D] flex items-center justify-center mx-auto">
                <BookOpen className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-stone-900">Teacher Account Required</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Examination archives and history are preserved privately for authenticated teachers. Sign in or register to access and reopen your past examination papers across devices.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => {
                    onClose();
                    if (onOpenAuth) onOpenAuth();
                  }}
                  className="px-5 py-2.5 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                >
                  Sign In or Register
                </button>
              </div>
            </div>
          ) : exams.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-pink-50 text-[#9D174D] flex items-center justify-center mx-auto">
                <BookOpen className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-stone-800">No Saved Examinations Yet</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Upload a document and generate your first multi-group examination paper to begin archiving.
              </p>
              <button
                onClick={() => {
                  onCreateNewExam();
                  onClose();
                }}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-[#9D174D] hover:bg-[#83133E] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Start New Examination</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {exams.map((exam) => {
                const isActive = exam.id === activeExamId;
                const formattedDate = exam.created_at
                  ? new Date(exam.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Recent';

                return (
                  <div
                    key={exam.id}
                    onClick={() => {
                      onSelectExam(exam.id);
                      onClose();
                    }}
                    className={`group p-4 rounded-2xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isActive
                        ? 'bg-pink-50/60 border-[#9D174D] ring-2 ring-[#9D174D]/20 shadow-xs'
                        : 'bg-white hover:bg-stone-50/80 border-stone-200 hover:border-pink-300 shadow-2xs'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-stone-900 group-hover:text-[#9D174D] transition-colors break-words">
                          {exam.title}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#9D174D] text-white shrink-0">
                            Active in Workspace
                          </span>
                        )}
                        {exam.id === 'exam-cell-bio-midterm' && (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            Seed Template
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-x-2.5 gap-y-1 text-xs text-stone-500 flex-wrap tabular-nums">
                        <span className="font-medium text-stone-700">{exam.subject}</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-stone-400" />
                          {exam.groups_count || 3} Groups
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-stone-400" />
                          {exam.questions_count || 9} Questions
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Award className="w-3.5 h-3.5 text-stone-400" />
                          {exam.total_marks} Marks
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-stone-400" />
                          {formattedDate}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto justify-start md:justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          onSelectExam(exam.id);
                          onClose();
                        }}
                        className={`flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-[34px] ${
                          isActive
                            ? 'bg-[#9D174D] text-white shadow-2xs'
                            : 'bg-stone-100 hover:bg-[#9D174D] text-stone-700 hover:text-white'
                        }`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{isActive ? 'Current' : 'Open in Editor'}</span>
                      </button>

                      {/* Export buttons */}
                      <button
                        onClick={(e) => handleExport(exam.id, 'docx', e)}
                        disabled={downloadingId === `${exam.id}-docx`}
                        title="Download Word (DOCX)"
                        className="px-2.5 py-2 sm:py-1.5 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center gap-1 transition-colors cursor-pointer min-h-[38px] sm:min-h-[34px]"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600" />
                        <span>DOCX</span>
                      </button>

                      <button
                        onClick={(e) => handleExport(exam.id, 'pdf', e)}
                        disabled={downloadingId === `${exam.id}-pdf`}
                        title="Download PDF"
                        className="px-2.5 py-2 sm:py-1.5 text-xs font-semibold rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center gap-1 transition-colors cursor-pointer min-h-[38px] sm:min-h-[34px]"
                      >
                        <Download className="w-3.5 h-3.5 text-rose-600" />
                        <span>PDF</span>
                      </button>

                      {/* Delete button (protected for seed) */}
                      {exam.id !== 'exam-cell-bio-midterm' && (
                        deletingId === exam.id ? (
                          <div className="flex items-center gap-1 animate-in fade-in">
                            <button
                              onClick={(e) => handleConfirmDelete(exam.id, e)}
                              className="px-2.5 py-1.5 text-[11px] font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingId(null);
                              }}
                              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-stone-200 text-stone-700 hover:bg-stone-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(exam.id);
                            }}
                            title="Delete Examination"
                            aria-label="Delete Examination"
                            className="p-2 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer min-w-[38px] min-h-[38px] sm:min-w-[34px] sm:min-h-[34px] flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
