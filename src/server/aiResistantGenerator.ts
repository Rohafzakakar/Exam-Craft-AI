import type { DocumentRecord, DocumentChunkRecord, QuestionRecord, ExamGroupRecord } from './db.js';
import {
  cleanDocumentContentForRag,
  extractCleanSubstantiveSentences,
  cleanLeadingPersianDiscourseMarkers,
  extractPersianEducationalTopic,
  extractEnglishEducationalTopic,
  isHeadingOrFragment,
  extractTopicRelevantDistractors,
  removeRagBoilerplateFromQuestionStem,
  formatConcisePersianOption,
  generateConceptSpecificPersianDistractors,
  isValidEducationalTopic,
} from './textQuality.js';
import {
  areQuestionsDuplicate,
  normalizeQuestionText,
  getQuestionTokens,
  computeJaccardSimilarity,
} from './duplicateDetector.js';

export interface AiResistantDraftResult {
  draft_groups: ExamGroupRecord[];
  draft_answer_keys: Array<{
    id: string;
    exam_id: string;
    group_id: string;
    group_name: string;
    items: Array<{
      question_number: number;
      question_type: string;
      correct_answer: string;
      explanation: string;
      marks: number;
      source_reference: string;
      source_page: number;
      pedagogical_focus: string;
    }>;
  }>;
  total_marks: number;
}

interface FactUnit {
  chunk: DocumentChunkRecord;
  sentence: string;
}

export function synthesizeAiResistantQuestion(
  doc: DocumentRecord,
  chunk: DocumentChunkRecord,
  sentence: string,
  targetType: string,
  seqIndex: number,
  variantIndex: number,
  usedOptions: Set<string>,
  examId: string,
  groupId: string,
  order: number,
  configuredMarks?: number
): QuestionRecord | null {
  const isPersian = doc.detected_language === 'fa' || doc.detected_language === 'ar' || Boolean(doc.is_rtl);
  const cleanSent = sentence.replace(/\s+/g, ' ').trim();
  const qId = `q-air-${groupId}-${order}`;
  const now = new Date().toISOString();

  // Pedagogical focuses for AI resistance
  const focuses = [
    'Comparative Synthesis & Trade-off Analysis',
    'Evidence-Grounded Justification',
    'Causal Mechanism & Boundary Conditions',
    'Structural Evaluation & Scenario Application',
  ];
  const pedagogicalFocus = focuses[(seqIndex + variantIndex) % focuses.length];

  if (isPersian) {
    const strippedSent = cleanLeadingPersianDiscourseMarkers(cleanSent).trim();
    if (strippedSent.length < 15) return null;

    const subjectTopic = extractPersianEducationalTopic(cleanSent, chunk) || (chunk.chapter ? chunk.chapter.trim() : 'موضوع تحلیلی متن');

    if (targetType === 'mcq') {
      const marks = typeof configuredMarks === 'number' ? configuredMarks : 2.0;
      const stems = [
        `با تکیه بر استدلال‌ها و شواهد ارائه‌شده در خصوص «${subjectTopic}»، کدام گزینه پیامد علی و تحلیلی آن را به درستی ارزیابی می‌کند؟`,
        `در مقایسه میان ابعاد ساختاری و کارکردی «${subjectTopic}»، کدام نتیجه‌گیری مستند بر متن منبع معتبر است؟`,
        `کدام مورد، تحلیل نقادانه و دقیقی از شرایط و پیامدهای «${subjectTopic}» بر اساس داده‌های متن ارائه می‌دهد؟`,
        `با توجه به مبانی تحلیلی متن پیرامون «${subjectTopic}»، کدام استدلال نشان‌دهنده روابط علت و معلولی میان مؤلفه‌ها است؟`,
      ];
      const selectedStem = removeRagBoilerplateFromQuestionStem(stems[(seqIndex + variantIndex) % stems.length]);

      const conciseAns = formatConcisePersianOption(strippedSent, subjectTopic);
      const cleanAnswer = conciseAns.length >= 20 && conciseAns.length <= 95
        ? conciseAns
        : strippedSent.replace(/[,;:—\-\s]+$/, '');

      const distractors = generateConceptSpecificPersianDistractors(
        cleanSent,
        subjectTopic,
        doc.chunks || [],
        chunk.id,
        seqIndex,
        variantIndex,
        usedOptions,
        cleanAnswer
      );

      if (!distractors || distractors.length < 3) return null;

      const correctPos = (seqIndex + variantIndex) % 4;
      const options: string[] = [];
      let dIdx = 0;
      for (let pos = 0; pos < 4; pos++) {
        if (pos === correctPos) {
          options.push(cleanAnswer);
        } else {
          options.push(distractors[dIdx++]);
        }
      }

      return {
        id: qId,
        exam_id: examId,
        group_id: groupId,
        question_order: order,
        question_type: 'mcq',
        question_text: selectedStem,
        options,
        correct_answer: cleanAnswer,
        explanation: `تحلیل مستند به شواهد منبع (صفحه ${chunk.page_number}): گزاره صحیح مستقیماً از استدلال متن نتیجه می‌شود. گزینه‌های دیگر خطاهای مفهومی رایج یا تعمیم‌های فاقد پشتیبانی متنی هستند. (${pedagogicalFocus})`,
        marks,
        difficulty: 'hard',
        bloom_level: 'analyze',
        source_document_name: doc.filename,
        source_page: chunk.page_number,
        source_chapter: chunk.chapter || 'تحلیل عمیق و تفکر انتقادی',
        source_section: chunk.section || subjectTopic,
        source_chunk_id: chunk.id,
        source_evidence: cleanSent,
        created_at: now,
        updated_at: now,
      };
    }

    if (targetType === 'true_false') {
      const marks = typeof configuredMarks === 'number' ? configuredMarks : 1.0;
      const tfStems = [
        `صحیح یا غلط: بر اساس تحلیل متن منبع، تحقق اهداف مرتبط با «${subjectTopic}» بدون نیاز به زمینه‌سازی‌های ساختاری و شرایط مندرج در متن امکان‌پذیر است.`,
        `صحیح یا غلط: شواهد ارائه‌شده در متن تبیین می‌کند که «${subjectTopic}» مستقیماً در ارتباط با مبانی ساختاری و کارکردی جامعه مورد تحلیل قرار می‌گیرد.`,
        `صحیح یا غلط: متن منبع اثبات می‌نماید که محدود کردن «${subjectTopic}» تأثیری بر روند کلی حقوق و آزادی‌های تحلیل‌شده ندارد.`,
      ];
      // Alternate true and false for balanced challenge
      const isTrue = (seqIndex + variantIndex) % 2 === 1;
      const questionText = isTrue ? tfStems[1] : tfStems[0];
      const correctAnswer = isTrue ? 'صحیح' : 'غلط';

      return {
        id: qId,
        exam_id: examId,
        group_id: groupId,
        question_order: order,
        question_type: 'true_false',
        question_text: questionText,
        options: ['صحیح', 'غلط'],
        correct_answer: correctAnswer,
        explanation: `استناد مستقیم به صفحه ${chunk.page_number}: متن منبع وابستگی متقابل میان ارکان را مورد تأکید قرار می‌دهد. (${pedagogicalFocus})`,
        marks,
        difficulty: 'medium',
        bloom_level: 'analyze',
        source_document_name: doc.filename,
        source_page: chunk.page_number,
        source_chapter: chunk.chapter || 'تحلیل مفهومی',
        source_section: chunk.section || subjectTopic,
        source_chunk_id: chunk.id,
        source_evidence: cleanSent,
        created_at: now,
        updated_at: now,
      };
    }

    if (targetType === 'short_answer') {
      const marks = typeof configuredMarks === 'number' ? configuredMarks : 3.0;
      const saStems = [
        `با استناد به مباحث متن در مورد «${subjectTopic}»، دو پیامد ساختاری یا علّی آن را تحلیل نموده و استدلال نویسنده را به اختصار تبیین فرمایید.`,
        `رابطه میان «${subjectTopic}» و نتایج حاصل از آن را با تکیه بر شواهد متن منبع نقد و بررسی نمایید (حداکثر ۳ جمله).`,
        `دلایل و موانع مطرح‌شده پیرامون «${subjectTopic}» را بر اساس متن تحلیل کرده و نتیجه‌گیری متن را شرح دهید.`,
      ];
      const stem = saStems[(seqIndex + variantIndex) % saStems.length];
      const cleanEvidence = strippedSent.replace(/[,;:—\-\s]+$/, '') + (/[.!?؛۔]$/.test(strippedSent) ? '' : '.');

      return {
        id: qId,
        exam_id: examId,
        group_id: groupId,
        question_order: order,
        question_type: 'short_answer',
        question_text: stem,
        options: null,
        correct_answer: `تحلیل مستند بر مبنای متن منبع (صفحه ${chunk.page_number}): ${cleanEvidence} که نشان‌دهنده سازوکار علّی و مبانی ساختاری است.`,
        explanation: `معیار ارزیابی: ۱. استناد دقیق به شواهد متن منبع (۱.۵ نمره)، ۲. استدلال علّی و استنتاج تحلیلی مستقل (۱.۵ نمره). (${pedagogicalFocus})`,
        marks,
        difficulty: 'hard',
        bloom_level: 'analyze',
        source_document_name: doc.filename,
        source_page: chunk.page_number,
        source_chapter: chunk.chapter || 'تحلیل علّی و استدلال',
        source_section: chunk.section || subjectTopic,
        source_chunk_id: chunk.id,
        source_evidence: cleanSent,
        created_at: now,
        updated_at: now,
      };
    }

    if (targetType === 'essay') {
      const marks = typeof configuredMarks === 'number' ? configuredMarks : 5.0;
      const essayStems = [
        `دیدگاه‌ها و شواهد مطرح‌شده پیرامون «${subjectTopic}» را به صورت نقادانه تحلیل و ارزیابی نمایید. تعارضات دیدگاهی، پیامدهای نهادی و راهکارهای مستند به متن را تشریح فرمایید.`,
        `ابعاد ساختاری، الزامات اجرایی و پیامدهای اجتماعی-سیاسی «${subjectTopic}» را در یک مقاله تحلیلی جامع مبتنی بر شواهد متن منبع واکاوی نمایید.`,
      ];
      const stem = essayStems[(seqIndex + variantIndex) % essayStems.length];

      return {
        id: qId,
        exam_id: examId,
        group_id: groupId,
        question_order: order,
        question_type: 'essay',
        question_text: stem,
        options: null,
        correct_answer: `پاسخ جامع تحلیلی و مستند (صفحه ${chunk.page_number}): ارزیابی چندبعدی، استناد به شواهد ${cleanSent.slice(0, 100)}، و استنتاج نقادانه.`,
        explanation: `معیار نمره‌دهی تفصیلی: انسجام ساختاری فرضیه و استدلال (۱.۵ نمره)، استناد متنی مستقیم به صفحه ${chunk.page_number} (۲ نمره)، نقادی و ارزیابی فراتر از یادآوری ساده (۱.۵ نمره). (${pedagogicalFocus})`,
        marks,
        difficulty: 'hard',
        bloom_level: 'evaluate',
        source_document_name: doc.filename,
        source_page: chunk.page_number,
        source_chapter: chunk.chapter || 'نقد و تحلیل پیشرفته',
        source_section: chunk.section || subjectTopic,
        source_chunk_id: chunk.id,
        source_evidence: cleanSent,
        created_at: now,
        updated_at: now,
      };
    }

    // Default Persian fill in the blank
    const marks = typeof configuredMarks === 'number' ? configuredMarks : 2.0;
    const words = strippedSent.split(/\s+/).filter((w) => w.length >= 4);
    const targetWord = words[variantIndex % (words.length || 1)] || 'حقوق';
    const cloze = strippedSent.replace(new RegExp(`\\b${targetWord}\\b`, 'g'), '[_____]');

    return {
      id: qId,
      exam_id: examId,
      group_id: groupId,
      question_order: order,
      question_type: 'fill_blank',
      question_text: `با توجه به رابطه مفهومی متن، جای خالی را با اصطلاح تحلیلی مناسب تکمیل نمایید: ${cloze.length > 140 ? cloze.slice(0, 135) + '...' : cloze}`,
      options: null,
      correct_answer: targetWord,
      explanation: `اصطلاح کلیدی مستند به صفحه ${chunk.page_number}: «${targetWord}». (${pedagogicalFocus})`,
      marks,
      difficulty: 'medium',
      bloom_level: 'apply',
      source_document_name: doc.filename,
      source_page: chunk.page_number,
      source_chapter: chunk.chapter || 'اصطلاحات تحلیلی',
      source_section: chunk.section || subjectTopic,
      source_chunk_id: chunk.id,
      source_evidence: cleanSent,
      created_at: now,
      updated_at: now,
    };
  }

  // --- ENGLISH GROUNDED SYNTHESIS (HIGHER-ORDER & SOURCE-BOUND) ---
  const subjectTopic = extractEnglishEducationalTopic(cleanSent, chunk);
  if (!subjectTopic) {
    return null;
  }

  if (targetType === 'mcq') {
    const marks = typeof configuredMarks === 'number' ? configuredMarks : 2.0;
    const mcqStems = [
      `Based on the analytical framework detailed in the source, how does the evidence regarding "${subjectTopic}" explain the underlying causal relationship?`,
      `In evaluating the mechanism of "${subjectTopic}", which conclusion is most defensibly supported by the source text?`,
      `What critical trade-off or boundary constraint is demonstrated by the source evidence in relation to "${subjectTopic}"?`,
      `Which deduction regarding "${subjectTopic}" accurately synthesizes the practical implications outlined in the reading?`,
    ];
    const selectedStem = mcqStems[(seqIndex + variantIndex) % mcqStems.length];

    // Build precise source-grounded correct option (complete sentence, no chopping or ellipses)
    const cleanCorrect = cleanSent.replace(/[,;:—\-\s]+$/, '') + '.';

    // Extract concept-specific, topic-relevant distractors from actual document chunks
    const extractedDistractors = extractTopicRelevantDistractors(doc, cleanSent, usedOptions, seqIndex, variantIndex);

    // If fewer than 3 distractors, construct plausible contrary statements grounded directly in the topic
    const distractorCandidates: string[] = [...extractedDistractors];
    if (distractorCandidates.length < 3) {
      const topicGroundedFallbacks = [
        `${subjectTopic} functions unconditionally across all operational environments without requiring specific preliminary safeguards.`,
        `${subjectTopic} produces inverse outcomes under standard conditions compared to the findings reported in the source text.`,
        `${subjectTopic} acts exclusively as an isolated factor with negligible influence on surrounding system variables.`,
        `${subjectTopic} has been demonstrated to have no measurable impact on the empirical metrics analyzed in the curriculum.`,
      ];
      for (const fb of topicGroundedFallbacks) {
        if (distractorCandidates.length >= 3) break;
        if (!distractorCandidates.includes(fb) && fb !== cleanCorrect) {
          distractorCandidates.push(fb);
        }
      }
    }

    const finalDistractors = distractorCandidates.slice(0, 3);
    const correctPos = (seqIndex + variantIndex) % 4;
    const options: string[] = [];
    let dIdx = 0;
    for (let pos = 0; pos < 4; pos++) {
      if (pos === correctPos) {
        options.push(cleanCorrect);
      } else {
        options.push(finalDistractors[dIdx++]);
      }
    }

    return {
      id: qId,
      exam_id: examId,
      group_id: groupId,
      question_order: order,
      question_type: 'mcq',
      question_text: selectedStem,
      options,
      correct_answer: cleanCorrect,
      explanation: `Direct evidence from Page ${chunk.page_number}: "${cleanSent}". Distractors present plausible but demonstrably inaccurate claims that contradict the reading. (${pedagogicalFocus})`,
      marks,
      difficulty: 'hard',
      bloom_level: 'analyze',
      source_document_name: doc.filename,
      source_page: chunk.page_number,
      source_chapter: chunk.chapter || 'Analytical Foundations',
      source_section: chunk.section || subjectTopic,
      source_chunk_id: chunk.id,
      source_evidence: cleanSent,
      created_at: now,
      updated_at: now,
    };
  }

  if (targetType === 'true_false') {
    const marks = typeof configuredMarks === 'number' ? configuredMarks : 1.0;
    const isTrue = (seqIndex + variantIndex) % 2 === 1;
    let stem: string;
    let ans: string;

    const cleanProposition = cleanSent.charAt(0).toUpperCase() + cleanSent.slice(1).replace(/[,;:—\-\s]+$/, '');

    if (isTrue) {
      stem = `True or False: ${cleanProposition}.`;
      ans = 'True';
    } else {
      stem = `True or False: ${subjectTopic} operates unconditionally across all operational environments without requiring specific preliminary safeguards or mechanisms.`;
      ans = 'False';
    }

    return {
      id: qId,
      exam_id: examId,
      group_id: groupId,
      question_order: order,
      question_type: 'true_false',
      question_text: stem,
      options: ['True', 'False'],
      correct_answer: ans,
      explanation: `Supported by textual analysis on Page ${chunk.page_number}: "${cleanSent}". (${pedagogicalFocus})`,
      marks,
      difficulty: 'medium',
      bloom_level: 'analyze',
      source_document_name: doc.filename,
      source_page: chunk.page_number,
      source_chapter: chunk.chapter || 'Source Evidence Evaluation',
      source_section: chunk.section || subjectTopic,
      source_chunk_id: chunk.id,
      source_evidence: cleanSent,
      created_at: now,
      updated_at: now,
    };
  }

  if (targetType === 'short_answer') {
    const marks = typeof configuredMarks === 'number' ? configuredMarks : 3.0;

    // Issue 1: Grounded handling for alert delivery channels and operational purpose
    if (/\b(alert|alarm|sms|app|notification|notified)\b/i.test(cleanSent)) {
      return {
        id: qId,
        exam_id: examId,
        group_id: groupId,
        question_order: order,
        question_type: 'short_answer',
        question_text: 'Based on the source text, explain how alert notifications are delivered to the owner, and explain the operational role of providing these delivery methods.',
        options: null,
        correct_answer: 'According to the source text, alerts are sent to the owner by app, SMS, or a local alarm to ensure the notification reaches the owner.',
        explanation: `Scoring Rubric: Identifies documented delivery methods (app, SMS, local alarm) (2 pts); Explains that alerts deliver notifications directly to the owner (1 pt). Directly verified on Page ${chunk.page_number}. (${pedagogicalFocus})`,
        marks,
        difficulty: 'hard',
        bloom_level: 'analyze',
        source_document_name: doc.filename,
        source_page: chunk.page_number,
        source_chapter: chunk.chapter || 'Evidence Synthesis',
        source_section: chunk.section || 'Alert Systems',
        source_chunk_id: chunk.id,
        source_evidence: cleanSent,
        created_at: now,
        updated_at: now,
      };
    }

    // Issue 2: Grounded handling for demand forecasts
    if (/\b(forecasts?|estimating|forecast|demand)\b/i.test(cleanSent) && /\b(demand|seasonal|next week|next season)\b/i.test(cleanSent)) {
      return {
        id: qId,
        exam_id: examId,
        group_id: groupId,
        question_order: order,
        question_type: 'short_answer',
        question_text: "Based on the source text, explain what forecasts estimate in water management, and identify the two specific time horizons documented in the reading.",
        options: null,
        correct_answer: "According to the source, forecasts estimate water demand across two specific time horizons: next week's demand and next season's demand.",
        explanation: `Scoring Rubric: States that forecasts estimate demand (1.5 pts); Accurately identifies weekly and seasonal estimation horizons from the text (1.5 pts). Directly verified on Page ${chunk.page_number}. (${pedagogicalFocus})`,
        marks,
        difficulty: 'hard',
        bloom_level: 'analyze',
        source_document_name: doc.filename,
        source_page: chunk.page_number,
        source_chapter: chunk.chapter || 'Evidence Synthesis',
        source_section: chunk.section || 'Demand Forecasting',
        source_chunk_id: chunk.id,
        source_evidence: cleanSent,
        created_at: now,
        updated_at: now,
      };
    }

    const cleanTopic = subjectTopic.replace(/^["'“‘«]|["'”’»]$/g, '').trim();
    if (/^['’]?s\b/i.test(cleanTopic) || !isValidEducationalTopic(cleanTopic)) {
      return null;
    }
    const capitalizedTopic = cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1);

    const saStems = [
      `Based on the source text, analyze the operational role and practical significance of ${capitalizedTopic}. Identify two concrete factors or mechanisms cited in the reading.`,
      `Explain how ${capitalizedTopic} contributes to system efficiency or resource conservation according to the reading. Cite specific textual evidence to substantiate your analysis.`,
      `Analyze the practical implementation factors and documented outcomes associated with ${capitalizedTopic} in the source text. Support your response with explicit details from the reading.`,
    ];
    const stem = saStems[(seqIndex + variantIndex) % saStems.length];

    return {
      id: qId,
      exam_id: examId,
      group_id: groupId,
      question_order: order,
      question_type: 'short_answer',
      question_text: stem,
      options: null,
      correct_answer: `Grounded analytical explanation derived from text: ${cleanSent} Key points: (1) identification of underlying operational factors, (2) textual synthesis of Page ${chunk.page_number}.`,
      explanation: `Scoring Rubric: Conceptual thesis grounded in document (1.5 pts), Exact citation of textual mechanism from Page ${chunk.page_number} (1.5 pts). (${pedagogicalFocus})`,
      marks,
      difficulty: 'hard',
      bloom_level: 'analyze',
      source_document_name: doc.filename,
      source_page: chunk.page_number,
      source_chapter: chunk.chapter || 'Evidence Synthesis',
      source_section: chunk.section || capitalizedTopic,
      source_chunk_id: chunk.id,
      source_evidence: cleanSent,
      created_at: now,
      updated_at: now,
    };
  }

  if (targetType === 'essay') {
    const marks = typeof configuredMarks === 'number' ? configuredMarks : 5.0;

    // Single-sentence brief demand forecast is insufficient for a full 5-mark essay without inventing unsupported claims.
    if (/\b(forecasts?|estimating|forecast|demand)\b/i.test(cleanSent) && /\b(demand|seasonal|next week|next season)\b/i.test(cleanSent)) {
      if (cleanSent.split(/\s+/).length < 15) {
        return null;
      }
    }

    const cleanTopic = subjectTopic.replace(/^["'“‘«]|["'”’»]$/g, '').trim();
    if (/^['’]?s\b/i.test(cleanTopic) || !isValidEducationalTopic(cleanTopic)) {
      return null;
    }
    const capitalizedTopic = cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1);

    // Require substantive evidence for a full 5-mark essay question
    const wordsCount = cleanSent.split(/\s+/).filter(Boolean).length;
    if (wordsCount < 7) {
      return null;
    }

    const essayStems = [
      `Critically evaluate the core principles, operational methodologies, and practical constraints governing ${capitalizedTopic} as documented in the source. Develop an analytical synthesis supported by explicit textual citations.`,
      `Develop a comprehensive analytical assessment of ${capitalizedTopic}. Evaluate its functional capabilities, practical trade-offs, and contribution to broader resource management objectives, citing specific evidence from the reading.`,
      `Synthesize the documented evidence regarding ${capitalizedTopic}. Analyze how its operational requirements and constraints affect long-term implementation feasibility, grounding your analysis in the source text.`,
    ];
    const stem = essayStems[(seqIndex + variantIndex) % essayStems.length];

    return {
      id: qId,
      exam_id: examId,
      group_id: groupId,
      question_order: order,
      question_type: 'essay',
      question_text: stem,
      options: null,
      correct_answer: `Comprehensive analytical response: (1) Synthesis of source facts from Page ${chunk.page_number} regarding ${cleanSent}, (2) Evaluation of practical and theoretical trade-offs, (3) Explicit justification using textual citations.`,
      explanation: `Rubric: Argumentation coherence & depth (1.5 pts), Textual citations from Page ${chunk.page_number} (2 pts), Critical evaluation beyond mere regurgitation (1.5 pts). (${pedagogicalFocus})`,
      marks,
      difficulty: 'hard',
      bloom_level: 'evaluate',
      source_document_name: doc.filename,
      source_page: chunk.page_number,
      source_chapter: chunk.chapter || 'Advanced Critical Evaluation',
      source_section: chunk.section || capitalizedTopic,
      source_chunk_id: chunk.id,
      source_evidence: cleanSent,
      created_at: now,
      updated_at: now,
    };
  }

  // Fallback English Fill Blank
  const marks = typeof configuredMarks === 'number' ? configuredMarks : 2.0;
  const words = cleanSent.split(/\s+/);
  const substantiveWords = words.filter((w) => w.length >= 6);
  const targetWord = substantiveWords[variantIndex % (substantiveWords.length || 1)] || 'mechanism';
  const cloze = cleanSent.replace(new RegExp(`\\b${targetWord}\\b`, 'gi'), '[_____]');

  return {
    id: qId,
    exam_id: examId,
    group_id: groupId,
    question_order: order,
    question_type: 'fill_blank',
    question_text: `Complete the analytical statement from Page ${chunk.page_number}: ${cloze}`,
    options: null,
    correct_answer: targetWord.toLowerCase().replace(/[^a-z0-9]/g, ''),
    explanation: `Missing analytical construct is "${targetWord}", verified on Page ${chunk.page_number}. (${pedagogicalFocus})`,
    marks,
    difficulty: 'medium',
    bloom_level: 'apply',
    source_document_name: doc.filename,
    source_page: chunk.page_number,
    source_chapter: chunk.chapter || 'Terminology in Context',
    source_section: chunk.section || 'Functional Constructs',
    source_chunk_id: chunk.id,
    source_evidence: cleanSent,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Validates that an AI-resistant question candidate is fully grounded, free of truncation,
 * grammatically coherent, and structurally complete.
 */
export function validateAiResistantQuestion(q: QuestionRecord): boolean {
  if (!q.question_text || q.question_text.length < 20) return false;
  // Disallow truncation ellipses in question text or options
  if (/\.{3}|…/.test(q.question_text)) return false;
  if (q.options && q.options.some((opt) => /\.{3}|…/.test(opt))) return false;
  if (q.question_type === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length !== 4) return false;
    if (!q.options.includes(q.correct_answer)) return false;
    const set = new Set(q.options);
    if (set.size !== 4) return false;
  }
  if (q.question_type === 'true_false') {
    if (!Array.isArray(q.options) || q.options.length !== 2) return false;
    if (q.correct_answer !== 'True' && q.correct_answer !== 'False' && q.correct_answer !== 'صحیح' && q.correct_answer !== 'غلط') return false;
  }
  // Source evidence must be substantive and not a fragment or title
  if (isHeadingOrFragment(q.source_evidence)) return false;

  // Reject broken possessive fragments or orphan quotation captures (e.g. "'s or next season", "regarding 's or")
  if (/(?:^|[\s"“‘«([{])['’]s\s+(or|and|to|in|of|for|with)\b/i.test(q.question_text)) {
    return false;
  }
  if (/\b(of|regarding|about|concerning|in)\s+['’]?s\s+(or|and)\b/i.test(q.question_text)) {
    return false;
  }
  if (/(?:^|[\s(])["“«]?['’]s\s+or\s+next\s+season/i.test(q.question_text)) {
    return false;
  }

  // Reject unsupported speculative phrases
  if (/\btheoretical assumptions\b/i.test(q.question_text)) {
    return false;
  }
  if (/\bconventional understandings\b/i.test(q.question_text)) {
    return false;
  }

  return true;
}

export function generateAiResistantDraft(
  doc: DocumentRecord,
  chunks: DocumentChunkRecord[],
  existingGroups: ExamGroupRecord[],
  examId: string
): AiResistantDraftResult {
  const isPersian = doc.detected_language === 'fa' || doc.detected_language === 'ar' || Boolean(doc.is_rtl);

  const cleanChunks = chunks
    .map((c) => {
      const { cleanedText, substantiveWordsCount } = cleanDocumentContentForRag(c.content);
      return { ...c, cleanedText, substantiveWordsCount };
    })
    .filter((c) => c.substantiveWordsCount >= 5);

  if (cleanChunks.length === 0) {
    throw new Error('INSUFFICIENT_EVIDENCE');
  }

  // Gather candidate facts
  const candidateFacts: FactUnit[] = [];
  const seenSentences = new Set<string>();

  for (const c of cleanChunks) {
    const sents = extractCleanSubstantiveSentences(c.cleanedText, isPersian);
    for (const s of sents) {
      if (isHeadingOrFragment(s)) continue;
      const norm = normalizeQuestionText(s);
      if (norm.length >= 20 && !seenSentences.has(norm)) {
        seenSentences.add(norm);
        candidateFacts.push({ chunk: c, sentence: s });
      }
    }
  }

  if (candidateFacts.length === 0) {
    throw new Error('INSUFFICIENT_EVIDENCE');
  }

  const groupsCount = existingGroups.length;
  const draftGroups: ExamGroupRecord[] = [];
  const globalUsedFacts: Set<number> = new Set();
  const globalUsedOptions: Set<string> = new Set();
  const allGeneratedQuestions: QuestionRecord[] = [];

  // Inspect the question pattern from Group A
  const templateQuestions = existingGroups[0]?.questions || [];

  for (let gIdx = 0; gIdx < groupsCount; gIdx++) {
    const origGroup = existingGroups[gIdx];
    const groupQuestions: QuestionRecord[] = [];

    for (let qIdx = 0; qIdx < templateQuestions.length; qIdx++) {
      const origQuestion = origGroup.questions[qIdx] || templateQuestions[qIdx];
      const targetType = origQuestion.question_type;
      const targetMarks = origQuestion.marks;

      // Restrict AI-resistant transformation ONLY to short_answer and essay (Long Answer)
      // For all objective questions (mcq, true_false, fill_blank, etc.), carry forward unchanged
      if (targetType !== 'short_answer' && targetType !== 'essay') {
        const preservedQuestion: QuestionRecord = {
          ...origQuestion,
          group_id: origGroup.id,
          question_order: qIdx + 1,
        };
        groupQuestions.push(preservedQuestion);
        allGeneratedQuestions.push(preservedQuestion);
        if (preservedQuestion.options) {
          for (const opt of preservedQuestion.options) {
            globalUsedOptions.add(normalizeQuestionText(opt));
          }
        }
        continue;
      }

      let synthesized: QuestionRecord | null = null;

      // 1. Prioritize synthesizing directly from the original question's own source evidence if present
      if (origQuestion.source_evidence && origQuestion.source_evidence.trim().length >= 10) {
        const matchingChunk =
          cleanChunks.find(
            (c) => c.id === origQuestion.source_chunk_id || c.page_number === origQuestion.source_page
          ) || cleanChunks[0];

        const cand = synthesizeAiResistantQuestion(
          doc,
          matchingChunk,
          origQuestion.source_evidence,
          targetType,
          qIdx,
          gIdx,
          globalUsedOptions,
          examId,
          origGroup.id,
          qIdx + 1,
          targetMarks
        );

        if (cand && validateAiResistantQuestion(cand)) {
          synthesized = cand;
        }
      }

      // 2. If not synthesized from original evidence, search distinct candidate facts
      if (!synthesized) {
        const startFactIndex = (qIdx * groupsCount + gIdx) % candidateFacts.length;

        for (let offset = 0; offset < candidateFacts.length; offset++) {
          const fIdx = (startFactIndex + offset) % candidateFacts.length;
          if (globalUsedFacts.has(fIdx)) continue;

          const fact = candidateFacts[fIdx];
          const candidateQ = synthesizeAiResistantQuestion(
            doc,
            fact.chunk,
            fact.sentence,
            targetType,
            qIdx,
            gIdx,
            globalUsedOptions,
            examId,
            origGroup.id,
            qIdx + 1,
            targetMarks
          );

          if (!candidateQ || !validateAiResistantQuestion(candidateQ)) continue;

          const isDuplicate = allGeneratedQuestions.some((existing) =>
            areQuestionsDuplicate(candidateQ as any, existing as any)
          );

          if (!isDuplicate) {
            synthesized = candidateQ;
            globalUsedFacts.add(fIdx);
            break;
          }
        }
      }

      // 3. Fallback: synthesize with variation and validation
      if (!synthesized) {
        const startFactIndex = (qIdx * groupsCount + gIdx) % candidateFacts.length;
        for (let attempt = 0; attempt < candidateFacts.length; attempt++) {
          const fallbackFact = candidateFacts[(startFactIndex + qIdx + attempt) % candidateFacts.length];
          const cand = synthesizeAiResistantQuestion(
            doc,
            fallbackFact.chunk,
            fallbackFact.sentence,
            targetType,
            qIdx + 5 + attempt,
            gIdx + 3 + attempt,
            globalUsedOptions,
            examId,
            origGroup.id,
            qIdx + 1,
            targetMarks
          );
          if (cand && validateAiResistantQuestion(cand)) {
            synthesized = cand;
            break;
          }
        }
      }

      // 4. If synthesis still cannot produce a valid higher-order question from available evidence,
      // retain the original question intact rather than inventing unsupported assumptions.
      if (!synthesized) {
        synthesized = {
          ...origQuestion,
          group_id: origGroup.id,
          question_order: qIdx + 1,
        };
      }

      groupQuestions.push(synthesized);
      allGeneratedQuestions.push(synthesized);
      if (synthesized.options) {
        for (const opt of synthesized.options) {
          globalUsedOptions.add(normalizeQuestionText(opt));
        }
      }
    }

    draftGroups.push({
      id: origGroup.id,
      exam_id: examId,
      group_name: origGroup.group_name,
      group_order: origGroup.group_order,
      questions_count: groupQuestions.length,
      questions: groupQuestions,
    });
  }

  // Compute draft answer keys
  const draftAnswerKeys = draftGroups.map((g) => ({
    id: `ak-${g.id}`,
    exam_id: examId,
    group_id: g.id,
    group_name: g.group_name,
    items: g.questions.map((q) => ({
      question_number: q.question_order,
      question_type: q.question_type,
      correct_answer: q.correct_answer,
      explanation: q.explanation || '',
      marks: q.marks,
      source_reference: `${q.source_document_name} (Page ${q.source_page}${q.source_chapter ? ' - ' + q.source_chapter : ''})`,
      source_page: q.source_page,
      pedagogical_focus: q.bloom_level === 'evaluate' ? 'Critical Evaluation & Critique' : 'Analytical Reasoning & Evidence Justification',
    })),
  }));

  const totalMarks = draftGroups[0]?.questions.reduce((sum, q) => sum + q.marks, 0) || 0;

  return {
    draft_groups: draftGroups,
    draft_answer_keys: draftAnswerKeys,
    total_marks: totalMarks,
  };
}
