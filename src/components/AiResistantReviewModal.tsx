import React, { useState } from 'react';
import {
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Layers,
  HelpCircle,
  FileText,
} from 'lucide-react';
import type { Exam, Question, ExamGroup } from './ExamWorkspace';

interface AiResistantReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (draftGroups: any[]) => Promise<void>;
  currentExam: Exam;
  draftGroups: any[];
  isApplying: boolean;
}

export function AiResistantReviewModal({
  isOpen,
  onClose,
  onApply,
  currentExam,
  draftGroups,
  isApplying,
}: AiResistantReviewModalProps) {
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);

  if (!isOpen) return null;

  const isRtl = currentExam.is_rtl;
  const currentGroup = currentExam.groups[selectedGroupIndex] || currentExam.groups[0];
  const draftGroup = draftGroups[selectedGroupIndex] || draftGroups[0];

  const handleApplyClick = async () => {
    await onApply(draftGroups);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-950/60 backdrop-blur-xs overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden my-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-purple-900 via-pink-900 to-stone-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shrink-0">
              <Sparkles className="w-5 h-5 text-pink-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <span>
                  {isRtl
                    ? 'بازبینی و ارتقای سوالات به سطح تحلیلی و مستند (مقاوم در برابر هوش مصنوعی)'
                    : 'Review & Upgrade: AI-Resistant Analytical Questions'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-pink-500/30 border border-pink-400/40 text-pink-100">
                  {isRtl ? 'پیش‌نویس بازبینی' : 'Draft Preview'}
                </span>
              </h2>
              <p className="text-xs text-pink-100/80 mt-0.5">
                {isRtl
                  ? 'سوالات بر مبنای سطوح عالی بلوم (تحلیل، ارزیابی، استدلال علّی) و استناد مستقیم به متن بازآفرینی شده‌اند.'
                  : 'Re-engineered into higher-order analytical prompts requiring close reading and explicit source-evidence justification.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isApplying}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pedagogical Guidance Banner */}
        <div className="px-6 py-3 bg-pink-50/70 border-b border-pink-100 flex items-start gap-3 text-xs text-[#83133E]">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#9D174D] mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">
              {isRtl ? 'رویکرد آموزشی و مصونیت در برابر تقلب:' : 'Pedagogical Integrity & Grounded Depth:'}{' '}
            </span>
            {isRtl
              ? 'این فرآیند سوالات سطحی و تعریفی را به سوالات مقایسه‌ای، ارزیابی پیامدهای علّی و استنتاج مستند به متن تبدیل می‌کند؛ پاسخ به این سوالات مستلزم مطالعه دقیق سند بوده و پاسخ‌های عمومی هوش مصنوعی بدون ارجاع به متن منبع معتبر نخواهد بود.'
              : 'These questions replace superficial recall with source-anchored causal analysis, comparative trade-offs, and evidentiary justification. Generic AI answers without reading your specific uploaded document cannot accurately satisfy the grading rubric.'}
          </div>
        </div>

        {/* Group Selector Tabs */}
        {draftGroups.length > 1 && (
          <div className="px-6 py-2.5 bg-stone-50 border-b border-stone-200 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-xs font-semibold text-stone-500 mr-1">
              {isRtl ? 'گروه‌ها:' : 'Variants:'}
            </span>
            {draftGroups.map((group, idx) => {
              const isSelected = selectedGroupIndex === idx;
              return (
                <button
                  key={group.id || idx}
                  onClick={() => setSelectedGroupIndex(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#9D174D] text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  <Layers className="w-3 h-3 text-pink-300" />
                  <span>{group.group_name || `Group ${String.fromCharCode(65 + idx)}`}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10">
                    {group.questions?.length || 0} Qs
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Comparison Content List (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-stone-50/50">
          <div className="text-xs text-stone-500 flex items-center justify-between pb-1">
            <span>
              {isRtl
                ? `مشاهده سوالات پیشنهادی گروه: ${draftGroup?.group_name || 'Group A'}`
                : `Comparing Current vs. Proposed AI-Resistant Questions (${draftGroup?.group_name || 'Group A'})`}
            </span>
            <span className="font-semibold text-stone-700">
              {isRtl ? 'مجموع نمرات:' : 'Total Marks:'}{' '}
              {draftGroup?.questions?.reduce((sum: number, q: any) => sum + (q.marks || 0), 0) || 0} pts
            </span>
          </div>

          {draftGroup?.questions?.map((draftQ: any, index: number) => {
            const currentQ = currentGroup?.questions?.[index];

            return (
              <div
                key={draftQ.id || index}
                className="bg-white rounded-xl border border-stone-200 p-4 shadow-2xs space-y-3"
              >
                {/* Question Metadata Header */}
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-stone-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-6 h-6 rounded-md bg-[#9D174D] text-white font-bold text-xs flex items-center justify-center">
                      {draftQ.question_order || index + 1}
                    </span>
                    <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                      {draftQ.question_type}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      {isRtl ? 'سطح:' : 'Difficulty:'} {draftQ.difficulty}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                      Bloom: {draftQ.bloom_level}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-pink-50 text-[#9D174D] border border-pink-200">
                      {draftQ.marks} {isRtl ? 'نمره' : 'pts'}
                    </span>
                  </div>

                  <span className="text-[11px] text-stone-500 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                    <span>{draftQ.source_document_name}</span>
                    <span className="font-semibold text-stone-700">
                      ({isRtl ? 'صفحه' : 'Page'} {draftQ.source_page})
                    </span>
                  </span>
                </div>

                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Current Question */}
                  <div className="p-3 rounded-lg bg-stone-50 border border-stone-200/80 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                      {isRtl ? 'سوال فعلی (نسخه جاری):' : 'Current Question:'}
                    </div>
                    <p className="text-stone-800 font-medium leading-relaxed">
                      {currentQ?.question_text || (isRtl ? 'نامشخص' : 'N/A')}
                    </p>
                    {currentQ?.options && (
                      <div className="mt-2 space-y-1 pt-1 border-t border-stone-200/60">
                        {currentQ.options.map((opt: string, optIdx: number) => (
                          <div
                            key={optIdx}
                            className={`p-1.5 rounded text-[11px] ${
                              opt === currentQ.correct_answer
                                ? 'bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200'
                                : 'text-stone-600'
                            }`}
                          >
                            <span className="font-mono mr-1.5 font-bold">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Proposed AI-Resistant Analytical Question */}
                  <div className="p-3 rounded-lg bg-pink-50/40 border border-pink-200 space-y-1.5 ring-1 ring-pink-300/40">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#9D174D]">
                      <span>{isRtl ? 'سوال تحلیلی پیشنهادی (مستند و عمیق):' : 'Proposed AI-Resistant Question:'}</span>
                      <span className="px-1.5 py-0.2 rounded bg-pink-100 text-[#83133E] font-semibold text-[9px]">
                        {isRtl ? 'سطح عالی بلوم' : 'High-Order Bloom'}
                      </span>
                    </div>
                    <p className="text-stone-900 font-semibold leading-relaxed">
                      {draftQ.question_text}
                    </p>

                    {draftQ.options && (
                      <div className="mt-2 space-y-1 pt-1 border-t border-pink-200/60">
                        {draftQ.options.map((opt: string, optIdx: number) => {
                          const isCorrect = opt === draftQ.correct_answer;
                          return (
                            <div
                              key={optIdx}
                              className={`p-1.5 rounded text-[11px] ${
                                isCorrect
                                  ? 'bg-emerald-100/70 text-emerald-950 font-bold border border-emerald-300'
                                  : 'text-stone-700 bg-white/70 border border-stone-200/50'
                              }`}
                            >
                              <span className="font-mono mr-1.5 font-bold">
                                {String.fromCharCode(65 + optIdx)}.
                              </span>
                              {opt}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {!draftQ.options && draftQ.correct_answer && (
                      <div className="mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px]">
                        <span className="font-bold">
                          {isRtl ? 'پاسخ و معیار ارزیابی مستند:' : 'Model Answer & Rubric:'}{' '}
                        </span>
                        {draftQ.correct_answer}
                      </div>
                    )}
                  </div>
                </div>

                {/* Source Grounding & Evidence Citation */}
                <div className="p-2.5 rounded-lg bg-stone-100/60 border border-stone-200/60 text-[11px] text-stone-600 flex items-start gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                  <div className="leading-normal">
                    <span className="font-semibold text-stone-700">
                      {isRtl ? 'استناد و شواهد متنی:' : 'Document Evidence:'}{' '}
                    </span>
                    <span className="italic text-stone-800 font-mono text-[10.5px]">
                      "{draftQ.source_evidence?.slice(0, 160)}..."
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons Footer */}
        <div className="px-6 py-4 bg-white border-t border-stone-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-xs font-semibold cursor-pointer transition-all"
          >
            {isRtl ? 'انصراف و حفظ سوالات فعلی' : 'Cancel & Keep Current Questions'}
          </button>

          <button
            type="button"
            onClick={handleApplyClick}
            disabled={isApplying}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-700 via-pink-700 to-[#9D174D] hover:from-purple-800 hover:to-pink-800 text-white text-xs font-bold shadow-md cursor-pointer transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isApplying ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{isRtl ? 'در حال جایگزینی سوالات...' : 'Applying Questions...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-pink-200" />
                <span>
                  {isRtl
                    ? 'تأیید و جایگزینی سوالات در تمام گروه‌ها'
                    : 'Apply & Replace Questions in All Groups'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
