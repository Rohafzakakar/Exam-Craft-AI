import type { DocumentChunkRecord } from './db.js';

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

/**
 * Removes repetitive RAG process boilerplate from student-facing question stems in Dari/Persian
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

  // 1. True / False prefixes
  // e.g., "صحیح یا غلط: بر اساس متن منبع (صفحه ۱): ..." -> "صحیح یا غلط: ..."
  cleaned = cleaned.replace(
    /^(صحیح یا غلط|درست یا غلط|صحيح أم خطأ|سمه که ناسمه)[:،\s]+(بر اساس متن منبع|وفقاً لنص المصدر|د متن د محتوا پر بنسټ|متن کی روشنی میں|بر اساس متن آموزشی|طبق متن|بر اساس متن|با استناد به متن|مطابق متن)\s*(\(?صفحه\s+[۰-۹0-9]+\)?)?[:،\s]*/i,
    '$1: '
  );
  cleaned = cleaned.replace(
    /^(صحیح یا غلط|درست یا غلط|صحيح أم خطأ|سمه که ناسمه)[:،\s]+\(?صفحه\s+[۰-۹0-9]+\)?[:،\s]*/i,
    '$1: '
  );

  // 2. Fill-in-the-blank prefixes
  // e.g., "جای خالی را با توجه به متن صفحه ۱ تکمیل نمایید: ..." -> "جای خالی را با کلمه مناسب تکمیل نمایید: ..."
  cleaned = cleaned.replace(
    /^جای خالی را با توجه به (متن آموزشی|متن منبع|متن|آموزه‌های)?\s*(\(?صفحه\s+[۰-۹0-9]+\)?)?\s*تکمیل نمایید:\s*/i,
    'جای خالی را با کلمه مناسب تکمیل نمایید: '
  );

  // 3. MCQ boilerplate
  // e.g., "با استناد به مباحث مندرج در صفحه ۱ پیرامون «...»، کدام گزینه بیانگر تحلیل و نتیجه‌گیری صحیح است؟"
  // -> "در رابطه با «...»، کدام گزینه بیانگر تحلیل و نتیجه‌گیری صحیح است؟"
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

  // 4. Essay boilerplate
  // e.g., "با استناد به تحلیل ارائه‌شده در صفحه ۱ پیرامون «...»، ابعاد راهبردی..."
  // -> "ابعاد راهبردی..."
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

  // 5. Short answer boilerplate
  // e.g., "بر اساس متن آموزشی صفحه ۱، اهمیت و ابعاد کلیدی «...» را در ۲ الی ۳ جمله تبیین نمایید."
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

  // 6. Generic RAG prefixes at the start of stems
  cleaned = cleaned.replace(/^با استناد به تحلیل ارائه‌شده در متن[،,\s]*/i, '');
  cleaned = cleaned.replace(/^بر اساس تحلیل متن[،,\s]*/i, '');
  cleaned = cleaned.replace(/^طبق مباحث مطرح‌شده در متن[،,\s]*/i, '');
  cleaned = cleaned.replace(/^بر اساس متن منبع[،,\s]*/i, '');
  cleaned = cleaned.replace(/^با استناد به متن منبع[،,\s]*/i, '');
  cleaned = cleaned.replace(/^طبق تحلیل ارائه\s*شده در متن منبع[،,\s]*/i, '');

  // 7. Remove parenthetical page numbers attached to topic phrases like "«موضوع» (صفحه ۱)"
  cleaned = cleaned.replace(/«([^»]+)»\s*\(صفحه\s+[۰-۹0-9]+\)/g, '«$1»');

  // 8. Clean any double punctuation or leading commas/spaces
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

