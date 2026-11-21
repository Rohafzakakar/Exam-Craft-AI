import type { DocumentRecord, DocumentChunkRecord } from './db.js';
import { normalizeQuestionText, getQuestionTokens, computeJaccardSimilarity } from './duplicateDetector.js';

function decodeXmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/gi, (match, hex) => {
      try {
        const codePoint = parseInt(hex, 16);
        if (
          Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10FFFF &&
          !(codePoint >= 0xD800 && codePoint <= 0xDFFF)
        ) {
          return String.fromCodePoint(codePoint);
        }
        return match;
      } catch {
        return match;
      }
    })
    .replace(/&#([0-9]+);/g, (match, dec) => {
      try {
        const codePoint = parseInt(dec, 10);
        if (
          Number.isInteger(codePoint) &&
          codePoint >= 0 &&
          codePoint <= 0x10FFFF &&
          !(codePoint >= 0xD800 && codePoint <= 0xDFFF)
        ) {
          return String.fromCodePoint(codePoint);
        }
        return match;
      } catch {
        return match;
      }
    });
}

/**
 * Sanitizes educational text by eliminating Unicode replacement characters, soft hyphens,
 * private-use glyph codes, and non-printable control characters that render as square boxes (□).
 */
export function sanitizeEducationalText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\uFFFD/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\u00AD/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\uE000-\uF8FF]/g, '')
    .replace(/[\uFFF0-\uFFFF]/g, '')
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[\u200B\u200D]/g, '')
    .replace(/[•●*➢\t]/g, ' ')
    .replace(/\[\d+(?:[,\s–-]+\d+)*\]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Checks whether a sentence is an acknowledgement, dedication, declaration,
 * supervisor/family gratitude note, self-referential report boilerplate, or citation/URL line.
 */
export function isNonSubstantiveOrAckSentence(text: string): boolean {
  if (!text) return true;
  const t = text.trim();

  // Gratitude, acknowledgements, dedications, declarations, thesis/project cover boilerplate
  if (
    /\b(would like to (?:thank|express|acknowledge|extend)|sincere (?:thanks|gratitude|appreciation)|heartfelt (?:thanks|gratitude)|deeply grateful|special thanks (?:go )?to|indebted to|thank(?:s|ing)? (?:my|our|the) (?:supervisor|advisor|mentor|professor|lecturer|parents|family|friends|colleagues|almighty|god)|dedicated to|in partial fulfillment of (?:the )?requirements|hereby declare that|i certify that this (?:project|thesis|report)|this (?:project|thesis|dissertation)(?: report)? (?:is|was) submitted (?:by|to|in)|constant support (?:and|throughout|during)|without (?:whose|his|her|their) (?:support|guidance|help|encouragement)|valuable (?:insights|guidance|feedback|suggestions) (?:and|throughout|during|from))\b/i.test(
      t
    )
  ) {
    return true;
  }

  if (/^(?:i|we)\s+(?:would like|wish|am grateful|are grateful|thank|dedicate|hereby|sincerely|acknowledge)\b/i.test(t)) {
    return true;
  }

  // Self-referential document / chapter / figure / table meta-prose
  if (
    /^(?:this|the)\s+(?:report|chapter|paper|document|article|section|study|module|manual|thesis|project|book|unit)\s+(?:reviews|presents|examines|discusses|describes|provides|explains|outlines|summarizes|covers|focuses on|introduces|highlights|concludes|aims to)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(?:in this|the (?:next|following|previous|above|below|remainder of this))\s+(?:report|chapter|section|paper|document|study|thesis|project|work|table|figure)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(?:chapter|section|part|unit)\s+\d+(?:\.\d+)*\s+(?:discusses|presents|introduces|covers|explains|outlines|describes|summarizes|focuses|examines|reviews)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(?:as (?:shown|illustrated|depicted|summarized|listed|seen) in (?:figure|table|diagram|chart|section|chapter)|for (?:more|further) details,?\s+(?:see|refer to)|below is (?:a|the) (?:summary|list|table|figure)|the following (?:table|figure|list|chart) (?:shows|illustrates|summarizes))\b/i.test(
      t
    )
  ) {
    return true;
  }

  // URLs, emails, DOIs, ISBN/ISSN, bibliographic lines
  if (/https?:\/\/|www\.|\bdoi:\s*\S+|\bis[bs]n\b/i.test(t)) {
    return true;
  }
  if (/^[A-Z][a-z]+,\s+[A-Z]\.\s*(?:\(\d{4}\)|et al\.)/.test(t)) {
    return true;
  }

  return false;
}

/**
 * Checks if an English sentence begins with an unresolved third-person or demonstrative pronoun
 * lacking an in-sentence referent (e.g., "His insights...", "It provides...", "They allow...").
 */
export function hasUnresolvedLeadingPronoun(text: string): boolean {
  if (!text) return true;
  const t = text.trim();
  if (/^(?:he|she|it|they|we|you|i|his|her|their|its|my|our|your)\b/i.test(t)) {
    return true;
  }
  if (
    /^(?:this|that|these|those|such)\s+(?:is|are|was|were|can|could|may|might|will|would|should|has|have|had|helps?|enables?|allows?|provides?|makes?|shows?|means?|indicates?|suggests?|demonstrates?|highlights?|insights?|findings?|results?|approach|method|system|process|technique|tool|feature|work|effort|study)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Detects generic, non-testable platitudes lacking a concrete factual mechanism or causal clause.
 */
export function isVagueGenericPlatitude(text: string): boolean {
  if (!text) return true;
  const t = text.trim();
  const hasMechanismClause = /\b(?:because|by\s+[a-z]+ing|via|through|when|whereas|such as|which\s+(?:prevents?|enables?|reduces?|increases?|converts?|validates?|regulates?|generates?|stores?))\b/i.test(t);
  if (hasMechanismClause) return false;

  return /\b(?:plays? (?:a|an) (?:key|major|vital|crucial|important|significant) role|is (?:very )?(?:important|essential|crucial|useful|helpful|good|necessary|beneficial) (?:for|in|to)|many (?:benefits|advantages|features|users)|various (?:tools|methods|technologies|aspects|features|ways)|aims? to (?:improve|provide|create|help|make)|designed to be (?:user[- ]friendly|easy|simple|helpful)|in (?:today's|modern) (?:world|society|era|age)|generally speaking|needless to say|it is (?:important|worth|clear) to note)\b/i.test(
    t
  );
}

/**
 * Validates whether a candidate string is a coherent, complete educational concept.
 * Rejects reporting verbs, survey organizations, pronouns, generic meta-nouns, relative clauses, and broken fragments.
 */
export function isValidEducationalTopic(topic: string): boolean {
  if (!topic || typeof topic !== 'string') return false;
  const t = topic.trim();
  if (t.length < 3 || t.length > 90) return false;

  // Reject reporting verbs / attribution
  if (/\b(warns?|warned|reports?|reported|estimates?|estimated|finds?|found|shows?|showed|indicated?|stated?|noted?|observed?|revealed?|concludes?|concluded|suggests?|suggested)\b/i.test(t)) {
    return false;
  }

  // Reject organizations / agencies
  if (/\b(UNICEF|FAO|WHO|UNESCO|UNDP|UNHCR|WFP|World Bank|USAID)\b/i.test(t)) {
    return false;
  }

  // Reject acknowledgement / gratitude / supervisor vocabulary
  if (/\b(acknowledg\w*|gratitude|dedication|fulfillment|supervisor|advisor|mentor|hereby|thanks)\b/i.test(t)) {
    return false;
  }

  // Reject relative pronouns / conjunctions
  if (/\b(that|which|who|whom|whose|whereas|while|because|although)\b/i.test(t)) {
    return false;
  }

  // Reject prepositions, articles, pronouns, possessives, or vague quantifiers at start
  if (
    /^(in|at|on|under|across|from|during|within|by|for|with|according to|the|a|an|this|that|these|those|he|she|it|they|we|you|i|his|her|its|their|our|my|your|such|some|many|several|various|other|another|both|each|every|either|neither|all|most|few|none|anyone|someone|everyone|nobody|something|nothing|everything)\s+/i.test(
      t
    )
  ) {
    return false;
  }

  // Reject bare generic meta-nouns or vague 1-word topics lacking conceptual specificity
  if (
    /^(insights?|guidance|feedback|gratitude|thanks|encouragement|support|results?|findings?|conclusions?|introduction|overview|summary|background|methodology|objectives?|purpose|scope|details?|aspects?|factors?|reasons?|benefits?|challenges?|issues?|problems?|solutions?|advantages?|disadvantages?|limitations?|future work|chapter|section|report|paper|study|project|work|author|authors|supervisor|team|students?|users?|people|things?|items?|data|information|system|systems|application|applications|process|processes|method|methods|approach|approaches|implementation|evaluation|testing|analysis|design)$/i.test(
      t
    )
  ) {
    return false;
  }

  // Reject numbers or statistics at start
  if (/^(\d+(\.\d+)?%?|\d+\s+in\s+\d+|several|many|few|some)\b/i.test(t)) {
    return false;
  }

  // Reject page references, filenames, or generic document containers (e.g. "Water_Monitoring Page 1", "Page 1", "Chapter 2")
  if (/\b(page\s+\d+|chapter\s+\d+|section\s+\d+)\b/i.test(t)) {
    return false;
  }
  if (isGenericChapterOrSection(t)) {
    return false;
  }
  if (/^[A-Za-z0-9_\-\s]+\s+Page\s+\d+$/i.test(t)) {
    return false;
  }

  // Must not be an imperative action
  if (isImperativeOrActionPhrase(t)) return false;

  // Reject broken possessive suffixes or orphan contractions (e.g. "'s or next season", "s or next season", "'s demand")
  if (/^['’]?s?\s+(or|and|to|in|of|for|with)\b/i.test(t) || /^['’]s\b/i.test(t)) {
    return false;
  }
  if (/^['’"“]|['’"”]$/.test(t)) {
    return false;
  }

  // Must not be a generic dummy subject or heading label
  if (isDanglingOrIncompleteFragment(t)) return false;
  if (isHeadingOrTitleLabel(t)) return false;

  return true;
}

export function cleanLeadingPersianDiscourseMarkers(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  const markerPattern = /^(همچنین|بنابراین|در نتیجه|علاوه بر این|افزون بر این|از این رو|از سوی دیگر|به طور کلی|در واقع|شایان ذکر است که|لازم به ذکر است که|گفتنی است که|با این حال|بدین ترتیب|به این ترتیب|بر همین اساس|در همین راستا|بر این اساس|از این جهت)[،,\s]+/i;
  let prev = '';
  while (cleaned !== prev && markerPattern.test(cleaned)) {
    prev = cleaned;
    cleaned = cleaned.replace(markerPattern, '').trim();
  }
  return cleaned;
}

export function extractPersianEducationalTopic(sentence: string, chunk: DocumentChunkRecord): string | null {
  const stripped = cleanLeadingPersianDiscourseMarkers(sentence);
  if (!stripped || stripped.length < 12) {
    return null;
  }

  // 1. Quoted terms take precedence: «...» or "..."
  const quoteMatch = stripped.match(/[«"']([^»"']{3,50})[»"']/);
  if (quoteMatch) {
    const candidate = quoteMatch[1].trim();
    if (candidate.length >= 3 && !/^(همچنین|بنابراین|در نتیجه|علاوه بر این)$/.test(candidate)) {
      return candidate;
    }
  }

  // 2. Extract substantive clause
  const clauses = stripped
    .split(/[،؛,.:]/)
    .map((c) => cleanLeadingPersianDiscourseMarkers(c.trim()))
    .filter((c) => c.length >= 6);

  const isInvalidFragment = (c: string) => {
    const trimmed = c.trim();
    if (trimmed.length < 5) return true;
    if (
      /^(همچنین|بنابراین|در نتیجه|علاوه بر این|افزون بر این|از این رو|از سوی دیگر|به طور کلی|در واقع|با این حال|به عنوان مثال|به طور مثال|طبق بررسی‌ها|بر اساس این گزارش|لازم به ذکر است|شایان ذکر است|بدین ترتیب|در همین راستا|بر همین اساس)$/.test(
        trimmed
      )
    ) {
      return true;
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 1 && words[0].length < 5) return true;
    return false;
  };

  for (const clause of clauses) {
    if (!isInvalidFragment(clause)) {
      let topic = clause;
      if (topic.length > 55) {
        const lastSpace = topic.lastIndexOf(' ', 50);
        topic = lastSpace > 20 ? topic.slice(0, lastSpace).trim() : topic.slice(0, 50).trim();
      }
      topic = topic.replace(/[,;:—\-\s]+$/, '');
      if (topic.length >= 5 && !isInvalidFragment(topic)) {
        return topic;
      }
    }
  }

  // 3. Fallback to chunk.section or chunk.chapter if meaningful and educational
  if (
    chunk.section &&
    chunk.section.length >= 5 &&
    !/^Page\s+\d+/i.test(chunk.section) &&
    !/^\d+$/i.test(chunk.section)
  ) {
    return chunk.section.trim();
  }
  if (
    chunk.chapter &&
    chunk.chapter.length >= 5 &&
    !/^(Page\s+\d+|General Section)/i.test(chunk.chapter)
  ) {
    return chunk.chapter.trim();
  }

  return null;
}

export function cleanLeadingPashtoDiscourseMarkers(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  const markerPattern = /^(همدارنګه|همداراز|دغه راز|له همدې امله|په حقیقت کې|په پایله کې|په دې توګه|له بلې خوا|په عمومي توګه|باید وویل شي چې|د یادونې وړ ده چې|د یادولو وړ ده چې|په ورته وخت کې|په همدې اساس|د متن له مخې|د منبع پر بنسټ|په دې لړ کې|په هر صورت|په لنډه توګه|سربېره پر دې|سره له دې|له دې امله)[،,\s]+/i;
  let prev = '';
  while (cleaned !== prev && markerPattern.test(cleaned)) {
    prev = cleaned;
    cleaned = cleaned.replace(markerPattern, '').trim();
  }
  return cleaned;
}

export function extractPashtoEducationalTopic(sentence: string, chunk: DocumentChunkRecord): string | null {
  const stripped = cleanLeadingPashtoDiscourseMarkers(sentence);
  if (!stripped || stripped.length < 10) {
    return null;
  }

  // 1. Quoted terms take precedence: «...» or "..."
  const quoteMatch = stripped.match(/[«"']([^»"']{3,50})[»"']/);
  if (quoteMatch) {
    const candidate = quoteMatch[1].trim();
    if (candidate.length >= 3 && !/^(همدارنګه|دغه راز|له همدې امله|په حقیقت کې)$/.test(candidate)) {
      return candidate;
    }
  }

  // 2. Pashto postposition / preposition patterns: "د [موضوع] په اړه / هکله / باب / تړاو"
  const ppMatch = stripped.match(/د\s+([^،؛,.:]{3,45}?)\s+په\s+(اړه|هکله|باب|تړاو)/i);
  if (ppMatch && ppMatch[1]) {
    const candidate = cleanLeadingPashtoDiscourseMarkers(ppMatch[1].trim());
    if (candidate.length >= 4) {
      return candidate;
    }
  }

  // 3. Extract substantive clause
  const clauses = stripped
    .split(/[،؛,.:]/)
    .map((c) => cleanLeadingPashtoDiscourseMarkers(c.trim()))
    .filter((c) => c.length >= 6);

  const isInvalidPashtoFragment = (c: string) => {
    const trimmed = c.trim();
    if (trimmed.length < 4) return true;
    if (
      /^(همدارنګه|دغه راز|له همدې امله|په حقیقت کې|په پایله کې|په دې توګه|له بلې خوا|په عمومي توګه|د بېلګې په توګه|د بېلګې په ډول|د څېړنو له مخې|د یادونې وړ ده)$/.test(
        trimmed
      )
    ) {
      return true;
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length === 1 && words[0].length < 4) return true;
    return false;
  };

  for (const clause of clauses) {
    if (!isInvalidPashtoFragment(clause)) {
      let topic = clause;
      if (topic.length > 55) {
        const lastSpace = topic.lastIndexOf(' ', 50);
        topic = lastSpace > 20 ? topic.slice(0, lastSpace).trim() : topic.slice(0, 50).trim();
      }
      topic = topic.replace(/[,;:—\-\s]+$/, '');
      if (topic.length >= 4 && !isInvalidPashtoFragment(topic)) {
        return topic;
      }
    }
  }

  // 4. Fallback to chunk.section or chunk.chapter if meaningful and educational
  if (
    chunk.section &&
    chunk.section.length >= 4 &&
    !/^Page\s+\d+/i.test(chunk.section) &&
    !/^\d+$/i.test(chunk.section)
  ) {
    return chunk.section.trim();
  }
  if (
    chunk.chapter &&
    chunk.chapter.length >= 4 &&
    !/^(Page\s+\d+|General Section)/i.test(chunk.chapter)
  ) {
    return chunk.chapter.trim();
  }

  return null;
}

/**
 * Detects administrative headers, attribution lines, PREPARED BY lines,
 * table of contents entries, dot leaders, and navigational metadata.
 */
export function isDocumentMetadataOrNav(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();

  // 1. Attribution, administrative, or author metadata and profiles
  if (/^(prepared\s+by|submitted\s+by|presented\s+by|supervised\s+by|written\s+by|author|instructor|professor|lecturer|course|semester|department|faculty|roll\s+no|student\s+name|university|academic\s+year)\b/i.test(trimmed)) {
    return true;
  }
  if (/^(about\s+the\s+authors?|author\s+(biography|bio|profile|details|note|information)|biographical\s+note|acknowledg(e)?ments?|dedication|declaration|certificate|preface|foreword|about\s+the\s+contributors?)\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(co-authored\s+by|authored\s+by|corresponding\s+author|contact\s+email|email\s*[:：]|orcid\b)/i.test(trimmed)) {
    return true;
  }
  if (/\b(lecturer\s+in\s+the\s+department|assistant\s+professor|associate\s+professor|senior\s+lecturer|research\s+fellow|postdoctoral\s+researcher|ph\.?d\.?\s+candidate|master'?s\s+degree\s+from|graduated\s+from|received\s+(his|her|their)\s+degree)\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(Department\s+of|Faculty\s+of|College\s+of|Polytechnic\s+University|Kabul\s+University)\b/i.test(trimmed) && trimmed.length < 80) {
    return true;
  }
  if (/^(تهیه\s*کننده|استاد\s*راهنما|ارائه\s*دهنده|نویسنده|مؤلف|دانشگاه|دانشکده|دیپارتمنت|رشته|مضمون|صنف|سال\s*تحصیلی|شماره\s*دانشجویی|درباره\s*نویسنده|زندگی‌نامه)\b/i.test(trimmed)) {
    return true;
  }
  // Pashto administrative and attribution markers
  if (/^(ترتیب\s*کوونکی|لارښود\s*استاد|وړاندې\s*کوونکی|لیکوال|مؤلف|پوهنتون|پوهنځی|دیپارتمنت|څانګه|مضمون|ټولګی|تعليمي\s*کال|د\s*زده‌کوونکي\s*نوم|د\s*لیکوال\s*په\s*اړه|ژوندلیک)\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(Hamza Safi|Madina Kakar)\b/i.test(trimmed)) {
    return true;
  }
  if (/[A-Z][a-z]+\s+[A-Z][a-z]+\s*[·•|&]\s*[A-Z][a-z]+\s+[A-Z][a-z]+/.test(trimmed)) {
    return true;
  }

  // 2. Document tables, figure captions, legends, and tabular rows
  if (/^\s*(Table|Figure|Chart|Diagram|Exhibit|Box)\s+([0-9]+|[IVXLCDM]+)[:.\s-]/i.test(trimmed)) {
    return true;
  }
  if (/^\s*\|.*\|\s*$/.test(trimmed) || trimmed.includes('|')) {
    return true;
  }
  if (/^(source|note|notes|legend)\s*[:：]/i.test(trimmed)) {
    return true;
  }
  if (/\b(Table\s+\d+|Figure\s+\d+|Exhibit\s+\d+)\b/i.test(trimmed) && trimmed.length < 60) {
    return true;
  }

  // 3. Document title or publication headers
  if (/\b(Household Water Conservation|From Smart Devices to Artificial Intelligence)\b/i.test(trimmed)) {
    return true;
  }
  if (/^[A-Z](\s+[A-Z]){3,}/.test(trimmed)) {
    return true;
  }
  if (/\b(RESEARCH REPORT|POLICY BRIEF|WHITE PAPER|WORKING PAPER|TECHNICAL REPORT)\b/i.test(trimmed)) {
    return true;
  }

  // 4. Table of contents, index, and bibliography markers
  if (/^(table\s+of\s+contents|contents|table\s+des\s+mati[èe]res|index|bibliography|references|list\s+of\s+(figures|tables|illustrations|abbreviations|acronyms)|glossary)\b/i.test(trimmed)) {
    return true;
  }
  if (/^(فهرست\s*(مطالب|مندرجات|اشکال|جداول)?|منابع\s*و\s*مآخذ)\b/i.test(trimmed)) {
    return true;
  }

  // 5. Dot leaders / dashed table of contents entries with trailing page numbers
  // e.g. "Drip Irrigation Systems .................................... 12"
  if (/(\.{2,}|-{2,}|_{2,}|\s{3,})\s*\d+\s*$/.test(trimmed)) {
    return true;
  }
  if (/^\s*\d+(?:\.\d+)*\s+[A-Za-z][^\n]{3,65}\s+\d{1,3}\s*$/.test(trimmed)) {
    return true;
  }

  // 6. Page numbering, running headers, footers, orphan page markers
  if (/^(page\s+\d+(\s+of\s+\d+)?|\d+\s*\|\s*p\s*a\s*g\s*e|--\s*\d+\s+of\s+\d+\s*--|\d+\s*\/\s*\d+|\d{1,4})$/i.test(trimmed)) {
    return true;
  }
  if (/\bPage\s*$/i.test(trimmed) || /^[A-Za-z0-9\s,\-:·•|&]+\s+Page$/i.test(trimmed)) {
    return true;
  }
  if (/\b(Page\s+safety|safety\s*\[\d+\])\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(all\s+rights\s+reserved|confidential|draft\s+copy|internal\s+use\s+only)\b/i.test(trimmed)) {
    return true;
  }

  // 7. Standalone broken numbering labels (e.g. "1.1.2 ", "Section 3.1", "Chapter IV")
  if (/^(\d+(\.\d+)*|[A-Za-z]\)|[ivxlcdm]+\.)\s*$/i.test(trimmed)) {
    return true;
  }

  // 8. Acknowledgements, dedications, declarations, and bibliographic/URL lines
  if (isNonSubstantiveOrAckSentence(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks if a phrase is an imperative task title, operational instruction, or checklist action
 * (e.g., "Fix the basics first", "Stop visible leaks", "Check tanks regularly").
 */
export function isImperativeOrActionPhrase(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (/^(fix|check|stop|install|inspect|maintain|turn\s+off|turn\s+on|avoid|ensure|clean|use|do\s+not|don't|protect|reduce|keep|address|upgrade|implement|monitor|verify|establish|test|repair|audit|regulate|conserve|follow|remember)\b/i.test(trimmed)) {
    return true;
  }
  if (/\b(the basics first|regularly|when not in use|step[- ]by[- ]step|to[- ]do list|checklist|action plan)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Checks if a phrase is a dangling or incomplete fragment (e.g. ending in conjunction, preposition,
 * comma, or broken modifier like "and unmanaged" or "repeated drought, groundwater").
 */
export function isDanglingOrIncompleteFragment(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;

  // Starts with conjunction: e.g. "and unmanaged", "or repeated drought"
  if (/^(and|or|but|nor)\s+/i.test(trimmed)) {
    return true;
  }

  // Prepositional phrases lacking a complete sentence structure or finite verb
  // e.g. "In Afghanistan the challenge", "Under these conditions", "From Page 1"
  // Note: Full questions/sentences like "In 2-3 concise sentences, explain...",
  // "In which scenario does X occur?", or "Under what conditions..." are complete and valid.
  if (/^(in|at|on|under|across|throughout|from|during|within|by|for|with|according to|towards|behind)\s+/i.test(trimmed)) {
    const isCompletePunctuatedSentence =
      trimmed.length >= 35 &&
      /[.!?؛۔]$/.test(trimmed) &&
      /\b(is|are|was|were|can|could|should|must|will|would|explain|summarize|analyze|synthesize|evaluate|describe|compare|occurs?|functions?|operates?|causes?|requires?)\b/i.test(trimmed);
    if (!isCompletePunctuatedSentence) {
      return true;
    }
  }

  // Generic dummy subjects or relative expressions lacking concrete academic concepts
  if (/^(the|this|that|these|those)\s+(challenge|problem|issue|approach|situation|matter|question|point|task|work)\b/i.test(trimmed)) {
    return true;
  }

  // Standalone numbers, stats, percentages, or years (e.g. "64%", "8 in 10", "2030")
  if (/^(\d+(\.\d+)?%|\d+\s+in\s+\d+|\d{4}\b)/.test(trimmed) && trimmed.split(/\s+/).length <= 5) {
    return true;
  }

  // Ends with comma, semicolon, colon, dash
  if (/[,;:—\-\s]+$/.test(text)) return true;

  // Ends with conjunction: and, or, but, nor, while, whereas, although, because, as, if
  if (/\b(and|or|but|nor|while|whereas|although|because|as|if)$/i.test(trimmed)) return true;

  // Ends with preposition: of, to, in, for, with, on, at, by, from, under, into, through, across, during, against, between
  if (/\b(of|to|in|for|with|on|at|by|from|under|into|through|across|during|against|between|among|via|about)$/i.test(trimmed)) return true;

  // Ends with determiners, incomplete modifiers, or comparatives: more, less, etc.
  if (/\b(the|a|an|this|that|these|those|its|their|unmanaged|visible|repeated|such|each|every|more|less|most|least)\b$/i.test(trimmed)) return true;

  // Contains ellipses or truncation markers
  if (/\.{3}|…/.test(trimmed)) return true;

  return false;
}

/**
 * Checks whether a chapter or section label is a generic default or navigation container
 * that should never be used as a student-facing question topic.
 */
export function isGenericChapterOrSection(text: string): boolean {
  if (!text) return true;
  const t = text.trim();
  if (/^(chapter|section|part|unit|lesson|module|reading|general|overview|analysis|key terms|evidence synthesis|advanced synthesis)\b/i.test(t)) {
    return true;
  }
  if (/^(فصل|باب|بخش|مقدمه|کلیات|مفاهیم اساسی|مفاهیم اصلی)\b/i.test(t)) {
    return true;
  }
  if (/^(Chapter|Page)\s+\d+/i.test(t)) {
    return true;
  }
  if (t.includes('مقدمه و مفاهیم') || t.includes('Overview and Core Concepts')) {
    return true;
  }
  return false;
}

/**
 * Validates whether a line or phrase is an incomplete fragment, section header,
 * chapter label, or unpunctuated title (e.g. "Foundational Water Conservation Methods 1").
 */
export function isHeadingOrFragment(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 15) return true;

  // Metadata, attribution, or navigation
  if (isDocumentMetadataOrNav(trimmed)) return true;

  // Imperative action titles e.g. "Fix the basics first", "Stop visible leaks"
  if (isImperativeOrActionPhrase(trimmed)) {
    if (!/[.!?]$/.test(trimmed) || trimmed.split(/\s+/).length <= 8) {
      return true;
    }
  }

  // Trailing or standalone numbers e.g. "Foundational Water Conservation Methods 1", "Methods 2"
  if (/^(foundational\s+.*|methods?|chapter|section|part|unit|topic|lecture|overview)\s*\d+$/i.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z0-9\s:.-]+\s+\d{1,2}$/.test(trimmed) && !/[.!?]$/.test(trimmed)) {
    return true;
  }
  // Heading pattern: Starts with Number or Title without terminal punctuation
  if (/^(chapter|section|part|unit|lesson|module|reading)\s+([0-9]+|[IVXLCDM]+)[:.\s]/i.test(trimmed) && !/[.!?]$/.test(trimmed)) {
    return true;
  }
  // Table and figure captions, legends, and chart titles (never question content)
  if (/^(figure|table|chart|diagram|box|exhibit)\s+([0-9]+|[IVXLCDM]+)[:.\s-]/i.test(trimmed)) {
    return true;
  }

  // Unpunctuated lines (does not end in . ! ? ؛ or ۔)
  if (!/[.!?؛۔]$/.test(trimmed)) {
    const isRtlScript = /[\u0600-\u06FF]/.test(trimmed);
    if (isRtlScript) {
      // For RTL scripts (Pashto, Dari/Persian, Arabic, Urdu), check word count and finite verbal endings
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length <= 4) return true;
      const hasPersianVerb = /(می‌گردد|می‌شود|می‌باشد|است|هستند|شد|بود|گردید|دارد|می‌کند|می‌ورزد|می‌نماید|می‌بخشد|می‌سازد|می‌آورد|یافت|گرفت|می‌رود|می‌تواند|باشد)\s*$/i.test(trimmed);
      const hasPashtoVerb = /(دي|ده|دی|شوی|شوه|شول|کوي|کړي|شو|ګرځي|لري|راځي|کیږي|شي|وي|وو|وه|شته|ورکوي|شوي دي|کړی دی|شوي وي|ورسېد|جوړ کړ)\s*$/i.test(trimmed);
      if (words.length <= 6 && !hasPersianVerb && !hasPashtoVerb) return true;
    } else {
      // Lines with <= 8 words without punctuation are headings / fragments
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length <= 8) return true;

      // All uppercase lines
      if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) return true;

      // Title case lines lacking finite verbs
      const hasVerb = /\b(is|are|was|were|provides|provide|enables|enable|requires|require|demonstrates|demonstrate|serves|serve|facilitates|facilitate|acts|act|refers|refer|constitutes|constitute|enhances|enhance|reduces|reduce|increases|increase|optimizes|optimize|exceeds|exceed|maintains|maintain|replicates|replicate|treats|treat|stabilizes|stabilize|produces|produce|decreases|decrease|prevents|prevent|delivers|deliver|can|may|must|should|will|has|have|had|puts?|causes?|results?|involves?|applies?|creates?|depends?|leads?|affects?|determines?|measures?|retains?|stores?|transforms?|generates?|mitigates?|protects?|wastes?)\b/i.test(trimmed);
      if (!hasVerb) return true;
    }
  }

  // Lines ending with ellipses or containing multiple ellipses
  if (/\.{3}|…/.test(trimmed)) {
    return true;
  }

  // Dangling fragments
  if (isDanglingOrIncompleteFragment(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks if a string or label matches heading patterns like "Chapter 1", "Foundational Water Conservation Methods 1",
 * or contains ellipses. Unlike isHeadingOrFragment, does NOT reject short noun phrases without terminal punctuation.
 */
export function isHeadingOrTitleLabel(text: string): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (trimmed.length < 3) return true;
  if (isImperativeOrActionPhrase(trimmed)) return true;
  if (isDanglingOrIncompleteFragment(trimmed)) return true;
  if (isGenericChapterOrSection(trimmed)) return true;
  if (/^(foundational\s+.*|methods?|chapter|section|part|unit|topic|lecture|overview)\s*\d+$/i.test(trimmed)) {
    return true;
  }
  if (/^[A-Za-z0-9\s:.-]+\s+\d{1,2}$/.test(trimmed)) {
    return true;
  }
  if (/^(chapter|section|part|unit|lesson|module|reading)\s+([0-9]+|[IVXLCDM]+)[:.\s]/i.test(trimmed)) {
    return true;
  }
  if (/\.{3}|…/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Extracts a clean, educational English concept or noun phrase without truncation or ellipses.
 * Returns null if no complete, self-contained educational concept can be reliably extracted.
 * Strictly avoids arbitrary word slicing or incomplete phrases.
 */
export function extractEnglishEducationalTopic(sentence: string, chunk?: DocumentChunkRecord): string | null {
  if (!sentence) {
    if (chunk?.section && !isHeadingOrTitleLabel(chunk.section)) return chunk.section.trim();
    if (chunk?.chapter && !isHeadingOrTitleLabel(chunk.chapter)) return chunk.chapter.trim();
    return null;
  }

  let clean = sentence
    .trim()
    .replace(/^However,\s*|^Furthermore,\s*|^Moreover,\s*|^In addition,\s*|^Therefore,\s*|^Nevertheless,\s*/i, '');

  // Strip reporting / attribution prefixes: e.g. "UNICEF has warned that...", "FAO reports that...", "According to UNICEF,..."
  clean = clean.replace(
    /^(?:According to\s+[^,:\n]{2,40}[,:]\s*|(?:(?:UNICEF|FAO|WHO|UNESCO|UNDP|UNHCR|WFP|World Bank|The World Bank|Government reports?|Independent research|Research|Studies|Official data|Surveys?)\s+(?:has\s+|have\s+|had\s+)?(?:warned|warns|reported|reports|estimated|estimates|found|finds|shown|shows|showed|indicated|indicates|stated|states|noted|notes|observed|observes|revealed|reveals|concluded|concludes|suggested|suggests|emphasized|emphasizes|highlighted|highlights|asserted|asserts)\s+(?:that\s+)?))/i,
    ''
  ).trim();

  // Reject imperative instructions, acknowledgements, meta-statements, or unresolved pronouns immediately
  if (
    isImperativeOrActionPhrase(clean) ||
    isNonSubstantiveOrAckSentence(clean) ||
    hasUnresolvedLeadingPronoun(clean)
  ) {
    return null;
  }

  // 1. Quoted terms take precedence: "..." or “...” or ‘...’
  // Do NOT match apostrophes inside contractions or possessives (e.g. "week's or next season's demand")
  const quoteMatch =
    clean.match(/(?:^|[\s(])["“«]([^"”»\n]{3,60})["”»](?=[\s).,;:!?]|$)/) ||
    clean.match(/(?:^|[\s(])['‘]([^'’\n]{3,60})['’](?=[\s).,;:!?]|$)/);
  if (quoteMatch) {
    const candidate = quoteMatch[1].trim();
    if (isValidEducationalTopic(candidate)) {
      return candidate;
    }
  }

  // Strip leading adverbial or prepositional phrases (e.g. "In arid climates, drip irrigation...")
  let prepClean = clean.replace(/^(In\s+[^,:\n]{2,40}[,:]|During\s+[^,:\n]{2,40}[,:]|Under\s+[^,:\n]{2,40}[,:]|Across\s+[^,:\n]{2,40}[,:]|For\s+[^,:\n]{2,40}[,:]|Through\s+[^,:\n]{2,40}[,:]|To\s+[^,:\n]{2,40}[,:]|By\s+[^,:\n]{2,40}[,:])\s*/i, '');

  // If sentence has an introductory clause ending in colon (e.g. "In Afghanistan the challenge is acute: drought became..."),
  // and the leading clause has a dummy subject, evaluate the substantive clause after the colon.
  if (clean.includes(': ') && (/^(in\s+|under\s+|the\s+challenge|this\s+work)/i.test(prepClean))) {
    const afterColon = clean.split(/:\s+/)[1]?.trim();
    if (afterColon && afterColon.length >= 20) {
      prepClean = afterColon;
    }
  }

  // 1. Modals in main clause (e.g. "Modern technologies can make...", avoiding subordinate clauses)
  const mainClause = prepClean.split(/,\s*(?:so|and|but|where|when|while|although|because)\b/i)[0];
  const modalMatch = mainClause.match(/^([A-Z][A-Za-z0-9\s,\-–—'"()/.]{3,90}?)\s+(?:can|could|may|might|must|will|would|should)\s+([a-z]+)\b/i);
  if (modalMatch) {
    let candidate = modalMatch[1].trim().replace(/^(the|a|an)\s+/i, '');
    candidate = candidate.replace(/,\s*(?:such as|including)\s+.*$/i, '').trim();
    candidate = candidate.replace(/[,;:—\-\s]+$/, '').trim();

    // If candidate contains a relative clause or reporting connector (e.g. "reports that drought"), extract the substantive noun after 'that'
    if (/\s+that\s+/i.test(candidate)) {
      candidate = candidate.split(/\s+that\s+/i).pop()!.trim();
    }

    if (isValidEducationalTopic(candidate)) {
      const words = candidate.split(/\s+/).filter(Boolean);
      if (words.length >= 1 && words.length <= 10) {
        return candidate;
      }
    }
  }

  // 2. Comprehensive subject clause detection before primary finite verb
  // Note: Supports compound subjects joined by commas and 'and'/'or' without cutting mid-subject.
  const verbList =
    'is|are|was|were|has|have|had|estimates?|estimated|makes?|made|remains?|remained|becomes?|became|shows?|showed|shown|represents?|functions?|operates?|combines?|combined|simulates?|records?|recorded|provides?|provided|enables?|enabled|requires?|required|demonstrates?|demonstrated|serves?|served|facilitates?|facilitated|acts?|acted|refers?|referred|constitutes?|constituted|enhances?|enhanced|reduces?|reduced|increases?|increased|optimizes?|optimized|exceeds?|exceeded|maintains?|maintained|replicates?|replicated|treats?|treated|stabilizes?|stabilized|produces?|produced|decreases?|decreased|prevents?|prevented|delivers?|delivered|captures?|captured|preserves?|preserved|filters?|filtered|integrates?|integrated|manages?|managed|collects?|collected|recharges?|recharged|regulates?|regulated|mitigates?|mitigated|protects?|protected|transforms?|transformed|generates?|generated|suppresses?|suppressed|creates?|created|applies?|applied|improves?|improved|stores?|stored|retains?|retained|distributes?|distributed|measures?|measured|supports?|supported|utilizes?|utilized|uses?|used|causes?|caused|leads?|led|affects?|affected|depends?|depended|wastes?|wasted|absorbs?|absorbed|puts?|follows?|followed|places?|placed|leaves?|left|allows?|allowed|helps?|helped|involves?|involved|impedes?|impeded|eliminates?|eliminated|verifies?|verify|verified|validates?|validate|validated|authenticates?|authenticated|authorizes?|authorized|encrypts?|encrypted|decrypts?|decrypted|computes?|computed|calculates?|calculated|evaluates?|evaluated|compares?|compared|partitions?|partitioned|segments?|segmented|indexes?|indexed|renders?|rendered|shapes?|shaped|formats?|formatted|serializes?|serialized|parses?|parsed|extracts?|extracted|detects?|detected|identifies?|identified|classifies?|classified|tracks?|tracked|monitors?|monitored|snapshots?|restores?|restored|transmits?|transmitted|routes?|routed|balances?|balanced|caches?|cached|executes?|executed|compiles?|compiled|conducts?|conducted|determines?|determined|establishes?|established|defines?|defined|describes?|described|explains?|explained|illustrates?|illustrated|examines?|examined|analyzes?|analyzed|synthesizes?|synthesized|addresses?|addressed|resolves?|resolved|minimizes?|minimized|maximizes?|maximized|separates?|separated|isolates?|isolated|connects?|connected|links?|linked|maps?|mapped|transfers?|transferred|converts?|converted|translates?|translated|encodes?|encoded|decodes?|decoded|compresses?|compressed|aggregates?|aggregated|synchronizes?|synchronized|coordinates?|coordinated|orchestrates?|orchestrated|schedules?|scheduled|allocates?|allocated|triggers?|triggered|enforces?|enforced|restricts?|restricted|guarantees?|guaranteed|achieves?|achieved|exhibits?|exhibited|contains?|contained|consists?|consisted|comprises?|comprised|includes?|included|emphasizes?|emphasized|consults?|consulted|reflects?|reflected|distinguishes?|distinguished|differentiates?|differentiated|encourages?|encouraged|promotes?|promoted|fosters?|fostered|shapes?|shaped|influences?|influenced|contributes?|contributed|explores?|explored|highlights?|highlighted|confirms?|confirmed|recognizes?|recognized|recognises?|recognised';
  const verbRegex = new RegExp(`^([A-Z][A-Za-z0-9\\s,\\-–—'"()/.]{3,110}?)\\s+(${verbList})\\b`, 'i');
  const verbMatch = prepClean.match(verbRegex);

  if (verbMatch) {
    let candidate = verbMatch[1].trim().replace(/^(the|a|an)\s+/i, '');
    // Clean appositive examples such as ", such as ... ,"
    candidate = candidate.replace(/,\s*(?:such as|including)\s+.*$/i, '').trim();
    candidate = candidate.replace(/[,;:—\-\s]+$/, '').trim();

    // If candidate contains a relative clause or reporting connector (e.g. "FAO reports that drought"), extract substantive noun after 'that'
    if (/\s+that\s+/i.test(candidate)) {
      candidate = candidate.split(/\s+that\s+/i).pop()!.trim();
    }

    if (isValidEducationalTopic(candidate)) {
      const words = candidate.split(/\s+/).filter(Boolean);
      if (words.length >= 1 && words.length <= 10) {
        return candidate;
      }
    }
  }

  // 3. Fallback to chunk.section or chunk.chapter if meaningful, valid, and non-generic
  if (chunk?.section && isValidEducationalTopic(chunk.section)) {
    return chunk.section.trim();
  }
  if (chunk?.chapter && isValidEducationalTopic(chunk.chapter)) {
    return chunk.chapter.trim();
  }

  // 4. Clean noun phrase detection for definitions (e.g. "X is defined as...", "X refers to...")
  const defMatch = clean.match(/^([A-Z][A-Za-z0-9\s\-–—]{3,50}?)\s*,\s*(defined as|which is|known as|referring to)\b/i);
  if (defMatch) {
    const candidate = defMatch[1].trim().replace(/^(the|a|an)\s+/i, '');
    if (!isHeadingOrTitleLabel(candidate) && !isDanglingOrIncompleteFragment(candidate)) {
      return candidate;
    }
  }

  // If no complete, self-contained educational concept can be reliably extracted,
  // return null so caller can handle cleanly rather than guessing or fabricating.
  return null;
}

/**
 * Removes repetitive RAG process boilerplate from student-facing question stems in Dari/Persian and English
 * while preserving actual educational meaning, question intent, and genuine passage references.
 */
export function removeRagBoilerplateFromQuestionStem(text: string, isPersian: boolean = true): string {
  if (!text) return '';
  let cleaned = text.trim();

  // If the question genuinely asks the student to consult a specific visual or textual element
  // (e.g. table, chart, diagram, map, figure, poem, excerpt), do not remove the source reference.
  const genuineConsultationPattern = /(جدول|نمودار|شکل|نقشه|تصویر|شعر|پاراگراف|بند|قطعه|متن زیر)\s+(مندرج\s+در\s+)?صفحه\s+[۰-۹0-9]+/i;
  if (genuineConsultationPattern.test(cleaned)) {
    return cleaned;
  }

  // --- 1. ENGLISH BOILERPLATE & META-INTRODUCTIONS REMOVAL ---
  // 1a. Fill-in-the-blank English prefixes: e.g. "Complete the statement from Page 1: ..."
  cleaned = cleaned.replace(/^Complete the statement from Page\s+\d+:\s*/i, 'Complete the statement: ');

  // 1b. True / False English prefixes
  // e.g. "True or False: According to the source text on Page 1, ..." -> "True or False: ..."
  cleaned = cleaned.replace(
    /^True or False:\s*(According to\s+(the\s+)?(curriculum\s+text|source\s+text|document|educational\s+material|text|source|passage)?\s*(on\s+Page\s+\d+)?[,:\s]*)+/i,
    'True or False: '
  );
  cleaned = cleaned.replace(
    /^True or False:\s*(The educational material on Page\s+\d+\s+verifies that\s*)+/i,
    'True or False: '
  );
  cleaned = cleaned.replace(
    /^True or False:\s*(In accordance with\s+(the\s+)?(curriculum\s+on\s+Page\s+\d+|[^,:]+)?[,:\s]*)+/i,
    'True or False: '
  );
  cleaned = cleaned.replace(
    /^True or False:\s*(Based on\s+(the\s+)?(curriculum\s+text|educational\s+analysis|document|text|source|passage)?\s*(presented\s+on\s+Page\s+\d+|on\s+Page\s+\d+)?[,:\s]*)+/i,
    'True or False: '
  );

  // Capitalize proposition after "True or False: "
  if (/^True or False:\s*[a-z]/i.test(cleaned)) {
    cleaned = cleaned.replace(/^True or False:\s*([a-z])/i, (_, letter) => `True or False: ${letter.toUpperCase()}`);
  }

  // 1c. English MCQ & Open-ended meta-introductions
  cleaned = cleaned.replace(
    /^(According to\s+(the\s+)?(curriculum\s+text|educational\s+analysis|document|source\s+material|text|source|passage)?\s*(on|in)?\s*(Page|p\.)\s*\d+[,:\s]*)+/i,
    ''
  );
  cleaned = cleaned.replace(
    /^(In reviewing the concepts presented on Page\s+\d+[,:\s]*)+/i,
    ''
  );
  cleaned = cleaned.replace(
    /^(The educational material on Page\s+\d+\s+verifies that[,:\s]*)+/i,
    ''
  );
  cleaned = cleaned.replace(
    /^(Based on the (educational analysis presented on|curriculum text on|document on|text on|concepts on)?\s*Page\s+\d+[,:\s]*)+/i,
    ''
  );
  cleaned = cleaned.replace(
    /^(Based on the (curriculum text|educational analysis|document|source material|reading)[,:\s]*)+/i,
    ''
  );
  cleaned = cleaned.replace(
    /^(According to the (curriculum text|document|educational material|source material|reading)[,:\s]*)+/i,
    ''
  );

  // Capitalize first character if lowercase after stripping prefix
  if (/^[a-z]/.test(cleaned)) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  // --- 2. DARI / PERSIAN BOILERPLATE REMOVAL ---
  // 2a. True / False prefixes
  // e.g., "صحیح یا غلط: بر اساس متن منبع (صفحه ۱): ..." -> "صحیح یا غلط: ..."
  cleaned = cleaned.replace(
    /^(صحیح یا غلط|درست یا غلط|صحيح أم خطأ|سمه که ناسمه)[:،\s]+(بر اساس متن منبع|وفقاً لنص المصدر|د متن د محتوا پر بنسټ|متن کی روشنی میں|بر اساس متن آموزشی|طبق متن|بر اساس متن|با استناد به متن|مطابق متن)\s*(\(?صفحه\s+[۰-۹0-9]+\)?)?[:،\s]*/i,
    '$1: '
  );
  cleaned = cleaned.replace(
    /^(صحیح یا غلط|درست یا غلط|صحيح أم خطأ|سمه که ناسمه)[:،\s]+\(?صفحه\s+[۰-۹0-9]+\)?[:،\s]*/i,
    '$1: '
  );

  // 2b. Fill-in-the-blank prefixes
  cleaned = cleaned.replace(
    /^جای خالی را با توجه به (متن آموزشی|متن منبع|متن|آموزه‌های)?\s*(\(?صفحه\s+[۰-۹0-9]+\)?)?\s*تکمیل نمایید:\s*/i,
    'جای خالی را با کلمه مناسب تکمیل نمایید: '
  );

  // 2c. MCQ boilerplate
  cleaned = cleaned.replace(
    /^(با استناد به مباحث مندرج در صفحه\s+[۰-۹0-9]+|با استناد به تحلیل ارائه‌شده در صفحه\s+[۰-۹0-9]+|بر اساس مباحث مندرج در صفحه\s+[۰-۹0-9]+)\s*(پیرامون|در خصوص|در زمینه)?\s*«([^»]+)»[،,\s]*/i,
    'در رابطه با «$3»، '
  );
  cleaned = cleaned.replace(
    /^بر اساس متن آموزشی\s*\(صفحه\s+[۰-۹0-9]+\)\s*(در ارتباط با|در خصوص|پیرامون|در زمینه)\s*«([^»]+)»[،,\s]*/i,
    'در خصوص «$2»، '
  );
  cleaned = cleaned.replace(
    /^طبق تحلیل ارائه\s*شده در متن منبع\s*(در خصوص|پیرامون|در زمینه)?\s*«([^»]+)»[،,\s]*/i,
    'در خصوص «$2»، '
  );
  cleaned = cleaned.replace(
    /^با توجه به آموزه‌های صفحه\s+[۰-۹0-9]+\s*در زمینه\s*«([^»]+)»[،,\s]*/i,
    'در رابطه با «$1»، '
  );

  // 2d. Essay boilerplate
  cleaned = cleaned.replace(
    /^با استناد به تحلیل ارائه‌شده در صفحه\s+[۰-۹0-9]+\s*پیرامون\s*«([^»]+)»[،,\s]*/i,
    'در خصوص «$1»، '
  );
  cleaned = cleaned.replace(
    /^دیدگاه‌های آموزشی مندرج در متن منبع درباره\s*«([^»]+)»\s*\(صفحه\s+[۰-۹0-9]+\)\s*را واکاوی نموده و\s*/i,
    'ابعاد مفهومی و کاربردی «$1» را واکاوی نموده و '
  );
  cleaned = cleaned.replace(
    /^بر مبنای مباحث صفحه\s+[۰-۹0-9]+\s*در زمینه\s*«([^»]+)»[،,\s]*/i,
    'در زمینه «$1»، '
  );

  // 2e. Short answer boilerplate
  cleaned = cleaned.replace(
    /^بر اساس متن آموزشی صفحه\s+[۰-۹0-9]+[،,\s]*/i,
    ''
  );
  cleaned = cleaned.replace(
    /^با استناد به مفاهیم ارائه\s*شده در صفحه\s+[۰-۹0-9]+[،,\s]*/i,
    ''
  );
  cleaned = cleaned.replace(
    /را با توجه به آموزه‌های صفحه\s+[۰-۹0-9]+\s*به اختصار توضیح دهید/i,
    'را به اختصار توضیح دهید'
  );
  cleaned = cleaned.replace(
    /نکته اساسی مطرح‌شده در متن منبع را بیان فرمایید/i,
    'نکات و ویژگی‌های اساسی را بیان فرمایید'
  );

  // 2f. Generic RAG prefixes at the start of stems
  cleaned = cleaned.replace(/^با استناد به تحلیل ارائه‌شده در متن[،,\s]*/i, '');
  cleaned = cleaned.replace(/^بر اساس تحلیل متن[،,\s]*/i, '');
  cleaned = cleaned.replace(/^طبق مباحث مطرح‌شده در متن[،,\s]*/i, '');
  cleaned = cleaned.replace(/^بر اساس متن منبع[،,\s]*/i, '');
  cleaned = cleaned.replace(/^با استناد به متن منبع[،,\s]*/i, '');
  cleaned = cleaned.replace(/^طبق تحلیل ارائه\s*شده در متن منبع[،,\s]*/i, '');

  // 2g. Remove parenthetical page numbers attached to topic phrases like "«موضوع» (صفحه ۱)"
  cleaned = cleaned.replace(/«([^»]+)»\s*\(صفحه\s+[۰-۹0-9]+\)/g, '«$1»');

  // Final cleanup: remove leading spaces, commas, colons, or dashes
  cleaned = cleaned.replace(/^[،,\s\-:]+/, '').trim();

  return cleaned;
}

/**
 * Formats a Dari/Persian educational sentence or clause into a concise, parallel,
 * academically appropriate option choice (typically 35–85 characters), avoiding
 * copying entire long source paragraphs.
 */
export function formatConcisePersianOption(sentence: string, subjectTopic?: string): string {
  if (!sentence) return '';
  let cleaned = cleanLeadingPersianDiscourseMarkers(sentence).trim();

  // If sentence has leading quotation marks or topic reference
  if (subjectTopic) {
    const normTopic = subjectTopic.replace(/[«»"']/g, '').trim();
    if (normTopic.length >= 3) {
      const topicPattern = new RegExp(`^(${normTopic}|«${normTopic}»)[،,\\s]+(میان|که|به عنوان|عبارت است از|یکی از)?[،,\\s]*`, 'i');
      if (topicPattern.test(cleaned)) {
        cleaned = cleaned.replace(topicPattern, '').trim();
      }
    }
  }

  // Remove leading generic connectors
  cleaned = cleaned.replace(/^(که|از این رو|در واقع|به این ترتیب|بدین ترتیب)\s+/i, '').trim();

  // If sentence contains "است که ...", the substantive predicate often follows
  if (cleaned.includes('است که ') && cleaned.length > 70) {
    const after = cleaned.split('است که ')[1]?.trim();
    if (after && after.length >= 25 && after.length <= 90) {
      cleaned = after;
    }
  }

  // If sentence is compound with "،" and too long (> 90 chars), pick the primary substantive clause
  if (cleaned.length > 90 && cleaned.includes('،')) {
    const clauses = cleaned.split(/[،؛]/).map((c) => c.trim()).filter((c) => c.length >= 25);
    if (clauses.length > 0 && clauses[0].length <= 85) {
      cleaned = clauses[0];
    } else if (clauses.length > 1 && clauses[1].length <= 85) {
      cleaned = clauses[1];
    }
  }

  // Clean trailing punctuation and trailing connectors
  cleaned = cleaned.replace(/[,;:—\-\s]+$/, '').trim();
  cleaned = cleaned.replace(/\s+(که|و|یا|اما|زیرا)$/i, '').trim();
  cleaned = cleaned.replace(/[.!?؛۔]$/, '').trim();

  // Final length sanity guard: if still > 95 characters, trim at last word boundary
  if (cleaned.length > 95) {
    const cut = cleaned.lastIndexOf(' ', 90);
    cleaned = cut > 35 ? cleaned.slice(0, cut).trim() : cleaned.slice(0, 90).trim();
  }

  return cleaned;
}

/**
 * Formats a Pashto educational sentence or clause into a concise, parallel,
 * academically appropriate option choice (typically 35–85 characters), avoiding
 * copying entire long source paragraphs.
 */
export function formatConcisePashtoOption(sentence: string, subjectTopic?: string): string {
  if (!sentence) return '';
  let cleaned = cleanLeadingPashtoDiscourseMarkers(sentence).trim();

  // If sentence has leading quotation marks or topic reference
  if (subjectTopic) {
    const normTopic = subjectTopic.replace(/[«»"']/g, '').trim();
    if (normTopic.length >= 3) {
      const topicPattern = new RegExp(`^(${normTopic}|«${normTopic}»)[،,\\s]+(چې|په توګه|عبارت دی له|یو له)?[،,\\s]*`, 'i');
      if (topicPattern.test(cleaned)) {
        cleaned = cleaned.replace(topicPattern, '').trim();
      }
    }
  }

  // Remove leading generic connectors
  cleaned = cleaned.replace(/^(چې|له همدې امله|په حقیقت کې|په دې توګه|دغه راز|همدارنګه)\s+/i, '').trim();

  // If sentence contains "چې ...", the substantive predicate often follows
  if (cleaned.includes('چې ') && cleaned.length > 70) {
    const after = cleaned.split('چې ')[1]?.trim();
    if (after && after.length >= 25 && after.length <= 90) {
      cleaned = after;
    }
  }

  // If sentence is compound with "،" and too long (> 90 chars), pick the primary substantive clause
  if (cleaned.length > 90 && cleaned.includes('،')) {
    const clauses = cleaned.split(/[،؛]/).map((c) => c.trim()).filter((c) => c.length >= 25);
    if (clauses.length > 0 && clauses[0].length <= 85) {
      cleaned = clauses[0];
    } else if (clauses.length > 1 && clauses[1].length <= 85) {
      cleaned = clauses[1];
    }
  }

  // Clean trailing punctuation and trailing connectors
  cleaned = cleaned.replace(/[,;:—\-\s]+$/, '').trim();
  cleaned = cleaned.replace(/\s+(چې|او|یا|خو|ځکه|نو)$/i, '').trim();
  cleaned = cleaned.replace(/[.!?؛۔]$/, '').trim();

  // Final length sanity guard: if still > 95 characters, trim at last word boundary
  if (cleaned.length > 95) {
    const cut = cleaned.lastIndexOf(' ', 90);
    cleaned = cut > 35 ? cleaned.slice(0, cut).trim() : cleaned.slice(0, 90).trim();
  }

  return cleaned;
}

/**
 * Concept-specific distractors catalog for recognized academic and civic concepts.
 * Each entry provides plausible, demonstrably contrasting or incorrect propositions
 * that directly challenge student understanding of the specific concept.
 */
const PERSIAN_CONCEPT_DISTRACTORS: Array<{
  keywords: string[];
  distractors: string[];
}> = [
  {
    keywords: ['حاکمیت قانون', 'قانون‌مداری', 'اصل قانونیت'],
    distractors: [
      'مشروط ساختن موازین قانونی به صلاحدید و تصمیمات مقطعی مسئولان اجرایی',
      'تمرکز کلیه صلاحیت‌های نظارتی و تقنینی در یک مرجع اداری بدون تفکیک قوا',
      'تعلیق رسیدگی‌های بی‌طرفانه قضایی در برابر اقدامات دستگاه‌های دولتی',
      'واگذاری تفسیر موازین اساسی به نهادهای مصلحتی غیرپاسخگو',
    ],
  },
  {
    keywords: ['تفکیک قوا', 'قوای سه‌گانه', 'استقلال محاکم'],
    distractors: [
      'ادغام صلاحیت‌های تقنینی و قضایی در قوه مجریه برای تسریع در امور اداری',
      'سلب اختیارات محاکم در نظارت بر مصوبات و عملکرد دستگاه‌های اجرایی',
      'ایجاد مرجعیت اداری واحد برای تفسیر و اجرای یک‌جانبه قوانین',
      'وابستگی نهاد قضا به دستورالعمل‌های صادره از مراجع سیاسی',
    ],
  },
  {
    keywords: ['انتخابات', 'مشارکت فعال', 'رأی‌گیری'],
    distractors: [
      'محدود ساختن دایره انتخاب‌کنندگان بر اساس معیارهای سلیقه‌ای و طبقاتی',
      'تلقی انتخابات صرفاً به عنوان تشریفات صوری بدون تأثیر در چرخش نخبگان',
      'واگذاری تعیین نمایندگان به شوراهای انتصابی بدون رأی‌گیری عمومی',
      'مشروط ساختن مشارکت عمومی به تأیید صلاحیت‌های غیرشفاف اداری',
    ],
  },
  {
    keywords: ['عدالت قضایی', 'محاکم صالحه', 'بیطرفی قضات', 'دادرسی'],
    distractors: [
      'اعمال تمایز ساختاری میان اقشار جامعه در دسترسی به مراجع دادرسی',
      'وابستگی احکام محاکم به مصلحت‌سنجی‌های مراجع سیاسی و اجرایی',
      'سلب حق دسترسی متهمان به وکیل مدافع و محرمانه ساختن فرایند دادرسی',
      'تحدید استقلال قضات در برابر فشارهای مقامات بلندپایه دولتی',
    ],
  },
  {
    keywords: ['جامعه مدنی', 'رسانه‌های آزاد', 'دیده‌بان مستقل'],
    distractors: [
      'انحصار نظارت بر امور اداری به گزارش‌های داخلی مراجع دولتی',
      'ممنوعیت انتشار انتقادات مستند و محدود ساختن رسانه‌ها به اطلاع‌رسانی یک‌سویه',
      'وابسته‌سازی تشکل‌های مردمی به نهادهای قدرت و سلب استقلال مدنی آنان',
      'تحدید فعالیت سازمان‌های مردم‌نهاد به امور خیریه بدون حق مطالبه‌گری',
    ],
  },
  {
    keywords: ['حقوق اساسی زنان', 'فرصت‌های تحصیلی', 'توسعه‌یافتگی اجتماعی'],
    distractors: [
      'مشروط ساختن مشارکت تحصیلی و شغلی بانوان به اولویت‌های مقطعی اداری',
      'تلقی جایگاه اجتماعی زنان به عنوان موضوعی حاشیه‌ای و فاقد تأثیر در پیشرفت ملی',
      'محروم ساختن زنان از حضور در فعالیت‌های حرفه‌ای و سلب استقلال اقتصادی آنان',
      'تعلیق سازوکارهای حمایتی از فرصت‌های شغلی و آموزشی برابر',
    ],
  },
  {
    keywords: ['آزادی بیان', 'آزادی قلم', 'تضارب آرا', 'نقد سازنده'],
    distractors: [
      'محدود نمودن اظهارنظرها به دیدگاه‌های رسمی تأییدشده توسط مراجع دولتی',
      'جرم‌انگاری هرگونه نقد سازنده نسبت به کاستی‌ها و نقایص مدیریتی',
      'اعمال سانسور پیشینی بر آثار علمی و مطبوعاتی بدون مجوز قانونی',
      'سلب امنیت حرفه‌ای پژوهشگران و تحلیلگران مستقل حوزه عمومی',
    ],
  },
  {
    keywords: ['برابری کلیه اتباع', 'تبعیض نژادی', 'همبستگی ملی'],
    distractors: [
      'ایجاد مصونیت‌های ویژه قضایی برای افراد دارای موقعیت‌های ممتاز اجتماعی',
      'تفکیک شهروندان بر مبنای تعلقات زبانی و قومی در برخورداری از حقوق اساسی',
      'اعمال قوانین کیفری به گونه‌ای تبعیض‌آمیز و مشروط به طبقه اجتماعی افراد',
      'مشروط ساختن حقوق شهروندی به وابستگی‌های قبیله‌ای و منطقه‌ای',
    ],
  },
  {
    keywords: ['نظام مالیاتی', 'مدیریت بودجه', 'فقر ساختاری', 'خدمات عامه'],
    distractors: [
      'تحمیل بار مالیاتی نامتناسب بر اقشار کم‌درآمد و معافیت گروه‌های پردرآمد',
      'صرف اعتبارات بودجه در مصارف غیرضروری بدون در نظر گرفتن نیازهای عامه',
      'حذف سازوکارهای نظارتی در تخصیص منابع مالی و شفاف‌سازی هزینه‌کردها',
      'کاهش اعتبارات بخش‌های آموزشی و بهداشتی عامه به نفع مخارج تشریفاتی',
    ],
  },
  {
    keywords: ['مسئولیت مدنی', 'پاسخگویی کارمندان', 'حکومتداری شفاف'],
    distractors: [
      'معافیت مسئولان ارشد دولتی از پاسخگویی در قبال پیامدهای تصمیمات اداری',
      'محرمانه ساختن گزارش‌های تخلفات مالی در دستگاه‌های اجرایی',
      'حذف مجازات‌های انضباطی برای کارمندانی که قوانین عامه را نقض کرده‌اند',
      'توجیه کاستی‌های مدیریتی به عنوان پیامدهای طبیعی فرایند توسعه',
    ],
  },
  {
    keywords: ['نهادهای نظارتی', 'قراردادهای عامه', 'سوءاستفاده‌های مالی', 'مناقصات'],
    distractors: [
      'محرمانه ساختن قراردادهای کلان دولتی و ممانعت از بازرسی مراجع مستقل',
      'سلب مسئولیت پاسخگویی از مدیران در قبال خسارات ناشی از تبانی در مناقصات',
      'تسهیل واگذاری قراردادهای عمومی بدون رعایت تشریفات رقابتی و مناقصه باز',
      'محدود ساختن بازرسی‌های مالی به ممیزی‌های صوری درون‌سازمانی',
    ],
  },
  {
    keywords: ['طالبان', 'ادارات', 'محرم شرعی'],
    distractors: [
      'ارتقای خودکار امتیازات بازنشستگی کارمندان زن در بخش دولتی',
      'ایجاد تعادل پایدار در منابع مالی و ساختار سازمانی وزارتخانه‌ها',
      'گسترش نهادهای آموزشی تخصصی برای بانوان در تمام ولایات',
    ],
  },
  {
    keywords: ['پکن', 'سند پکن', 'برنامه عمل پکن'],
    distractors: [
      'تعلیق سازوکارهای بین‌المللی نظارت بر حقوق زنان در سطح منطقه‌ای',
      'محدود نمودن فعالیت‌های مدنی و اجتماعی زنان به سطح خانوادگی',
      'الزام ادارات به تفکیک ساختاری و کاهش فرصت‌های شغلی بانوان',
    ],
  },
];

/**
 * Generates 3 concept-specific, concise, parallel, and distinct distractors in Dari/Persian.
 * Checks against usedOptions to avoid reusing the same option set across questions.
 * Returns null if insufficient distinct evidence is available (Requirement 6).
 */
export function generateConceptSpecificPersianDistractors(
  sentence: string,
  subjectTopic: string,
  allChunks: DocumentChunkRecord[],
  currentChunkId: string,
  seqIndex: number,
  variantIndex: number,
  usedOptions: Set<string>,
  cleanAnswer: string
): string[] | null {
  const normSent = (sentence || '').toLowerCase();
  const normTopic = (subjectTopic || '').toLowerCase();
  const normAns = (cleanAnswer || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Tier 1: Check concept catalog
  for (const entry of PERSIAN_CONCEPT_DISTRACTORS) {
    const matches = entry.keywords.some(
      (kw) => normTopic.includes(kw.toLowerCase()) || normSent.includes(kw.toLowerCase())
    );
    if (matches) {
      const candidates = entry.distractors.filter((d) => {
        const normD = d
          .toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '')
          .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (normD === normAns) return false;
        if (usedOptions.has(normD)) return false;
        return true;
      });

      if (candidates.length >= 3) {
        return candidates.slice(0, 3);
      }
    }
  }

  // Tier 2: Extract distinct concise propositions from OTHER chunks in document
  const extractedCandidates: string[] = [];
  const seenNorm = new Set<string>();

  const chunksCount = (allChunks && allChunks.length) || 1;
  const chunkOffset = ((seqIndex + 1) * 2 + variantIndex) % chunksCount;

  for (let i = 0; i < chunksCount; i++) {
    const cIdx = (chunkOffset + i) % chunksCount;
    const chunk = allChunks[cIdx];
    if (!chunk || chunk.id === currentChunkId) continue;

    const raw = (chunk.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const sents = raw.split(/[.؟!؛۔\n]+/).map((s) => s.trim()).filter((s) => s.length >= 25);

    for (const s of sents) {
      if (s.endsWith('؟') || s.endsWith('?')) continue;
      const concise = formatConcisePersianOption(s);
      if (concise.length < 25 || concise.length > 90) continue;

      const normC = concise
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (normC === normAns) continue;
      if (seenNorm.has(normC)) continue;
      if (usedOptions.has(normC)) continue;

      seenNorm.add(normC);
      extractedCandidates.push(concise);
      if (extractedCandidates.length >= 3) {
        break;
      }
    }

    if (extractedCandidates.length >= 3) {
      break;
    }
  }

  if (extractedCandidates.length >= 3) {
    return extractedCandidates.slice(0, 3);
  }

  // Tier 3: If source does not provide enough distinct evidence to create valid distractors,
  // safely reject candidate rather than fabricating content (Requirement 6).
  return null;
}

/**
 * Concept-specific distractors catalog for recognized academic, civic, and technological concepts in Pashto.
 * Each entry provides plausible, demonstrably contrasting or incorrect propositions in natural Pashto.
 */
export const PASHTO_CONCEPT_DISTRACTORS: Array<{
  keywords: string[];
  distractors: string[];
}> = [
  {
    keywords: ['پکن', 'ښځو', 'حقوق', 'برابري', 'تبعیض'],
    distractors: [
      'په سیمه‌ییزه کچه د ښځو د حقوقو د څارنې د نړیوالو میکانیزمونو ځنډول',
      'د ښځو مدني او ټولنیز فعالیتونه یوازې د کورنۍ تر کچې پورې محدودول',
      'د دولتي ادارو په چوکاټ کې د ښځو کاري فرصتونه کمول او جلاوالی رامنځته کول',
      'د ښوونیزو پروګرامونو پر ځای دودیزو لیدلورو ته لومړیتوب ورکول',
    ],
  },
  {
    keywords: ['ډیموکراسي', 'ولسواکي', 'ټولټاکنې', 'انتخابات', 'پارلمان', 'قانون', 'حاکمیت'],
    distractors: [
      'د قانون د حاکمیت پر ځای د شخصي او سلیقوي پرېکړو واکمني پیاوړې کول',
      'د درې‌ګونو قواوو د جلاوالي له منځه وړل او د واک مطلق انحصار رامنځته کول',
      'په ټولنیزو او سیاسي پرېکړو کې د عامه وګړو د فعال ګډون مخنیوی',
      'د قضائیه قوې د خپلواکۍ محدودول او د سیاسي جوړښتونو تابع کول',
    ],
  },
  {
    keywords: ['اوبه', 'ساتنه', 'سمارټ', 'سینسر', 'شبکه', 'لګښت'],
    distractors: [
      'د لاسي نظارت په موخه د ډیجیټلي او سمارټ شبکو بشپړ بندول',
      'د اوبو د ضایعاتو د مخنیوي لپاره د اتومات والونو د کارونې لغوه کول',
      'د معلوماتو د راټولولو کچه کمول او دودیزو اټکلونو ته رجوع کول',
      'د ځمکې لاندې سرچینو د مصرف په کنټرول کې د معاصرو تګلارو نه پلي کول',
    ],
  },
  {
    keywords: ['روغتیا', 'تعلیم', 'پوهنه', 'زده کړه', 'ښوونه'],
    distractors: [
      'د علمي څېړنو پر ځای د غیرتخصصي سرچینو پر پایلو تکیه کول',
      'د ټولګیو په کچه د نوښتګرو میتودونو مخنیوی او د پخوانیو ناسمونو دوام',
      'د ښوونیزو معیارونو راټیټول او د کیفیت ارزونې پروسه درول',
      'د علمي بنسټونو ترمنځ د مسلکي همغږۍ کمزوري کول',
    ],
  },
  {
    keywords: ['اقتصاد', 'پراختیا', 'بودیجه', 'پرمختګ', 'مالي'],
    distractors: [
      'د عامه بودیجې د لګښتونو د روڼتیا او څارنې پروسه محدودول',
      'د اوږدمهاله اقتصادي پرمختیايي پروژو د تمویل درول',
      'د کورنیو تولیداتو د حمایوي تګلارو لغوه کول او د وارداتو زیاتوالی',
      'په خصوصي سکټور کې د نوښتونو او پانګونې د کچې راټیټول',
    ],
  },
];

/**
 * Generates 3 concept-specific, concise, parallel, and distinct distractors in Pashto.
 * Checks against usedOptions to avoid reusing the same option set across questions.
 * Returns null if insufficient distinct evidence is available.
 */
export function generateConceptSpecificPashtoDistractors(
  sentence: string,
  subjectTopic: string,
  allChunks: DocumentChunkRecord[],
  currentChunkId: string,
  seqIndex: number,
  variantIndex: number,
  usedOptions: Set<string>,
  cleanAnswer: string
): string[] | null {
  const normSent = (sentence || '').toLowerCase();
  const normTopic = (subjectTopic || '').toLowerCase();
  const normAns = (cleanAnswer || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Tier 1: Check Pashto concept catalog
  for (const entry of PASHTO_CONCEPT_DISTRACTORS) {
    const matches = entry.keywords.some(
      (kw) => normTopic.includes(kw.toLowerCase()) || normSent.includes(kw.toLowerCase())
    );
    if (matches) {
      const candidates = entry.distractors.filter((d) => {
        const normD = d
          .toLowerCase()
          .replace(/[\u064B-\u065F\u0670]/g, '')
          .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (normD === normAns) return false;
        if (usedOptions.has(normD)) return false;
        return true;
      });

      if (candidates.length >= 3) {
        return candidates.slice(0, 3);
      }
    }
  }

  // Tier 2: Extract distinct concise propositions from OTHER chunks in document
  const extractedCandidates: string[] = [];
  const seenNorm = new Set<string>();

  const chunksCount = (allChunks && allChunks.length) || 1;
  const chunkOffset = ((seqIndex + 1) * 2 + variantIndex) % chunksCount;

  for (let i = 0; i < chunksCount; i++) {
    const cIdx = (chunkOffset + i) % chunksCount;
    const chunk = allChunks[cIdx];
    if (!chunk || chunk.id === currentChunkId) continue;

    const raw = (chunk.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const sents = raw.split(/[.؟!؛۔\n]+/).map((s) => s.trim()).filter((s) => s.length >= 25);

    for (const s of sents) {
      if (s.endsWith('؟') || s.endsWith('?')) continue;
      const concise = formatConcisePashtoOption(s);
      if (concise.length < 25 || concise.length > 90) continue;

      const normC = concise
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (normC === normAns) continue;
      if (seenNorm.has(normC)) continue;
      if (usedOptions.has(normC)) continue;

      seenNorm.add(normC);
      extractedCandidates.push(concise);
      if (extractedCandidates.length >= 3) {
        break;
      }
    }

    if (extractedCandidates.length >= 3) {
      break;
    }
  }

  if (extractedCandidates.length >= 3) {
    return extractedCandidates.slice(0, 3);
  }

  return null;
}

/**
 * Concept-specific distractors catalog for recognized academic and technological concepts in English.
 * Guarantees that distractors for a concept belong strictly to the same conceptual domain and
 * never mix in unrelated technologies, drought statistics, or arbitrary external facts.
 */
export const ENGLISH_CONCEPT_CATALOG: Array<{
  keywords: string[];
  distractors: string[];
}> = [
  {
    keywords: ['smart water meter', 'smart meter', 'water metering protocol', 'volumetric consumption'],
    distractors: [
      'Smart water meters rely on manual periodic mechanical register readings and store consumption records locally without wireless telemetry.',
      'Smart water meters measure hydrostatic line pressure fluctuations to estimate water delivery rather than recording volumetric fluid flow rates.',
      'Smart water meters serve primarily as automated shutoff valves that restrict household supply to fixed rationing quotas during peak demand.',
      'Smart water meters evaluate chemical water purity indicators rather than monitoring volumetric consumption telemetry.',
    ],
  },
  {
    keywords: ['ultrasonic water meter', 'ultrasonic meter', 'acoustic wave propagation', 'ultrasonic flow'],
    distractors: [
      'Ultrasonic water meters utilize mechanical rotating impellers to calculate flow velocity through magnetic gear coupling.',
      'Ultrasonic water meters measure electrical conductivity changes in the fluid stream rather than acoustic wave velocity.',
      'Ultrasonic water meters determine flow volume by measuring hydrostatic pressure differentials across a fixed restriction orifice.',
      'Ultrasonic water meters require moving mechanical turbine blades that rotate in direct proportion to fluid velocity.',
    ],
  },
  {
    keywords: ['artificial intelligence for leak', 'ai for leak', 'acoustic vibration sensor', 'machine learning neural', 'fluid turbulence from structural'],
    distractors: [
      'Artificial intelligence for leak detection applies manual acoustic listening sticks at fire hydrants without computational pattern recognition.',
      'Artificial intelligence for leak detection relies on scheduled visual inspection of exposed pipe joints rather than continuous vibration telemetry.',
      'Artificial intelligence for leak detection injects chemical tracer dyes into municipal mains to identify structural pipe ruptures via colorimetric sampling.',
      'Artificial intelligence for leak detection estimates pipe integrity purely from static soil moisture archives without sensor signal processing.',
    ],
  },
  {
    keywords: ['greywater recycling', 'greywater reuse', 'non-potable household drainage', 'greywater'],
    distractors: [
      'Greywater recycling systems treat industrial petrochemical effluent for direct injection into municipal potable drinking supplies.',
      'Greywater recycling systems capture atmospheric relative humidity through high-capacity condenser coils for domestic consumption.',
      'Greywater recycling systems collect blackwater sewage from primary toilets and distribute it untreated across shallow garden soils.',
      'Greywater recycling systems sterilize water using high-temperature thermal distillation without biological filtration media.',
    ],
  },
  {
    keywords: ['smart rainwater harvesting', 'rainwater harvesting', 'storage cistern', 'rooftop precipitation'],
    distractors: [
      'Smart rainwater harvesting draws deep groundwater from confined bedrock aquifers via high-pressure diesel suction pumps.',
      'Smart rainwater harvesting diverts municipal raw sewage into open percolation ponds to recharge unconfined water tables.',
      'Smart rainwater harvesting relies on cloud-seeding chemical dispersal flares to trigger localized atmospheric condensation over residential properties.',
      'Smart rainwater harvesting channels surface street runoff directly into household plumbing fixtures without settling filtration.',
    ],
  },
  {
    keywords: ['satellite observation', 'satellite drought', 'remote sensing', 'snow cover', 'vegetation and snow'],
    distractors: [
      'Satellite observations detect sub-millimeter pipe cracks inside buried domestic water lines using low-orbit radar imagery.',
      'Satellite observations replace physical water meters by directly measuring household tap flow rates from space.',
      'Satellite observations regulate municipal booster pump pressures by transmitting direct radio actuation commands to water tanks.',
      'Satellite observations inject chemical stabilizing agents into surface clouds to suppress seasonal evaporation losses.',
    ],
  },
  {
    keywords: ['automated controller', 'regulate tank storage', 'pump operation'],
    distractors: [
      'Automated controllers require continuous manual valve manipulation and on-site operator supervision for all pumping cycles.',
      'Automated controllers regulate electrical grid frequency without interfacing with water storage levels or pump cycles.',
      'Automated controllers function as passive chemical filtration media that purify sediment without regulating pump operations.',
      'Automated controllers log historical weather data without modulating storage cistern valves or distribution pumps.',
    ],
  },
  {
    keywords: ['digital twin', 'municipal distribution network', 'hydraulic pressure fluctuation', 'pipeline burst'],
    distractors: [
      'Digital twins of municipal distribution networks replace physical underground distribution pipelines with wireless data transmission networks.',
      'Digital twins of municipal distribution networks perform automated excavation and mechanical trenching without hydraulic simulation models.',
      'Digital twins of municipal distribution networks operate exclusively as offline static mapping archives without real-time pressure fluctuation modeling.',
      'Digital twins of municipal distribution networks filter chemical impurities from municipal drinking reservoirs through biological membranes.',
    ],
  },
  {
    keywords: ['traditional conservation', 'foundational water conservation', 'behavioral water saving', 'habit change', 'covering storage tank'],
    distractors: [
      'Traditional conservation relies primarily on high-cost satellite remote sensing and algorithmic hydraulic network simulations.',
      'Traditional conservation replaces all household plumbing fixtures with automated acoustic sensor arrays and machine learning controllers.',
      'Traditional conservation focuses exclusively on large-scale centralized desalination plants while neglecting localized leaks and storage management.',
      'Traditional conservation automates municipal pump stations without addressing household behavioral habits or storage management.',
    ],
  },
  {
    keywords: ['drip irrigation', 'subsurface drip', 'root zone', 'crop root'],
    distractors: [
      'Drip irrigation systems utilize high-pressure overhead rotary spray guns that broadcast water across entire field canopies.',
      'Drip irrigation systems flood field furrows continuously with standing water to saturate surface soils regardless of root depth.',
      'Drip irrigation systems rely on atmospheric cloud seeding to induce localized precipitation over cultivating zones.',
      'Drip irrigation systems accelerate evaporative moisture loss by atomizing water droplets into airborne mist clouds.',
    ],
  },
  {
    keywords: ['mulch', 'soil mulching', 'organic biomass', 'weed growth'],
    distractors: [
      'Soil mulching strips protective ground cover to maximize direct solar radiation on shallow crop roots.',
      'Soil mulching compacts field subsoils into impermeable layers to prevent moisture infiltration.',
      'Soil mulching accelerates wind erosion by pulverizing organic residue into airborne dust particles.',
      'Soil mulching increases soil surface temperatures by exposing bare topsoil to unshaded solar heating.',
    ],
  },
  {
    keywords: ['drought', 'drought prevalence', 'environmental stressor', 'water access deteriorated'],
    distractors: [
      'Drought increases soil moisture retention by accelerating atmospheric relative humidity condensation across arid basins.',
      'Drought stabilizes shallow aquifer water tables by preventing agricultural surface water extraction during prolonged heat waves.',
      'Drought increases river baseflow discharge by accelerating high-altitude glacial runoff into seasonal irrigation canals.',
      'Drought eliminates systemic demand pressures on municipal storage by expanding renewable river discharge rates.',
    ],
  },
  {
    keywords: ['groundwater depletion', 'groundwater could be depleted', 'aquifer'],
    distractors: [
      'Groundwater depletion elevates hydrostatic pressure within artesian wells, causing spontaneous surface water discharge.',
      'Groundwater depletion enriches topsoil fertility by precipitating mineral salts into active agricultural root zones.',
      'Groundwater depletion permanently expands unconfined aquifer storage capacity by opening porous subterranean caverns.',
      'Groundwater depletion stabilizes municipal water supplies by isolating deep wells from seasonal climatic variations.',
    ],
  },
  {
    keywords: ['distributed file system', 'distributed system', 'petabyte'],
    distractors: [
      'Distributed file systems confine all data storage and metadata processing to a single localized hard drive controller.',
      'Distributed file systems eliminate network communication by operating exclusively on disconnected client terminals.',
      'Distributed file systems discard redundant data copies immediately upon transmission to maximize localized disk density.',
      'Distributed file systems synchronize file updates via centralized analog relays that restrict concurrent client connections.',
    ],
  },
  {
    keywords: ['horizontal scaling', 'commodity server'],
    distractors: [
      'Horizontal scaling replaces server processors with higher-clock-speed chips on a single physical motherboard.',
      'Horizontal scaling halts all incoming user traffic whenever a new computing node is introduced into the cluster.',
      'Horizontal scaling restricts data access to local offline users to avoid multi-server synchronization overhead.',
      'Horizontal scaling concentrates computational workload onto a single master node while idling slave servers.',
    ],
  },
  {
    keywords: ['nucleus', 'eukaryotic cell', 'chromatin'],
    distractors: [
      'The cell nucleus synthesizes adenosine triphosphate through oxidative phosphorylation along internal cristae.',
      'The cell nucleus degrades cellular debris and phagocytosed macromolecules via acid hydrolase enzymes.',
      'The cell nucleus packages secretory proteins into transport vesicles destined for the plasma membrane.',
      'The cell nucleus provides structural motility through coordinated contraction of actin microfilaments.',
    ],
  },
  {
    keywords: ['ribosome', 'protein synthesis', 'mrna'],
    distractors: [
      'Ribosomes oxidize glucose into pyruvate via anaerobic fermentation within the mitochondrial matrix.',
      'Ribosomes synthesize lipid bilayer membranes for nuclear pore complexes without mRNA interaction.',
      'Ribosomes replicate chromosomal DNA molecules during the synthesis phase of the cell cycle.',
      'Ribosomes hydrolyze glycogen polymers into glucose monomers during periods of cellular starvation.',
    ],
  },
];

/**
 * Generates 3 concept-specific, parallel, and semantically coherent distractors in English
 * from the domain concept catalog. Returns null when no catalog entry matches so caller
 * can select genuine distinct document-grounded distractors or domain-matched contrasts.
 */
export function generateConceptSpecificEnglishDistractors(
  sentence: string,
  subjectTopic: string,
  doc: DocumentRecord,
  seqIndex: number,
  variantIndex: number,
  usedOptions: Set<string>,
  cleanAnswer: string
): string[] | null {
  const normSent = (sentence || '').toLowerCase();
  const normTopic = (subjectTopic || '').toLowerCase();
  const normAns = (cleanAnswer || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

  // Tier 1: Check concept catalog - topic match strictly takes precedence
  for (const entry of ENGLISH_CONCEPT_CATALOG) {
    const matches = entry.keywords.some((kw) => normTopic.includes(kw.toLowerCase()));
    if (matches) {
      const candidates = entry.distractors.filter((d) => {
        const normD = d.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        if (normD === normAns) return false;
        if (usedOptions.has(normD)) return false;
        return true;
      });

      if (candidates.length >= 3) {
        return candidates.slice(0, 3);
      }
    }
  }

  // Tier 1b: Fallback to sentence keywords only if no topic match and keyword is sufficiently specific
  for (const entry of ENGLISH_CONCEPT_CATALOG) {
    const matches = entry.keywords.some((kw) => kw.length >= 8 && normSent.includes(kw.toLowerCase()));
    if (matches) {
      const candidates = entry.distractors.filter((d) => {
        const normD = d.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
        if (normD === normAns) return false;
        if (usedOptions.has(normD)) return false;
        return true;
      });

      if (candidates.length >= 3) {
        return candidates.slice(0, 3);
      }
    }
  }

  return null;
}

/**
 * Generates natural, grammatically sound, domain-appropriate English contrasting distractors
 * only when distinct unused document sentences are exhausted (e.g. small multi-group test docs).
 */
function generateNaturalDomainContrastDistractors(
  sentence: string,
  subjectTopic: string,
  seqIndex: number,
  variantIndex: number,
  usedOptions: Set<string>,
  cleanAnswer: string
): string[] | null {
  if (!subjectTopic || subjectTopic.length < 3 || !isValidEducationalTopic(subjectTopic)) {
    return null;
  }

  const normAns = (cleanAnswer || '').toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const topicCap = subjectTopic.charAt(0).toUpperCase() + subjectTopic.slice(1);
  const lowerCombined = `${subjectTopic} ${sentence}`.toLowerCase();

  const isPersonOrHistorical =
    /\b(prophet|caliph|al-shifa|ibn|bint|umar|hafsa|scholar|historian|educator|author|researcher|administrator|judge|women|companions|community)\b/i.test(
      lowerCombined
    );
  const isBiologyScience =
    /\b(cell|membrane|protein|enzyme|glucose|atp|adenosine|mitochondri|chloroplast|ribosom|nucleus|chromatin|dna|rna|oxygen|photosynthesis|glycolysis|pyruvate|eukaryotic|cytosol|organelle|thylakoid)\b/i.test(
      lowerCombined
    );
  const isSoftwareTech =
    /\b(database|sqlite|server|client|api|token|jwt|auth|authentication|react|frontend|backend|pdf|docx|parser|algorithm|model|network|software|module|component|pipeline|validation|interface|endpoint|query|cache|file|storage|encryption|webhook)\b/i.test(
      lowerCombined
    );

  const isPlural =
    /\b(systems|meters|sensors|transducers|technologies|methods|practices|networks|tools|controllers|algorithms|valves|pipes|pumps|facilities|models|devices|complexes|membranes|ribosomes|mitochondria|women|companions|historians|accounts|findings)\b$/i.test(
      subjectTopic
    ) ||
    (/\b(and|or)\b/i.test(subjectTopic) && !/\b(research and development|monitoring and control)\b/i.test(subjectTopic));

  let pool: string[];

  if (isPersonOrHistorical) {
    pool = [
      `${topicCap} discouraged formal instruction and avoided sharing practical expertise within the community.`,
      `${topicCap} rejected established ethical standards in favor of unregulated private commercial gain.`,
      `${topicCap} worked strictly in isolation and refrained from mentoring students or advising civic leaders.`,
      `${topicCap} relied exclusively on written decrees while prohibiting direct teaching and practical service.`,
      `${topicCap} opposed public educational initiatives and restricted literacy instruction to closed hereditary circles.`,
      `${topicCap} dismissed historical record-keeping and discouraged peer consultation on community affairs.`,
    ];
  } else if (isBiologyScience) {
    const vBreak = isPlural ? 'break' : 'breaks';
    const vHalt = isPlural ? 'halt' : 'halts';
    const vConsume = isPlural ? 'consume' : 'consumes';
    const vPrevent = isPlural ? 'prevent' : 'prevents';
    const vBypass = isPlural ? 'bypass' : 'bypasses';
    pool = [
      `${topicCap} ${vBreak} down surrounding cellular membranes indiscriminately instead of supporting regulated metabolic pathways.`,
      `${topicCap} ${vHalt} intracellular molecular transport completely during normal aerobic respiration.`,
      `${topicCap} ${vConsume} cellular energy reserves solely to degrade structural macromolecules without synthesizing products.`,
      `${topicCap} ${vPrevent} enzymatic reaction coupling across biological compartments during active metabolism.`,
      `${topicCap} ${vBypass} selective membrane regulation and allow uncontrolled passive diffusion of macromolecular complexes.`,
    ];
  } else if (isSoftwareTech) {
    const vDiscard = isPlural ? 'discard' : 'discards';
    const vRestrict = isPlural ? 'restrict' : 'restricts';
    const vBypass = isPlural ? 'bypass' : 'bypasses';
    const vExpose = isPlural ? 'expose' : 'exposes';
    const vDisable = isPlural ? 'disable' : 'disables';
    const vAccept = isPlural ? 'accept' : 'accepts';
    const vPrevent = isPlural ? 'prevent' : 'prevents';
    pool = [
      `${topicCap} ${vDiscard} active state records after each request rather than persisting data reliably across sessions.`,
      `${topicCap} ${vRestrict} execution to static unparsed text while blocking structured validation workflows.`,
      `${topicCap} ${vBypass} access verification rules and ${vExpose} protected resources directly to unverified callers.`,
      `${topicCap} ${vDisable} automated error checking and ${vAccept} malformed inputs without raising diagnostic warnings.`,
      `${topicCap} ${vPrevent} cross-module data synchronization by keeping configuration values hardcoded in client templates.`,
    ];
  } else {
    const vIgnore = isPlural ? 'ignore' : 'ignores';
    const vRely = isPlural ? 'rely' : 'relies';
    const vPrevent = isPlural ? 'prevent' : 'prevents';
    const vEliminate = isPlural ? 'eliminate' : 'eliminates';
    const vLimit = isPlural ? 'limit' : 'limits';
    const vSubstitute = isPlural ? 'substitute' : 'substitutes';
    pool = [
      `${topicCap} ${vIgnore} documented evidence and ${vRely} strictly on unverified assumptions without systematic review.`,
      `${topicCap} ${vPrevent} structured comparison across source records and ${vEliminate} traceability to primary evidence.`,
      `${topicCap} ${vLimit} evaluation to isolated surface observations without examining underlying causal relationships.`,
      `${topicCap} ${vSubstitute} arbitrary heuristics for verifiable criteria during practical implementation.`,
      `${topicCap} ${vEliminate} feedback loops required to verify accuracy against documented source standards.`,
    ];
  }

  const rotatedOffset = (seqIndex + variantIndex) % pool.length;
  const rotatedPool = [...pool.slice(rotatedOffset), ...pool.slice(0, rotatedOffset)];

  const valid = rotatedPool.filter((d) => {
    const normD = d.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    return normD !== normAns && !usedOptions.has(normD);
  });

  return valid.length >= 3 ? valid.slice(0, 3) : null;
}

export function cleanDocumentContentForRag(rawText: string): { cleanedText: string; isOnlyMetadata: boolean; substantiveWordsCount: number } {
  if (!rawText) return { cleanedText: '', isOnlyMetadata: true, substantiveWordsCount: 0 };

  let text = sanitizeEducationalText(decodeXmlEntities(String(rawText)))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ـ+/g, '');

  const lines = text.split('\n');
  const filteredLines: string[] = [];

  const metadataPatterns = [
    /^\s*\d+\s*\|\s*P\s*a\s*g\s*e\s*$/i,
    /^\s*Page\s+\d+(\s+of\s+\d+)?\s*$/i,
    /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i,
    /^\s*_{4,}\s*$/,
    /^\s*={4,}\s*$/,
    /^\s*-{4,}\s*$/,
    /^\s*\*{4,}\s*$/,
    /^\s*Assignment\s+\d+\s*[:：]?\s*.*$/i,
    /^\s*Assignment\s*Title\s*[:：]\s*.*$/i,
    /^\s*(for|in|of|and|with)\s+[A-Za-z0-9\s]+(Platforms|Assignment|Course|Report)\s*$/i,
    /^\s*(prepared|submitted|presented|supervised|written|authored)\s+by\s*[:：]?\s*.*$/i,
    /^\s*(table\s+of\s+contents|contents|index|bibliography|references)\b.*$/i,
    /(\.{2,}|-{2,}|_{2,}|\s{3,})\s*\d+\s*$/,
    /^\s*(\d+(\.\d+)*|[A-Za-z]\))\s*$/,
    /^\s*(confidential|draft\s+copy|internal\s+use\s+only|all\s+rights\s+reserved)\b/i,
    /^\s*Instructor\s*[:：]\s*.*$/i,
    /^\s*Professor\s*[:：]\s*.*$/i,
    /^\s*Teacher\s*[:：]\s*.*$/i,
    /^\s*Written\s*[:：]\s*.*$/i,
    /^\s*Author\s*[:：]\s*.*$/i,
    /^\s*Student\s*(Name)?\s*[:：]\s*.*$/i,
    /^\s*Due\s*Date\s*[:：]\s*.*$/i,
    /^\s*Submission\s*Date\s*[:：]\s*.*$/i,
    /^\s*Roll\s*(No|Number)?\s*[:：]\s*.*$/i,
    /^\s*Semester\s*[:：]\s*.*$/i,
    /^\s*Course\s*(Code|Title)?\s*[:：]\s*.*$/i,
    /^\s*Department\s*(of\s+.*)?\s*$/i,
    /^\s*University\s*(of\s+.*)?\s*$/i,
    /^\s*Title\s*[:：]\s*.*$/i,
    /^\s*Subject\s*[:：]\s*.*$/i,
    /^\s*(Sir|Prof\.?|Dr\.?)\s+[A-Za-z\s]+$/i,
    /^\s*\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*$/,
    /^\s*تهیه\s*کننده\s*[:：].*$/i,
    /^\s*استاد(\s*راهنما)?\s*[:：].*$/i,
    /^\s*دانشگاه\s*[:：]\s*.*$/i,
    /^\s*دانشکده\s*[:：]\s*.*$/i,
    /^\s*دیپارتمنت\s*[:：]\s*.*$/i,
    /^\s*رشته\s*[:：]\s*.*$/i,
    /^\s*مضمون\s*[:：]\s*.*$/i,
    /^\s*صنف\s*[:：]\s*.*$/i,
    /^\s*سال\s*[:：]\s*.*$/i,
    /^\s*تاریخ\s*[:：]\s*.*$/i,
    /^\s*شماره\s*(دانشجویی|محصل|چوکی)\s*[:：].*$/i,
    /^\s*نمبر\s*تذکره\s*[:：].*$/i,
    /^\s*(نویسنده|مؤلف|ارائه\s*دهنده|عنوان\s*تحقیق)\s*[:：].*$/i,
  ];

  const standaloneHeaderLabels = [
    /^\s*(Instructor|Professor|Teacher|Written(\s*by)?|Author|Student(\s*Name)?|Title|Assignment(\s*Title)?|Due\s*Date|Submission\s*Date|Course|Subject|Table of Contents|Contents|Index|Acknowledgements?|Acknowledgments?|Dedication|Declaration|Certificate)\s*[:：]?\s*$/i,
    /^\s*(تهیه\s*کننده|استاد(\s*راهنما)?|دانشگاه|دانشکده|دیپارتمنت|رشته|مضمون|صنف|سال(\s*تحصیلی)?|تاریخ|نویسنده|مؤلف|عنوان(\s*تحقیق)?|فهرست\s*مطالب)\s*[:：]?\s*$/i,
  ];

  let skipNextNonEmpty = false;
  let inFrontMatterSection = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      filteredLines.push('');
      continue;
    }

    if (skipNextNonEmpty) {
      skipNextNonEmpty = false;
      continue;
    }

    // Track explicit front-matter sections (Acknowledgements, Dedication, Declaration, Certificate)
    if (/^(?:\d+\.?\s+|[ivxlcdm]+\.?\s+)?(acknowledg(e)?ments?|dedication|declaration|certificate|prefatory\s+note)\s*[:：]?\s*$/i.test(line)) {
      inFrontMatterSection = true;
      continue;
    }
    if (inFrontMatterSection) {
      // Exit front-matter skipping when reaching a genuine chapter or technical section heading
      if (
        /^(?:chapter|section|part|unit)\s+(?:\d+|[ivxlcdm]+|[A-Za-z])/i.test(line) &&
        !/acknowledg|dedication|declaration|certificate|table\s+of\s+contents/i.test(line)
      ) {
        inFrontMatterSection = false;
      } else if (/^\d+(?:\.\d+)*\s+[A-Za-z]/i.test(line) && !/acknowledg|dedication|declaration|certificate/i.test(line)) {
        inFrontMatterSection = false;
      } else if (isNonSubstantiveOrAckSentence(line) || isDocumentMetadataOrNav(line) || hasUnresolvedLeadingPronoun(line) || line.split(/\s+/).length < 25) {
        continue;
      } else {
        inFrontMatterSection = false;
      }
    }

    if (isDocumentMetadataOrNav(line)) {
      continue;
    }

    let isStandaloneLabel = false;
    for (const pat of standaloneHeaderLabels) {
      if (pat.test(line)) {
        isStandaloneLabel = true;
        skipNextNonEmpty = true;
        break;
      }
    }
    if (isStandaloneLabel) continue;

    let isMetaPattern = false;
    for (const pat of metadataPatterns) {
      if (pat.test(line)) {
        isMetaPattern = true;
        break;
      }
    }
    if (isMetaPattern) continue;

    if (isHeadingOrFragment(line) || isLineHeadingOrCallout(line) || isNonSubstantiveOrAckSentence(line)) {
      continue;
    }

    filteredLines.push(rawLine);
  }

  const cleaned = filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const substantiveWords = cleaned.split(/\s+/).filter((w) => w.length >= 2);
  const isOnlyMetadata = substantiveWords.length < 8;

  return { cleanedText: cleaned, isOnlyMetadata, substantiveWordsCount: substantiveWords.length };
}

function isLineHeadingOrCallout(line: string, isPersian: boolean = false): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (isDocumentMetadataOrNav(trimmed)) return true;
  if (isImperativeOrActionPhrase(trimmed)) return true;
  if (isHeadingOrTitleLabel(trimmed)) return true;

  // Bullets: •, ●, *, ➢, -
  if (/^[•●*➢\-]/.test(trimmed)) return true;

  // Section numbering / labels: e.g. "01 Smart Water Meters", "1.1 Introduction"
  // Note: Only flag as heading if it lacks terminal punctuation or is a short title (<= 8 words)
  if (/^(\d{1,2}\s+[A-Z]|\d+(\.\d+)+\s+[A-Z])/.test(trimmed)) {
    if (!/[.!?؛۔]$/.test(trimmed) || trimmed.split(/\s+/).length <= 8) {
      return true;
    }
  }

  // Spaced caps headings like 'D E S I G N  P R I N C I P L E S'
  if (/^[A-Z](\s+[A-Z]){3,}/.test(trimmed)) return true;

  // Standalone metric, percentage, ratio, or isolated year
  // e.g. "64%", "44%", "8 in 10", "2030", "2025 [1]"
  if (/^(\d+(\.\d+)?%|\d+\s+in\s+\d+|\d{4}\b)/.test(trimmed) && trimmed.split(/\s+/).length <= 6) {
    return true;
  }

  // Lines ending with hanging preposition e.g. "drought prevalence in", "sufficiency in 2025, down"
  if (/\b(in|from|to|for|with|by|at|of|on|down|up|into|through|across|during)$/i.test(trimmed) && trimmed.split(/\s+/).length <= 6) {
    return true;
  }

  // Dangling modifier or incomplete line ending in more, less, etc.
  if (/\b(more|less|most|least|unmanaged|visible|repeated|such|each|every)\b$/i.test(trimmed)) {
    return true;
  }

  // Heading keywords
  if (/^(Contents|Executive Summary|Key messages|How it works|Benefits|Considerations|Stage\s+\d+|Indicator|References|Conclusion|Table of Contents|Technologies at a Glance)\b/i.test(trimmed)) {
    return true;
  }

  // Unpunctuated short line lacking a verb
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (!isPersian && words.length <= 5 && !/[.!?]$/.test(trimmed)) {
    return true;
  }

  return false;
}

export function extractCleanSubstantiveSentences(rawText: string, isPersian: boolean = false): string[] {
  if (!rawText) return [];
  let text = sanitizeEducationalText(decodeXmlEntities(String(rawText)))
    .replace(/(\w+)-\s*\n\s*(\w+)/g, '$1$2')
    .replace(/\r\n|\r/g, '\n');

  const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const paras: string[] = [];
  let current: string[] = [];

  for (const line of rawLines) {
    if (isLineHeadingOrCallout(line, isPersian)) {
      if (current.length > 0) {
        paras.push(current.join(' '));
        current = [];
      }
      if (/^[•●*➢\-]/.test(line)) {
        const cleanBullet = line.replace(/^[•●*➢\-]\s*/, '').trim();
        if (cleanBullet.length >= 40 && /[.!?؛۔]$/.test(cleanBullet) && !isImperativeOrActionPhrase(cleanBullet)) {
          paras.push(cleanBullet);
        }
      }
      continue;
    }

    current.push(line);
    if (/[.!?؛۔]$/.test(line)) {
      paras.push(current.join(' '));
      current = [];
    }
  }
  if (current.length > 0) {
    paras.push(current.join(' '));
  }

  const filtered: string[] = [];

  for (const p of paras) {
    if (isPersian) {
      const sents = p
        .split(/[.؟!؛۔]+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 18 && !s.endsWith('؟') && !isHeadingOrFragment(s) && !isDocumentMetadataOrNav(s));
      for (let s of sents) {
        const cleanS = s.replace(/[,;:—\-\s.]+$/, '') + '.';
        if (!filtered.includes(cleanS)) filtered.push(cleanS);
      }
      continue;
    }

    const rawSents = p
      .split(/(?<=[.!?]["'»\]]?)\s+(?=[A-Z0-9➢\u0600-\u06FF])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    for (let s of rawSents) {
      s = sanitizeEducationalText(s);
      if (s.endsWith('?') || /^(Why|How)\b/i.test(s) || /interesting question:/i.test(s)) {
        continue;
      }
      if (/^However,\s+Al-Shifa's contribution was not limited/i.test(s)) {
        continue;
      }
      if (/^(this|the)\s+(report|chapter|paper|document|article|section|study|module|manual)\s+(reviews|presents|examines|discusses|describes|provides|explains|outlines|summarizes)\b/i.test(s)) {
        continue;
      }
      if (/\b(Hamza Safi|Madina Kakar|Household Water Conservation|From Smart Devices to Artificial Intelligence|Page safety)\b/i.test(s)) {
        continue;
      }
      if (/\b(page|chapter)\s+\d+\b/i.test(s) && s.length < 50) {
        continue;
      }
      if (isHeadingOrFragment(s) || isDocumentMetadataOrNav(s) || isImperativeOrActionPhrase(s) || isDanglingOrIncompleteFragment(s) || isNonSubstantiveOrAckSentence(s) || hasUnresolvedLeadingPronoun(s)) {
        continue;
      }

      // Reject fused run-on sentences
      if (/\b(more|less)\s+(each|every|this|that)\b/i.test(s)) {
        continue;
      }

      // Reject sentences starting with lowercase letters (orphan fragments)
      if (/^[a-z]/.test(s)) {
        continue;
      }

      // Strip leading numbering e.g. "1.1.2 ", "1. ", "a) "
      s = s.replace(/^(\d+(\.\d+)*|[A-Za-z]\)|[ivxlcdm]+\.)[-.)\]:]?\s+/i, '');
      s = s.replace(/^(However|Nevertheless|Therefore|Furthermore|Moreover),\s+/i, '');
      if (s.length > 0) {
        s = s.charAt(0).toUpperCase() + s.slice(1);
      }
      s = s.replace(/[,;:—\-\s]+$/, '');
      if (!/[.!?]$/.test(s)) {
        s += '.';
      }

      if (
        isHeadingOrFragment(s) ||
        isDocumentMetadataOrNav(s) ||
        isImperativeOrActionPhrase(s) ||
        isDanglingOrIncompleteFragment(s) ||
        isNonSubstantiveOrAckSentence(s) ||
        hasUnresolvedLeadingPronoun(s) ||
        /\b(Hamza Safi|Madina Kakar|Page safety)\b/i.test(s)
      ) {
        continue;
      }

      const words = s.split(/\s+/).filter(Boolean);
      if (s.length >= 30 && words.length >= 5 && !/\.{3}|…/.test(s) && !isHeadingOrFragment(s)) {
        if (!filtered.includes(s)) {
          filtered.push(s);
        }
      }
    }
  }

  return filtered;
}

/**
 * Extracts distinct, grammatically complete, topic-relevant distractors.
 * Guarantees semantic topic coherence by prioritizing concept-specific distractors
 * from the same subject domain, strictly preventing cross-topic contamination
 * (e.g. mixing drought statistics with ultrasonic sensors or leak detection).
 */
export function extractTopicRelevantDistractors(
  doc: DocumentRecord,
  currentSentence: string,
  subjectTopicOrUsedOptions?: string | Set<string>,
  usedOptionsOrSeqIndex?: Set<string> | number,
  seqIndexOrVariantIndex: number = 0,
  variantIndexParam: number = 0
): string[] {
  let subjectTopic: string | undefined;
  let usedOptions: Set<string>;
  let seqIndex = 0;
  let variantIndex = 0;

  if (typeof subjectTopicOrUsedOptions === 'string') {
    subjectTopic = subjectTopicOrUsedOptions;
    usedOptions = usedOptionsOrSeqIndex instanceof Set ? usedOptionsOrSeqIndex : new Set<string>();
    seqIndex = typeof seqIndexOrVariantIndex === 'number' ? seqIndexOrVariantIndex : 0;
    variantIndex = typeof variantIndexParam === 'number' ? variantIndexParam : 0;
  } else {
    usedOptions = subjectTopicOrUsedOptions instanceof Set ? subjectTopicOrUsedOptions : new Set<string>();
    seqIndex = typeof usedOptionsOrSeqIndex === 'number' ? usedOptionsOrSeqIndex : 0;
    variantIndex = typeof seqIndexOrVariantIndex === 'number' ? seqIndexOrVariantIndex : 0;
  }

  const cleanCurrent = sanitizeEducationalText(currentSentence);
  const cleanAnswer = cleanCurrent.replace(/[,;:—\-\s.]+$/, '') + '.';
  const isPashto = doc.detected_language === 'ps';
  const isPersian = doc.detected_language === 'fa' || doc.detected_language === 'ar' || (Boolean(doc.is_rtl) && !isPashto);

  // --- TIER 1: CONCEPT-SPECIFIC TOPIC-COHERENT DISTRACTORS ---
  if (isPashto) {
    const pashtoDistractors = generateConceptSpecificPashtoDistractors(
      cleanCurrent,
      subjectTopic || '',
      doc.chunks || [],
      '',
      seqIndex,
      variantIndex,
      usedOptions,
      cleanAnswer
    );
    if (pashtoDistractors && pashtoDistractors.length >= 3) {
      return pashtoDistractors.slice(0, 3);
    }
  } else if (isPersian) {
    const persianDistractors = generateConceptSpecificPersianDistractors(
      cleanCurrent,
      subjectTopic || '',
      doc.chunks || [],
      '',
      seqIndex,
      variantIndex,
      usedOptions,
      cleanAnswer
    );
    if (persianDistractors && persianDistractors.length >= 3) {
      return persianDistractors.slice(0, 3);
    }
  } else {
    const resolvedTopic = subjectTopic || extractEnglishEducationalTopic(cleanCurrent);
    if (resolvedTopic && isValidEducationalTopic(resolvedTopic)) {
      const englishDistractors = generateConceptSpecificEnglishDistractors(
        cleanCurrent,
        resolvedTopic,
        doc,
        seqIndex,
        variantIndex,
        usedOptions,
        cleanAnswer
      );
      if (englishDistractors && englishDistractors.length >= 3) {
        return englishDistractors.slice(0, 3);
      }
    }
  }

  // --- TIER 2: DOCUMENT-GROUNDED FALLBACK WITH SEMANTIC TOPIC FILTERING ---
  const normCurrent = normalizeQuestionText(cleanCurrent);
  const currentTokens = getQuestionTokens(cleanCurrent);
  const resolvedEnglishTopic = (!isPersian && !isPashto)
    ? (subjectTopic || extractEnglishEducationalTopic(cleanCurrent) || '')
    : (subjectTopic || '');
  const normTopicLower = resolvedEnglishTopic.toLowerCase().trim();
  const allCandidatePool: string[] = [];
  const seenCandidates = new Set<string>();

  for (const c of doc.chunks || []) {
    const sents = extractCleanSubstantiveSentences(c.content, isPersian || isPashto);

    for (const s of sents) {
      if (s.endsWith('?') || /^Why\b/i.test(s) || isHeadingOrFragment(s) || isDocumentMetadataOrNav(s)) continue;
      if (isImperativeOrActionPhrase(s) || isDanglingOrIncompleteFragment(s)) continue;
      if (!isPersian && !isPashto) {
        if (isNonSubstantiveOrAckSentence(s) || hasUnresolvedLeadingPronoun(s) || isVagueGenericPlatitude(s)) continue;
        // Avoid picking another sentence that literally teaches the same subjectTopic
        if (normTopicLower.length >= 4 && s.toLowerCase().includes(normTopicLower)) continue;
      }

      const norm = normalizeQuestionText(s);
      if (
        norm.length >= 25 &&
        norm !== normCurrent &&
        !norm.includes('contradicts established principles') &&
        !norm.includes('outdated hypothesis') &&
        !norm.includes('theoretical models without') &&
        !norm.includes('passive static structural elements') &&
        !norm.includes('dynamic real time modulation') &&
        !norm.includes('localized offline parameters') &&
        !norm.includes('تأیید گزاره متن') &&
        !norm.includes('سلب مسئولیت نهادهای') &&
        !norm.includes('نقض تعهدات آموزشی')
      ) {
        const tokens = getQuestionTokens(s);
        const sim = computeJaccardSimilarity(currentTokens, tokens);
        if (sim < 0.52) {
          let formatted = isPashto
            ? formatConcisePashtoOption(s)
            : isPersian
            ? formatConcisePersianOption(s)
            : s.trim();
          formatted = sanitizeEducationalText(formatted);

          if (!isPersian && !isPashto && (formatted.length > 165 || formatted.length < 30)) {
            continue;
          }

          formatted = formatted.replace(/[,;:—\-\s]+$/, '');
          if (!/[.!?؛۔]$/.test(formatted)) {
            formatted += '.';
          }

          if (
            isDanglingOrIncompleteFragment(formatted) ||
            isImperativeOrActionPhrase(formatted) ||
            isHeadingOrFragment(formatted) ||
            isDocumentMetadataOrNav(formatted)
          ) {
            continue;
          }

          const normFormatted = normalizeQuestionText(formatted);
          if (!seenCandidates.has(normFormatted) && !/\.{3}|…/.test(formatted)) {
            seenCandidates.add(normFormatted);
            allCandidatePool.push(formatted);
          }
        }
      }
    }
  }

  // First priority: pick UNUSED candidates from document that aren't duplicates of each other
  const unusedCandidates = allCandidatePool.filter((c) => {
    const normKey = c.toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return !usedOptions.has(normKey) && !usedOptions.has(normalizeQuestionText(c));
  });
  const chosen: string[] = [];

  const offset = (seqIndex * 3 + variantIndex) % Math.max(1, unusedCandidates.length);
  for (let i = 0; i < unusedCandidates.length && chosen.length < 3; i++) {
    const idx = (offset + i) % unusedCandidates.length;
    const cand = unusedCandidates[idx];
    const candTokens = getQuestionTokens(cand);
    const tooCloseToChosen = chosen.some((ex) => computeJaccardSimilarity(candTokens, getQuestionTokens(ex)) >= 0.55);
    if (!chosen.includes(cand) && !tooCloseToChosen) {
      chosen.push(cand);
    }
  }

  if (chosen.length >= 3) {
    return chosen.slice(0, 3);
  }

  // Tier 3 (English only): when unused document sentences are insufficient for multi-group quotas,
  // build clean, grammatical, domain-matched contrasting statements without reusing options across MCQs.
  if (!isPersian && !isPashto && resolvedEnglishTopic) {
    const domainContrast = generateNaturalDomainContrastDistractors(
      cleanCurrent,
      resolvedEnglishTopic,
      seqIndex,
      variantIndex,
      usedOptions,
      cleanAnswer
    );
    if (domainContrast && domainContrast.length >= 3) {
      return domainContrast.slice(0, 3);
    }
  }

  // Final RTL fallback if general pool has items
  if ((isPersian || isPashto) && chosen.length < 3) {
    const generalOffset = (seqIndex + variantIndex) % Math.max(1, allCandidatePool.length);
    for (let i = 0; i < allCandidatePool.length && chosen.length < 3; i++) {
      const idx = (generalOffset + i) % allCandidatePool.length;
      const cand = allCandidatePool[idx];
      if (!chosen.includes(cand)) {
        chosen.push(cand);
      }
    }
  }

  return chosen.slice(0, 3);
}

/**
 * Accurately detects the primary language of educational text or question stems.
 */
export function detectTextLanguage(text: string): 'ps' | 'fa' | 'en' | 'ar' | 'ur' | 'hi' | 'unknown' {
  if (!text || !text.trim()) return 'unknown';
  const trimmed = text.trim();

  const latinCount = (trimmed.match(/[A-Za-z]/g) || []).length;
  const arabicCount = (trimmed.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  const devanagariCount = (trimmed.match(/[\u0900-\u097F]/g) || []).length;

  if (devanagariCount > 5 && devanagariCount > latinCount && devanagariCount > arabicCount) {
    return 'hi';
  }

  if (latinCount > 10 && latinCount > arabicCount) {
    return 'en';
  }

  if (arabicCount > 0) {
    // Check Pashto distinct letters or distinctive grammar
    if (
      /[ښځڅډړږڼۍې]/.test(trimmed) ||
      /\b(او|په|د|له|تر|سره|چې|کې|شوی|شوي|شوه|شول|دی|ده|دي|کوي|کړي|کیږي|لري|دغه|هغه|موږ|تاسو|دوی|څنګه|ولې|څه|کوم|سمه|ناسمه|ازموینه|پوښتنه|ځواب)\b/.test(trimmed)
    ) {
      return 'ps';
    }
    // Check Urdu distinct letters
    if (
      /[ٹڈڑںےہۂ]/.test(trimmed) ||
      /\b(اور|میں|کی|کے|کو|سے|ہے|ہیں|تھا|تھی|تھے|گا|گے|گی)\b/.test(trimmed)
    ) {
      return 'ur';
    }
    // Check Arabic distinct words
    if (/\b(في|على|من|إلى|عن|هذا|هذه|التي|الذي|أن|إن|صحيح|خطأ)\b/.test(trimmed)) {
      return 'ar';
    }
    // Default RTL with Persian letters/verbs
    return 'fa';
  }

  return 'en';
}

/**
 * Validates that question stem, options, correct answer, and explanation
 * strictly adhere to the expected examination language, rejecting cross-language contamination.
 */
export function validateQuestionLanguage(
  question: {
    question_type: string;
    question_text: string;
    options?: string[] | null;
    correct_answer?: string;
    explanation?: string;
  },
  expectedLang: string
): { valid: boolean; reason?: string } {
  const normLang = (expectedLang || 'en').toLowerCase();

  // Distinct markers that MUST NOT appear in other languages:
  // 1. Dari/Persian words that must NEVER appear in a Pashto exam:
  const dariInPashtoForbidden = [
    /\bمی‌شود\b/, /\bمی‌گردد\b/, /\bمی‌باشد\b/, /\bهستند\b/, /\bبر اساس\b/, /\bطبق متن\b/,
    /\bصحیح یا غلط\b/, /\bجای خالی را با کلمه مناسب تکمیل نمایید\b/, /\bدر رابطه با\b/,
    /\bکدام گزینه\b/, /\bکدام مورد\b/, /\bتبیین نمایید\b/, /\bارزیابی نمایید\b/,
    /\bمعیار نمره‌دهی\b/, /\bبیان فرمایید\b/, /\bتشریح فرمایید\b/, /\bپیرامون\b/, /\bدر خصوص\b/
  ];

  // 2. Pashto words that must NEVER appear in a Dari/Persian exam:
  const pashtoInDariForbidden = [
    /[ښځڅډړږڼۍ]/, /\bسمه که ناسمه\b/, /\bخالي ځای په مناسبې کلمې سره ډک کړئ\b/,
    /\bپه اړه\b/, /\bپه هکله\b/, /\bپه تړاو\b/, /\bکومه لاندینۍ غوراوی\b/,
    /\bد نمرو ورکولو معیار\b/, /\bتشرېح کړئ\b/, /\bوڅېړئ\b/, /\bسمه\b/, /\bناسمه\b/
  ];

  const allTextsToCheck: string[] = [
    question.question_text || '',
    question.correct_answer || '',
    question.explanation || '',
    ...(question.options || [])
  ];

  if (normLang === 'ps') {
    for (const t of allTextsToCheck) {
      for (const pattern of dariInPashtoForbidden) {
        if (pattern.test(t)) {
          return { valid: false, reason: `Found Dari/Persian pattern in Pashto exam text: "${t.slice(0, 70)}..."` };
        }
      }
    }
    // Check True/False options for Pashto
    if (question.question_type === 'true_false' && question.options) {
      const opts = question.options.map((o) => o.trim());
      if (!opts.includes('سمه') || !opts.includes('ناسمه')) {
        return { valid: false, reason: `Pashto True/False must use ['سمه', 'ناسمه'], received: [${opts.join(', ')}]` };
      }
    }
  } else if (normLang === 'fa') {
    for (const t of allTextsToCheck) {
      for (const pattern of pashtoInDariForbidden) {
        if (pattern.test(t)) {
          return { valid: false, reason: `Found Pashto pattern in Dari exam text: "${t.slice(0, 70)}..."` };
        }
      }
    }
    // Check True/False options for Dari
    if (question.question_type === 'true_false' && question.options) {
      const opts = question.options.map((o) => o.trim());
      if (!opts.includes('صحیح') || !opts.includes('غلط')) {
        return { valid: false, reason: `Dari True/False must use ['صحیح', 'غلط'], received: [${opts.join(', ')}]` };
      }
    }
  } else if (normLang === 'en') {
    for (const t of allTextsToCheck) {
      if (/[\u0600-\u06FF]/.test(t)) {
        return { valid: false, reason: `Found Arabic/Persian/Pashto script in English exam text: "${t.slice(0, 70)}..."` };
      }
    }
  }

  return { valid: true };
}

/**
 * Comprehensive pre-display and pre-export academic quality and language validator.
 */
export function validateAcademicQuestion(
  question: any,
  expectedLang: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!question || typeof question !== 'object') {
    return { isValid: false, errors: ['Question is null or not an object.'] };
  }

  // 1. Question text presence and length
  const stem = String(question.question_text || '').trim();
  if (stem.length < 15) {
    errors.push(`Question text is too short (${stem.length} chars).`);
  }
  // 2. Language purity
  const langCheck = validateQuestionLanguage(question, expectedLang);
  if (!langCheck.valid) {
    errors.push(langCheck.reason || 'Failed language purity validation.');
  }

  const qType = String(question.question_type || '').toLowerCase();
  if (isHeadingOrFragment(stem)) {
    errors.push('Question text is a heading, fragment, or incomplete sentence.');
  }
  if (
    /\b(?:of|about|regarding|for|governing)\s+(?:His|Her|Their|Its|My|Our|Your)\s+[a-z]+/i.test(stem) ||
    /^(?:True or False|Complete the statement):\s*(?:His|Her|Their|Its|He|She|They|It)\s+/i.test(stem)
  ) {
    errors.push('Question text contains an ambiguous unresolved pronoun reference.');
  }
  if (qType === 'mcq') {
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`MCQ must have exactly 4 options, found ${question.options?.length || 0}.`);
    } else {
      const emptyOpt = question.options.some((o: string) => !o || String(o).trim().length < 2);
      if (emptyOpt) {
        errors.push('MCQ contains empty or invalid option choice.');
      }
      const hasRoboticGibberish = question.options.some((o: string) =>
        /\b(passive static structural elements|dynamic real-time modulation|localized offline parameters|without centralized systemic integration)\b/i.test(
          String(o)
        )
      );
      if (hasRoboticGibberish) {
        errors.push('MCQ contains unnatural robotic distractor text.');
      }
      const uniqueOpts = new Set(question.options.map((o: string) => String(o).trim().toLowerCase()));
      if (uniqueOpts.size < 4) {
        errors.push('MCQ options contain duplicate choices.');
      }
      if (!question.correct_answer || !question.options.includes(question.correct_answer)) {
        errors.push('MCQ correct_answer must match one of the four options exactly.');
      }
    }
  } else if (qType === 'true_false') {
    if (!Array.isArray(question.options) || question.options.length !== 2) {
      errors.push('True/False question must have exactly 2 options.');
    }
    if (!question.correct_answer) {
      errors.push('True/False question must specify a correct_answer.');
    }
  } else if (qType === 'fill_blank') {
    if (!/\[_{3,}|\[blank\]|\[_____\]/.test(stem)) {
      errors.push('Fill-in-the-blank question stem must contain a valid blank placeholder like [_____].');
    }
    if (/-[\[_]|[_\]]-|\[_+\]['’]s\b/.test(stem)) {
      errors.push('Fill-in-the-blank placeholder splits a hyphenated word or possessive awkwardly.');
    }
    if (!question.correct_answer || String(question.correct_answer).trim().length === 0) {
      errors.push('Fill-in-the-blank question must specify the target blank answer.');
    }
  } else if (qType === 'short_answer' || qType === 'essay') {
    if (!question.correct_answer || String(question.correct_answer).trim().length < 10) {
      errors.push(`${qType} must have a substantive model answer (minimum 10 chars).`);
    }
    if (!question.explanation || String(question.explanation).trim().length < 10) {
      errors.push(`${qType} must provide an explicit marking rubric in explanation.`);
    }
  } else {
    errors.push(`Unsupported question_type: ${qType}`);
  }

  // 4. Grounding verification
  if (!question.source_evidence || String(question.source_evidence).trim().length < 15) {
    errors.push('Question lacks valid source_evidence citation from the educational text.');
  } else if (isNonSubstantiveOrAckSentence(String(question.source_evidence))) {
    errors.push('Question source_evidence comes from non-educational acknowledgement or metadata text.');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export interface ExamLocalization {
  isRtl: boolean;
  trueFalsePrefix: string;
  trueFalseOptions: [string, string];
  fillBlankInstruction: string;
  mcqStems: string[];
  shortAnswerStems: string[];
  essayStems: string[];
  essayRubric: (page: number) => string;
  shortAnswerRubric: (page: number) => string;
  explanationPrefix: (page: number) => string;
  studentNameLabel: string;
  seatNoLabel: string;
  dateLabel: string;
  timeLabel: string;
  maxMarksLabel: string;
  variantLabel: string;
  generalInstructionsTitle: string;
  generalInstructionsList: string[];
  questionsSectionTitle: (variant: string) => string;
  paperEndNotice: (variant: string) => string;
  answerKeyTitle: (variant: string) => string;
  confidentialNotice: string;
  subjectDefault: string;
  titleFormat: (docTitle: string) => string;
}

export const EXAM_LOCALIZATIONS: Record<string, ExamLocalization> = {
  ps: {
    isRtl: true,
    trueFalsePrefix: 'سمه که ناسمه',
    trueFalseOptions: ['سمه', 'ناسمه'],
    fillBlankInstruction: 'خالي ځای په مناسبې کلمې سره ډک کړئ: ',
    mcqStems: [
      'د «{topic}» په اړه، کومه لاندینۍ غوراوی سم مفهوم او معتبره پایله څرګندوي؟',
      'کوم مورد د «{topic}» بنسټیز اصل یا اصلي دنده په سمه توګه بیانوي؟',
      'د «{topic}» په تړاو، کومه جمله محوري مفهوم تشرېح کوي؟',
      'کوم انتخاب د «{topic}» په هکله کره او دقیقه علمي شننه وړاندې کوي؟',
    ],
    shortAnswerStems: [
      'د «{topic}» مهمې ځانګړنې او اساسي اړخونه په ۲ تر ۳ جملو کې تشرېح کړئ.',
      'د «{topic}» اصلي اغېزې او عملي کارکړنې په لنډ ډول روښانه کړئ.',
      'د «{topic}» مرکزي رول او بنسټیز ارزښت په لنډه توګه بیان کړئ.',
      'د «{topic}» اړوند مهم ټکي او علمي موندنې ولیکئ.',
    ],
    essayStems: [
      'د «{topic}» ستراتیژیک اړخونه، عملي خنډونه او د پلي کېدو لارې چارې په یوه تحلیلي مقاله کې په بشپړ ډول وڅېړئ.',
      'د «{topic}» جوړښتي اغېزې او بنسټیزې پایلې په هر اړخیزه توګه ارزیابي او تحلیل کړئ.',
      'د «{topic}» مفهومي او عملي اړخونه وڅېړئ او د پلي کېدو شرایط یې روښانه کړئ.',
    ],
    essayRubric: (page: number) =>
      `د نمرو ورکولو معیار: ۱. د استدلال تسلسل او ژبنیز جوړښت (۱.۵ نمرې)، ۲. د ${page} مخ علمي مفاهیمو ته کره استناد (۲ نمرې)، ۳. د شننې او حل‌لارو روښانتیا (۱.۵ نمرې).`,
    shortAnswerRubric: (page: number) =>
      `د نمرو ورکولو معیار: ۱. متن ته د کره استناد روښانتیا (۱.۵ نمرې)، ۲. د مفهومي شننې دقت (۱.۵ نمرې). (${page} مخ)`,
    explanationPrefix: (page: number) => `مستند د منبع متن ته (${page} مخ): `,
    studentNameLabel: 'د زده‌کوونکي نوم:',
    seatNoLabel: 'د څوکۍ / حاضري شمېره:',
    dateLabel: 'نېټه:',
    timeLabel: 'وخت:',
    maxMarksLabel: 'ټولې نمرې:',
    variantLabel: 'ګروپ:',
    generalInstructionsTitle: 'د ازموینې عمومي لارښوونې:',
    generalInstructionsList: [
      'ډاډ ترلاسه کړئ چې دا د ازموینې پاڼه ستاسو د ګروپ ټولې پوښتنې لري.',
      'ټول ځوابونه په اړوندو ځایونو کې په واضح ډول ولیکئ.',
      'د پوښتنو له پیل مخکې خپل نوم او د حاضري شمېره په دقیقه توګه ولیکئ.',
      'د ازموینې په جریان کې د هر ډول غیرقانوني وسایلو کارول منع دي.',
    ],
    questionsSectionTitle: (variant: string) => `د ازموینې پوښتنې (${variant})`,
    paperEndNotice: (variant: string) => `--- د ازموینې د پاڼې پای (${variant}) ---`,
    answerKeyTitle: (variant: string) => `د نمرو ورکولو محرم لارښود او د پوښتنو کلید (${variant})`,
    confidentialNotice: 'محرم اسناد. د نمره‌ورکونې له بشپړېدو وړاندې زده‌کوونکو ته ورکول منع دي.',
    subjectDefault: 'ښوونیز مضمون',
    titleFormat: (docTitle: string) => `د ${docTitle} ازموینه`,
  },
  fa: {
    isRtl: true,
    trueFalsePrefix: 'صحیح یا غلط',
    trueFalseOptions: ['صحیح', 'غلط'],
    fillBlankInstruction: 'جای خالی را با کلمه مناسب تکمیل نمایید: ',
    mcqStems: [
      'در رابطه با «{topic}»، کدام گزینه بیانگر مفهوم و نتیجه‌گیری صحیح است؟',
      'کدام مورد، اصل یا کارکرد اساسی «{topic}» را به درستی بیان می‌کند؟',
      'در خصوص «{topic}»، کدام گزاره مفهوم محوری را به درستی تبیین می‌کند؟',
      'کدام گزینه، تحلیل دقیق و معتبری در رابطه با «{topic}» ارائه می‌دهد؟',
    ],
    shortAnswerStems: [
      'اهمیت و ابعاد کلیدی «{topic}» را در ۲ الی ۳ جمله تبیین نمایید.',
      'پیامدها و کارکردهای اصلی «{topic}» را به صورت مختصر شرح دهید.',
      'نقش و جایگاه محوری «{topic}» را به اختصار توضیح دهید.',
      'ویژگی‌ها و نکات اساسی در رابطه با «{topic}» را بیان فرمایید.',
    ],
    essayStems: [
      'ابعاد راهبردی، موانع اجرایی و راه‌کارهای تحقق «{topic}» را به تفصیل تحلیل و ارزیابی نمایید.',
      'تأثیرات ساختاری و پیامدهای کلیدی «{topic}» را در یک مقاله تحلیلی جامع مورد بررسی قرار دهید.',
      'ابعاد مفهومی و کاربردی «{topic}» را واکاوی نموده و الزامات اجرایی آن را تشریح فرمایید.',
    ],
    essayRubric: (page: number) =>
      `معیار نمره‌دهی: ۱. انسجام استدلال (۱.۵ نمره)، ۲. استناد دقیق به مفاهیم صفحه ${page} (۲ نمره)، ۳. وضوح تحلیل و راه‌کارها (۱.۵ نمره).`,
    shortAnswerRubric: (page: number) =>
      `معیار نمره‌دهی: ۱. وضوح استناد به متن (۱.۵ نمره)، ۲. دقت تحلیل مفهومی (۱.۵ نمره). (صفحه ${page})`,
    explanationPrefix: (page: number) => `مستند به متن منبع (صفحه ${page}): `,
    studentNameLabel: 'نام محصل:',
    seatNoLabel: 'شماره صندلی / حاضری:',
    dateLabel: 'تاریخ:',
    timeLabel: 'وقت:',
    maxMarksLabel: 'مجموع نمرات:',
    variantLabel: 'گروپ:',
    generalInstructionsTitle: 'رهنمود عمومی امتحان:',
    generalInstructionsList: [
      'اطمینان حاصل نمایید که این ورقه امتحانی حاوی کلیه سوالات گروپ شما می‌باشد.',
      'پاسخ‌های خود را با خط خوانا در محل‌های تعیین‌شده بنویسید.',
      'مشخصات فردی خود را قبل از پاسخگویی به سوالات درج فرمایید.',
      'استفاده از یادداشت‌ها، گوشی و هرگونه وسیله الکترونیکی غیرمجاز است.',
    ],
    questionsSectionTitle: (variant: string) => `سوالات امتحانی (${variant})`,
    paperEndNotice: (variant: string) => `--- پایان ورقه امتحانی (${variant}) ---`,
    answerKeyTitle: (variant: string) => `راهنمای نمره‌دهی و کلید سوالات (${variant})`,
    confidentialNotice: 'سند کاملاً محرمانه امتحانی. قبل از اتمام کامل نمره‌دهی، از در اختیار قرار دادن آن به محصلین خودداری گردد.',
    subjectDefault: 'محتوای آموزشی و تخصصی',
    titleFormat: (docTitle: string) => `آزمون ${docTitle}`,
  },
  en: {
    isRtl: false,
    trueFalsePrefix: 'True or False',
    trueFalseOptions: ['True', 'False'],
    fillBlankInstruction: 'Complete the statement: ',
    mcqStems: [
      'Regarding "{topic}", which of the following accurately describes the key principle or function?',
      'Which statement provides an accurate, verifiable conclusion concerning "{topic}"?',
      'In the context of "{topic}", which option correctly identifies its primary operational role?',
      'Which choice best characterizes the essential mechanism of "{topic}"?',
    ],
    shortAnswerStems: [
      'Explain the key significance and core aspects of "{topic}" in 2 to 3 concise sentences.',
      'Summarize the primary functions and operational implications of "{topic}".',
      'Briefly outline the essential principles and academic importance of "{topic}".',
      'Identify the critical features and analytical outcomes related to "{topic}".',
    ],
    essayStems: [
      'Critically analyze the strategic dimensions, structural implications, and operational implementation of "{topic}".',
      'Evaluate the comprehensive impact, operational challenges, and practical solutions associated with "{topic}".',
      'Synthesize the fundamental theoretical principles and practical execution requirements of "{topic}".',
    ],
    essayRubric: (page: number) =>
      `Grading Rubric: 1. Coherence of academic argument (1.5 pts), 2. Explicit citation of concepts from Page ${page} (2.0 pts), 3. Depth of analytical synthesis (1.5 pts).`,
    shortAnswerRubric: (page: number) =>
      `Grading Rubric: 1. Clarity of direct citation (1.5 pts), 2. Accuracy of conceptual explanation (1.5 pts). (Page ${page})`,
    explanationPrefix: (page: number) => `Documented in source text (Page ${page}): `,
    studentNameLabel: 'Student Name:',
    seatNoLabel: 'Roll / Seat No:',
    dateLabel: 'Date:',
    timeLabel: 'Time:',
    maxMarksLabel: 'Max Marks:',
    variantLabel: 'Variant:',
    generalInstructionsTitle: 'General Instructions:',
    generalInstructionsList: [
      'Check that this paper contains all questions for your designated examination group.',
      'Write all answers clearly in the spaces provided below.',
      'Ensure your name and seat number are properly recorded above.',
      'Unauthorized devices, notes, or calculators are strictly prohibited.',
    ],
    questionsSectionTitle: (variant: string) => `EXAMINATION QUESTIONS (${variant})`,
    paperEndNotice: (variant: string) => `--- END OF EXAMINATION (${variant}) ---`,
    answerKeyTitle: (variant: string) => `TEACHER MARKING GUIDE & ANSWER KEY (${variant})`,
    confidentialNotice: 'CONFIDENTIAL FACULTY DOCUMENT. Do not distribute to students prior to official grading completion.',
    subjectDefault: 'Educational Subject Matter',
    titleFormat: (docTitle: string) => `${docTitle} Examination`,
  },
  ar: {
    isRtl: true,
    trueFalsePrefix: 'صحيح أم خطأ',
    trueFalseOptions: ['صحيح', 'خطأ'],
    fillBlankInstruction: 'املأ الفراغ بالكلمة المناسبة: ',
    mcqStems: [
      'فيما يتعلق بـ «{topic}»، أي من الخيارات التالية يعبر بدقة عن المفهوم والاستنتاج الصحيح؟',
      'أي خيار يوضح المبدأ الأساسي أو الوظيفة الجوهرية لـ «{topic}» بشكل سليم؟',
      'في سياق «{topic}»، أي عبارة تشرح المفهوم المحوري بدقة؟',
    ],
    shortAnswerStems: [
      'وضح الأبعاد الرئيسية والأهمية الجوهرية لـ «{topic}» في جملتين إلى ثلاث جمل موجزة.',
      'اشرح باختصار الآثار والوظائف الأساسية المرتبطة بـ «{topic}».',
    ],
    essayStems: [
      'حلل وقيم بشكل شامل الأبعاد الاستراتيجية والتحديات التطبيقية المتعلقة بـ «{topic}».',
    ],
    essayRubric: (page: number) =>
      `معيار التصحيح: ١. ترابط الحجة الأكاديمية (١.٥ درجة)، ٢. الاستشهاد الدقيق بالمفاهيم في الصفحة ${page} (درجتان)، ٣. عمق التحليل والحلول (١.٥ درجة).`,
    shortAnswerRubric: (page: number) =>
      `معيار التصحيح: ١. وضوح الاستناد إلى النص (١.۵ درجة)، ۲. دقة الشرح المفاهيمي (۱.۵ درجة). (صفحة ${page})`,
    explanationPrefix: (page: number) => `مستند إلى نص المصدر (صفحة ${page}): `,
    studentNameLabel: 'اسم الطالب:',
    seatNoLabel: 'رقم الجلوس:',
    dateLabel: 'التاريخ:',
    timeLabel: 'الوقت:',
    maxMarksLabel: 'الدرجة الكلية:',
    variantLabel: 'النموذج:',
    generalInstructionsTitle: 'تعليمات عامة:',
    generalInstructionsList: [
      'تأكد من احتواء ورقة الامتحان على جميع الأسئلة المخصصة لنموذجك.',
      'اكتب جميع الإجابات بوضوح في الأماكن المخصصة.',
      'تأكد من كتابة اسمك ورقم جلوسك في الحقول المخصصة أعلاه.',
      'يمنع منعاً باتاً استخدام أي مذكرات أو هواتف أو أجهزة غير مصرح بها.',
    ],
    questionsSectionTitle: (variant: string) => `أسئلة الامتحان (${variant})`,
    paperEndNotice: (variant: string) => `--- نهاية ورقة الامتحان (${variant}) ---`,
    answerKeyTitle: (variant: string) => `دليل التصحيح وسلم الدرجات (${variant})`,
    confidentialNotice: 'وثيقة سرية خاصة بهيئة التدريس. يحظر توزيعها على الطلاب قبل الانتهاء التام من رصد الدرجات.',
    subjectDefault: 'المادة التعليمية',
    titleFormat: (docTitle: string) => `امتحان ${docTitle}`,
  },
  ur: {
    isRtl: true,
    trueFalsePrefix: 'درست یا غلط',
    trueFalseOptions: ['درست', 'غلط'],
    fillBlankInstruction: 'مناسب لفظ سے خالی جگہ پر کریں: ',
    mcqStems: [
      '«{topic}» کے حوالے سے، درج ذیل میں سے کون سا انتخاب درست تصور اور نتیجے کو واضح کرتا ہے؟',
      'کون سی شق «{topic}» کے بنیادی اصول یا مرکزی عمل کو درست طور پر بیان کرتی ہے؟',
    ],
    shortAnswerStems: [
      '«{topic}» کے اہم پہلوؤں اور بنیادی اہمیت کو ۲ سے ۳ مختصر جملوں میں واضح کریں۔',
    ],
    essayStems: [
      '«{topic}» کے اسٹریٹجک ابعاد، عملی رکاوٹوں اور نفاذ کے طریقہ کار کا تفصیلی جائزہ لیں۔',
    ],
    essayRubric: (page: number) =>
      `نمبروں کا معیار: ۱. استدلال کا تسلسل (۱.۵ نمبر)، ۲. صفحہ ${page} کے متن سے براہ راست استناد (۲ نمبر)، ۳. تجزیاتی گہرائی (۱.۵ نمبر)۔`,
    shortAnswerRubric: (page: number) =>
      `نمبروں کا معیار: ۱. متن کے حوالے کی وضاحت (۱.۵ نمبر)، ۲. تصوراتی وضاحت کی درستگی (۱.۵ نمبر)۔ (صفحہ ${page})`,
    explanationPrefix: (page: number) => `بنیادی متن سے اخذ شدہ (صفحہ ${page}): `,
    studentNameLabel: 'طالب علم کا نام:',
    seatNoLabel: 'رول نمبر / نشست نمبر:',
    dateLabel: 'تاریخ:',
    timeLabel: 'وقت:',
    maxMarksLabel: 'کل نمبر:',
    variantLabel: 'گروپ:',
    generalInstructionsTitle: 'عام ہدایات:',
    generalInstructionsList: [
      'یقینی بنائیں کہ امتحانی پرچے میں آپ کے گروپ کے تمام سوالات موجود ہیں۔',
      'تمام جوابات فراہم کردہ جگہ پر واضح لکھیں۔',
      'اپنا نام اور رول نمبر احتیاط سے درج کریں۔',
      'غیر متعلقہ مواد یا موبائل کا استعمال سختی سے ممنوع ہے۔',
    ],
    questionsSectionTitle: (variant: string) => `امتحانی سوالات (${variant})`,
    paperEndNotice: (variant: string) => `--- امتحانی پرچے کا اختتام (${variant}) ---`,
    answerKeyTitle: (variant: string) => `مارکنگ گائیڈ اور جوابی پرچہ (${variant})`,
    confidentialNotice: 'محرم دستاویز۔ نتائج کے باقاعدہ اعلان سے قبل طلبہ میں تقسیم کرنا ممنوع ہے۔',
    subjectDefault: 'تعلیمی مضمون',
    titleFormat: (docTitle: string) => `امتحان ${docTitle}`,
  },
};

export function getExamLocalization(lang: string): ExamLocalization {
  const norm = (lang || 'en').toLowerCase();
  if (norm === 'ps' || norm.startsWith('ps')) return EXAM_LOCALIZATIONS.ps;
  if (norm === 'fa' || norm === 'prs' || norm.startsWith('fa')) return EXAM_LOCALIZATIONS.fa;
  if (norm === 'ar' || norm.startsWith('ar')) return EXAM_LOCALIZATIONS.ar;
  if (norm === 'ur' || norm.startsWith('ur')) return EXAM_LOCALIZATIONS.ur;
  return EXAM_LOCALIZATIONS.en;
}

