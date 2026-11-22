import React, { useState } from 'react';
import {
  FileText,
  Download,
  ArrowLeft,
  ShieldAlert,
  Award,
  Layers,
  CheckCircle2,
  HelpCircle,
  Eye,
  FileCheck,
} from 'lucide-react';
import { Exam, ExamGroup, Question } from './ExamWorkspace';

interface AcademicPaperPreviewProps {
  exam: Exam;
  activeGroupIndex: number;
  onGroupSelect: (index: number) => void;
  onClose: () => void;
  onExport: (
    format: 'docx' | 'pdf',
    target: 'both' | 'exam' | 'answer_key',
    exportAll: boolean
  ) => void;
}

export function AcademicPaperPreview({
  exam,
  activeGroupIndex,
  onGroupSelect,
  onClose,
  onExport,
}: AcademicPaperPreviewProps) {
  // Preview mode: 'both' | 'exam' | 'answer_key'
  const [viewTarget, setViewTarget] = useState<'both' | 'exam' | 'answer_key'>('both');
  // Scope: 'single' | 'all'
  const [scope, setScope] = useState<'single' | 'all'>('single');

  const isRtl = Boolean(exam.is_rtl);
  const groupsToRender =
    scope === 'all'
      ? exam.groups
      : [exam.groups[activeGroupIndex] || exam.groups[0]].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* PREVIEW TOOLBAR (Hidden during print) */}
      <div className="no-print bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200/90 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 lg:sticky lg:top-[72px] z-20">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0 min-h-[38px] sm:min-h-[36px]"
            title="Return to Editor"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Editor</span>
          </button>

          <div className="h-5 w-px bg-stone-200 shrink-0" />

          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-stone-900 flex items-center gap-1.5 sm:gap-2 truncate">
              <Eye className="w-4 h-4 text-[#9D174D] shrink-0" />
              <span className="truncate">Academic Sheet Preview</span>
            </h3>
            <p className="text-[11px] text-stone-500 truncate hidden sm:block">
              Formatted preview of student papers & confidential answer keys
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2 justify-between lg:justify-end">
          {/* Target Mode Selector */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200/70 text-xs font-medium">
            <button
              onClick={() => setViewTarget('both')}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap ${
                viewTarget === 'both'
                  ? 'bg-white text-[#9D174D] font-bold shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Paper + Key
            </button>
            <button
              onClick={() => setViewTarget('exam')}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap ${
                viewTarget === 'exam'
                  ? 'bg-white text-[#9D174D] font-bold shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Paper
            </button>
            <button
              onClick={() => setViewTarget('answer_key')}
              className={`px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap ${
                viewTarget === 'answer_key'
                  ? 'bg-white text-[#9D174D] font-bold shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Key
            </button>
          </div>

          <div className="h-5 w-px bg-stone-200 hidden sm:block" />

          {/* Scope Selector: Single Group vs All Groups */}
          <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200/70 text-xs font-medium">
            <button
              onClick={() => setScope('single')}
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap ${
                scope === 'single'
                  ? 'bg-white text-[#9D174D] font-bold shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Current
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-2.5 py-1.5 sm:py-1 rounded-lg transition-all cursor-pointer text-[11px] sm:text-xs whitespace-nowrap tabular-nums ${
                scope === 'all'
                  ? 'bg-white text-[#9D174D] font-bold shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              All {exam.groups_count} Groups
            </button>
          </div>

          <div className="h-5 w-px bg-stone-200 hidden sm:block" />

          {/* Export Buttons */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
            <button
              onClick={() => onExport('docx', viewTarget, scope === 'all')}
              className="flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs min-h-[38px] sm:min-h-[36px]"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>DOCX</span>
            </button>
            <button
              onClick={() => onExport('pdf', viewTarget, scope === 'all')}
              className="flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer shadow-xs min-h-[38px] sm:min-h-[36px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* DYNAMIC GROUP TABS (Visible when scope is single, hidden in print) */}
      {scope === 'single' && (
        <div className="no-print bg-stone-100/90 p-1.5 rounded-2xl border border-stone-200/80 flex flex-wrap items-center gap-1.5 max-w-full">
          {exam.groups.map((grp, idx) => {
            const isSelected = activeGroupIndex === idx;
            return (
              <button
                key={grp.id}
                onClick={() => onGroupSelect(idx)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2 whitespace-nowrap min-h-[38px] ${
                  isSelected
                    ? 'bg-[#9D174D] text-white shadow-xs'
                    : 'bg-white/85 text-stone-700 hover:bg-white hover:text-stone-900 border border-stone-200/70'
                }`}
              >
                <Layers className={`w-3 h-3 shrink-0 ${isSelected ? 'text-pink-200' : 'text-[#9D174D]'}`} />
                <span>{grp.group_name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums leading-none font-semibold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {grp.questions.length} Qs
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ACADEMIC PAPER SHEETS CONTAINER */}
      <div className="space-y-12">
        {groupsToRender.map((group, gIdx) => {
          const groupMarks = group.questions.reduce((sum, q) => sum + (q.marks || 0), 0);
          const sortedQuestions = [...group.questions].sort(
            (a, b) => a.question_order - b.question_order
          );

          return (
            <div key={group.id} className="space-y-8">
              {/* 1. STUDENT EXAMINATION PAPER SHEET */}
              {(viewTarget === 'both' || viewTarget === 'exam') && (
                <div
                  dir={isRtl ? 'rtl' : 'ltr'}
                  className={`paper-sheet ${gIdx > 0 ? 'print-page-break' : ''} bg-white rounded-2xl border border-stone-300 shadow-lg p-4 sm:p-6 md:p-10 max-w-4xl mx-auto space-y-6 text-stone-900 font-serif leading-relaxed`}
                >
                  {/* Institutional Header */}
                  <div className="text-center space-y-1 border-b border-stone-200 pb-4">
                    {(() => {
                      const instParts = [exam.institution, exam.faculty]
                        .filter(Boolean)
                        .map((s) => String(s).trim())
                        .filter(Boolean);
                      const instHeader = instParts.join(' — ');
                      if (!instHeader) return null;
                      return (
                        <h2 className="text-sm sm:text-base font-bold tracking-wide uppercase text-stone-800">
                          {instHeader}
                        </h2>
                      );
                    })()}
                    <h1 className="text-lg sm:text-xl font-black text-stone-950 font-sans tracking-tight">
                      {exam.title}
                    </h1>
                    <div className="text-xs text-stone-600 italic flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                      <span>Subject: {exam.subject}</span>
                      {exam.grade_level && <span>• Class: {exam.grade_level}</span>}
                      {exam.teacher_name && <span>• Instructor: {exam.teacher_name}</span>}
                    </div>
                  </div>

                  {/* Student Details Grid (2 rows x 4 columns) */}
                  <div className="border border-stone-300 rounded-lg text-xs p-3 font-sans grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-2 bg-stone-50/50">
                    <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                      <span className="text-stone-500 whitespace-nowrap">Student Name:</span>
                      <span className="border-b border-stone-400 flex-1 min-w-[60px] inline-block"></span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                      <span className="text-stone-500 whitespace-nowrap">Roll / Seat No:</span>
                      <span className="border-b border-stone-400 flex-1 min-w-[60px] inline-block"></span>
                    </div>
                    <div>
                      <span className="text-stone-500">Date:</span>{' '}
                      <span className="font-semibold text-stone-800">
                        {exam.exam_date || new Date().toISOString().split('T')[0]}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500">Time:</span>{' '}
                      <span className="font-semibold text-stone-800">
                        {exam.duration_minutes} Mins
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500">Max Marks:</span>{' '}
                      <span className="font-bold text-stone-900">{groupMarks} pts</span>
                    </div>
                    <div>
                      <span className="text-stone-500">Variant:</span>{' '}
                      <span className="font-bold text-[#9D174D] bg-pink-100/70 px-2 py-0.5 rounded">
                        {group.group_name}
                      </span>
                    </div>
                  </div>

                  {/* General Instructions Box */}
                  <div className="p-3 bg-stone-100/70 rounded-lg border border-stone-200 text-xs text-stone-700 font-sans space-y-1">
                    <div className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                      General Instructions:
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-stone-600">
                      <li>Check that this paper contains all questions for your designated examination group.</li>
                      <li>Write all answers clearly in the spaces provided below.</li>
                      <li>Ensure your name and seat number are properly recorded above.</li>
                      <li>Unauthorized devices, notes, or calculators are strictly prohibited.</li>
                    </ol>
                  </div>

                  {/* Questions Section */}
                  <div className="space-y-6 pt-2">
                    {sortedQuestions.map((q, idx) => {
                      const qType = (q.question_type || '').toLowerCase();
                      const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

                      return (
                        <div key={q.id} className="paper-question-item space-y-2 pb-4 border-b border-stone-100 last:border-b-0">
                          {/* Question Number, Text & Marks */}
                          <div className="flex items-start justify-between gap-3 text-sm">
                            <div className="flex items-start gap-2">
                              <span className="font-bold text-stone-900 font-sans">
                                Q{idx + 1}.
                              </span>
                              <p className="text-stone-900 break-words leading-relaxed">{q.question_text}</p>
                            </div>
                            <span className="text-xs font-bold font-sans px-2 py-0.5 bg-stone-100 text-stone-700 rounded shrink-0">
                              [{q.marks} pt{q.marks !== 1 ? 's' : ''}]
                            </span>
                          </div>

                          {/* Question Type Presentation */}
                          {qType === 'mcq' && q.options && (
                            <div className="space-y-1.5 ps-2 sm:ps-6 pt-1 font-sans text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {q.options.map((opt, oIdx) => {
                                  const lbl =
                                    optionLetters[oIdx] || String(oIdx + 1);
                                  // Clean leading A: or (A) if present
                                  const cleanOpt = String(opt)
                                    .replace(/^[A-Fa-f0-9][\:\.\)]\s*/, '')
                                    .trim();

                                  return (
                                    <div
                                      key={oIdx}
                                      className="flex items-start gap-2 p-2 rounded border border-stone-200/70 bg-stone-50/30"
                                    >
                                      <span className="font-bold text-stone-700 shrink-0">
                                        ({lbl})
                                      </span>
                                      <span className="text-stone-800 break-words">{cleanOpt}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="pt-2 text-[11px] text-stone-500 italic">
                                Selected Option: [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]
                              </div>
                            </div>
                          )}

                          {qType === 'true_false' && (
                            <div className="ps-2 sm:ps-6 pt-1 font-sans text-xs flex items-center gap-6">
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border border-stone-400 rounded-sm"></div>
                                <span>True</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border border-stone-400 rounded-sm"></div>
                                <span>False</span>
                              </div>
                            </div>
                          )}

                          {qType === 'fill_blank' && (
                            <div className="ps-2 sm:ps-6 pt-2 font-sans text-xs">
                              <span className="text-stone-500">Answer:</span>{' '}
                              <span className="border-b border-stone-400 inline-block w-full max-w-md"></span>
                            </div>
                          )}

                          {qType === 'short_answer' && (
                            <div className="ps-2 sm:ps-6 pt-2 space-y-2">
                              <div className="border-b border-dashed border-stone-300 h-4 w-full"></div>
                              <div className="border-b border-dashed border-stone-300 h-4 w-full"></div>
                              <div className="border-b border-dashed border-stone-300 h-4 w-full"></div>
                            </div>
                          )}

                          {qType === 'essay' && (
                            <div className="ps-2 sm:ps-6 pt-2 space-y-2">
                              {Array.from({ length: 6 }).map((_, lIdx) => (
                                <div
                                  key={lIdx}
                                  className="border-b border-dashed border-stone-300 h-4 w-full"
                                ></div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* End of Student Paper Notice */}
                  <div className="text-center pt-6 border-t border-stone-200 text-xs font-sans text-stone-400 uppercase tracking-widest">
                    --- END OF EXAMINATION PAPER ({group.group_name}) ---
                  </div>
                </div>
              )}

              {/* 2. TEACHER ANSWER KEY & SCORING RUBRICS (Hard page break in print when following paper or in subsequent groups) */}
              {(viewTarget === 'both' || viewTarget === 'answer_key') && (
                <div
                  dir={isRtl ? 'rtl' : 'ltr'}
                  className={`paper-sheet ${viewTarget === 'both' || gIdx > 0 ? 'print-page-break' : ''} bg-white rounded-2xl border border-rose-200 shadow-lg p-4 sm:p-6 md:p-10 max-w-4xl mx-auto space-y-6 text-stone-900 font-sans`}
                >
                  {/* Confidential Header */}
                  <div className="border-b-2 border-rose-600 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-xs">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                        <span>CONFIDENTIAL - OFFICIAL TEACHER ANSWER KEY</span>
                      </div>
                      <h2 className="text-sm sm:text-base font-bold text-stone-900 mt-1">
                        {exam.title} • {group.group_name} Scoring Rubric
                      </h2>
                    </div>
                    <div className="text-left sm:text-right text-xs text-stone-500">
                      <div>Total Questions: {sortedQuestions.length}</div>
                      <div className="font-bold text-rose-700">Total Marks: {groupMarks} pts</div>
                    </div>
                  </div>

                  {/* Structured Answer Key Table (Horizontally scrollable on mobile to prevent clipping) */}
                  <div className="border border-stone-200 rounded-xl overflow-x-auto print:overflow-visible print:border-none shadow-2xs">
                    <table className={`w-full min-w-[620px] text-xs border-collapse ${isRtl ? 'text-right' : 'text-left'}`}>
                      <thead className="bg-stone-100/80 border-b border-stone-200 text-stone-700 font-bold">
                        <tr>
                          <th className="p-2.5 w-12 text-center">Q#</th>
                          <th className={`p-2.5 w-24 ${isRtl ? 'text-right' : 'text-left'}`}>Type</th>
                          <th className="p-2.5 w-16 text-center">Marks</th>
                          <th className={`p-2.5 w-40 ${isRtl ? 'text-right' : 'text-left'}`}>Correct Answer</th>
                          <th className={`p-2.5 ${isRtl ? 'text-right' : 'text-left'}`}>Explanation</th>
                          <th className={`p-2.5 w-48 bg-rose-50/50 ${isRtl ? 'text-right' : 'text-left'}`}>Source Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200 text-stone-800">
                        {sortedQuestions.map((q, idx) => (
                          <tr key={q.id} className="hover:bg-stone-50/40">
                            <td className="p-2.5 text-center font-bold text-stone-900">
                              Q{idx + 1}
                            </td>
                            <td className="p-2.5 capitalize text-stone-600">
                              {q.question_type?.replace('_', ' ')}
                            </td>
                            <td className="p-2.5 text-center font-bold text-emerald-700">
                              {q.marks} pt
                            </td>
                            <td className="p-2.5 font-bold text-emerald-800 break-words">
                              {q.correct_answer}
                            </td>
                            <td className="p-2.5 text-stone-600 text-[11px] break-words">
                              {q.explanation || '—'}
                            </td>
                            <td className="p-2.5 text-[11px] text-stone-500 bg-rose-50/30">
                              {q.source_document_name && (
                                <div className="font-semibold text-stone-700">
                                  {q.source_document_name}
                                  {q.source_page && ` (P. ${q.source_page})`}
                                </div>
                              )}
                              {q.source_evidence && (
                                <div className="italic text-stone-500 mt-0.5 break-words">
                                  "{q.source_evidence}"
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Confidentiality Footer */}
                  <div className="text-center pt-4 border-t border-stone-200 text-[11px] text-rose-700 font-medium">
                    Strictly confidential document. Not to be distributed to students before examination grading is concluded.
                  </div>
                </div>
              )}

              {/* Page break between groups when compiled */}
              {scope === 'all' && gIdx < groupsToRender.length - 1 && (
                <div className="print-page-break no-print border-t-2 border-dashed border-stone-300 my-8 text-center text-xs text-stone-400">
                  --- End of {group.group_name} ---
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
