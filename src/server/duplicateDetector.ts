export interface QuestionCandidate {
  question_type: string;
  question_text: string;
  options?: string[] | null;
  correct_answer?: string;
  source_page?: number;
  source_evidence?: string;
  [key: string]: any;
}

export function normalizeQuestionText(text: string): string {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'«»[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeQuestionOptions(options: string[] | null | undefined): string[] {
  if (!options || !Array.isArray(options)) return [];
  return options
    .map((opt) => {
      const s = String(opt).replace(/^(\([A-Za-z0-9\u0621-\u064A]+\)|[A-Za-z0-9\u0621-\u064A]+[:.)\-]|➢)\s*/, '');
      return normalizeQuestionText(s);
    })
    .filter(Boolean)
    .sort();
}

export function getQuestionTokens(text: string): Set<string> {
  const stopwords = new Set([
    'what', 'which', 'how', 'why', 'when', 'where', 'who', 'is', 'are', 'was', 'were', 'the', 'a', 'an',
    'in', 'on', 'at', 'of', 'for', 'to', 'from', 'by', 'with', 'about', 'according', 'statement', 'accurately',
    'describes', 'function', 'primary', 'principle', 'demonstrated', 'section', 'analysis', 'true', 'false',
    'concise', 'sentences', 'explain', 'discuss', 'synthesize', 'evaluate', 'complete', 'following', 'based',
    'کدام', 'چه', 'چگونه', 'چرا', 'آیا', 'بر', 'اساس', 'طبق', 'متن', 'منبع', 'بخش', 'مطرح', 'شده', 'مفهوم',
    'اساسی', 'درستی', 'بیان', 'می', 'کند', 'صحیح', 'غلط', 'تحلیل', 'مورد', 'یکی', 'از', 'و', 'به', 'در', 'با'
  ]);
  const words = normalizeQuestionText(text).split(' ').filter((w) => w.length > 2 && !stopwords.has(w));
  return new Set(words);
}

export function computeJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function areQuestionsDuplicate(q1: QuestionCandidate, q2: QuestionCandidate): boolean {
  // 0. Explicit concept key match (if present)
  if (q1.concept_key && q2.concept_key && q1.concept_key === q2.concept_key) {
    return true;
  }

  // 1. Exact or near-exact question stem match after normalization
  const normText1 = normalizeQuestionText(q1.question_text);
  const normText2 = normalizeQuestionText(q2.question_text);
  if (normText1 === normText2) {
    return true;
  }

  // 2. Answer choices set overlap (detects reordered options or slightly perturbed choices for MCQs)
  // Note: Binary / True-False questions always have identical standard option choices (['True', 'False']) and must NOT be flagged as duplicates based on option overlap!
  const isBinaryQ = q1.question_type === 'true_false' || q2.question_type === 'true_false' || (q1.options && q1.options.length <= 2) || (q2.options && q2.options.length <= 2);
  if (!isBinaryQ && q1.options && q2.options && q1.options.length > 2 && q2.options.length > 2) {
    const opts1 = normalizeQuestionOptions(q1.options);
    const opts2 = normalizeQuestionOptions(q2.options);
    const set1 = new Set(opts1);
    const set2 = new Set(opts2);
    const optOverlap = computeJaccardSimilarity(set1, set2);
    let commonCount = 0;
    for (const opt of set1) {
      if (set2.has(opt)) commonCount++;
    }
    // If 2 or more options are identical across distinct questions (>= 0.40 overlap), flag as duplicate option set!
    if (commonCount >= 2 || optOverlap >= 0.40) {
      return true;
    }
  }

  // 3. Question stem keyword overlap (Jaccard similarity >= 0.70)
  const kw1 = getQuestionTokens(q1.question_text);
  const kw2 = getQuestionTokens(q2.question_text);
  const stemSim = computeJaccardSimilarity(kw1, kw2);
  if (stemSim >= 0.70) {
    return true;
  }

  // 4. Substantially equivalent correct answers (for non-binary questions)
  // 4. Substantially equivalent correct answers (for non-binary, non-essay questions)
  if (q1.correct_answer && q2.correct_answer) {
    const normAns1 = normalizeQuestionText(q1.correct_answer);
    const normAns2 = normalizeQuestionText(q2.correct_answer);
    const isBinaryAns =
      (normAns1 === 'true' || normAns1 === 'false' || normAns1 === 'صحیح' || normAns1 === 'غلط') &&
      (normAns2 === 'true' || normAns2 === 'false' || normAns2 === 'صحیح' || normAns2 === 'غلط');
    const isEssay = q1.question_type === 'essay' || q2.question_type === 'essay';

    if (!isBinaryAns && !isEssay) {
      if (normAns1 === normAns2) {
        return true;
      }
      const ansKw1 = getQuestionTokens(q1.correct_answer);
      const ansKw2 = getQuestionTokens(q2.correct_answer);
      const ansSim = computeJaccardSimilarity(ansKw1, ansKw2);
      if (ansSim >= 0.45) {
        return true;
      }
    } else if (isBinaryAns) {
      // For True/False, flag if question stems have high similarity
      if (stemSim >= 0.45) {
        return true;
      }
    }
  }

  // 5. Identical or substantially overlapping educational fact / source evidence sentence
  if (q1.source_evidence && q2.source_evidence) {
    const normEv1 = normalizeQuestionText(q1.source_evidence);
    const normEv2 = normalizeQuestionText(q2.source_evidence);
    if (normEv1 && normEv2) {
      if (normEv1 === normEv2) {
        return true;
      }
      const evKw1 = getQuestionTokens(q1.source_evidence);
      const evKw2 = getQuestionTokens(q2.source_evidence);
      const evSim = computeJaccardSimilarity(evKw1, evKw2);
      if (evSim >= 0.40) {
        return true;
      }
    }
  }

  return false;
}
