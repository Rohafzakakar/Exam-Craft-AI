import AdmZip from 'adm-zip';
import mammoth from 'mammoth';

export interface ParsedDocxPage {
  pageNumber: number;
  text: string;
  chapter?: string;
  section?: string;
  charCount: number;
}

export interface ParsedDocxResult {
  filename: string;
  file_type: 'docx';
  file_size_bytes: number;
  total_pages: number;
  detected_language: string;
  is_rtl: boolean;
  pages: ParsedDocxPage[];
  chapters: string[];
  text: string;
}

export function decodeXmlEntities(str: string): string {
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

export function detectLanguageAndDirection(text: string): { language: string; isRtl: boolean } {
  if (!text || text.trim().length === 0) {
    return { language: 'en', isRtl: false };
  }

  // Count letters and Arabic/Persian/Urdu/Pashto characters
  const arabicMatches = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g);
  const totalLettersMatch = text.match(/[\p{L}]/gu);
  const arabicCount = arabicMatches ? arabicMatches.length : 0;
  const totalLetters = totalLettersMatch ? totalLettersMatch.length : 0;

  if (totalLetters === 0) {
    return { language: 'en', isRtl: false };
  }

  const rtlRatio = arabicCount / totalLetters;
  if (rtlRatio > 0.25) {
    // Specific script markers (Pashto distinct letters)
    if (/[ښځڅډړږڼۍ]/.test(text)) {
      return { language: 'ps', isRtl: true };
    }
    if (/[ٹڈڑںےہۂ]/.test(text)) {
      return { language: 'ur', isRtl: true };
    }
    if (/[گچپژ]/.test(text)) {
      return { language: 'fa', isRtl: true };
    }
    // Check common Arabic vs Persian words
    if (/\b(في|على|من|إلى|عن|هذا|هذه|التي|الذي|أن|إن)\b/.test(text)) {
      return { language: 'ar', isRtl: true };
    }
    return { language: 'fa', isRtl: true };
  }

  return { language: 'en', isRtl: false };
}

export async function parseDocxBuffer(fileBuffer: Buffer, filename: string): Promise<ParsedDocxResult> {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('The uploaded DOCX file is empty (0 bytes).');
  }

  // Verify ZIP magic header
  const isZip = fileBuffer.length >= 4 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b;
  if (!isZip) {
    throw new Error('The uploaded file is not a valid DOCX document (invalid ZIP header).');
  }

  let docXml: string | null = null;
  try {
    const zip = new AdmZip(fileBuffer);
    const entry = zip.getEntry('word/document.xml');
    if (entry) {
      docXml = zip.readAsText(entry);
    }
  } catch (zipErr: any) {
    console.warn('[DocxParser] AdmZip inspection warning:', zipErr.message);
  }

  // Also extract text via mammoth for reliable plain text fallback
  let mammothText = '';
  try {
    const mammothResult = await mammoth.extractRawText({ buffer: fileBuffer });
    if (mammothResult && typeof mammothResult.value === 'string') {
      mammothText = mammothResult.value;
    }
  } catch (mErr: any) {
    console.warn('[DocxParser] Mammoth extraction warning:', mErr.message);
  }

  const pages: ParsedDocxPage[] = [];
  const chaptersSet: string[] = [];
  let fullText = '';

  const sampleDocText = (mammothText || docXml || '').slice(0, 4000);
  const sampleHasRtl = /[\u0600-\u06FF]/.test(sampleDocText);
  const initialDefaultChapter = sampleHasRtl
    ? 'فصل اول: مقدمه و مفاهیم اساسی'
    : 'Chapter 1: Overview and Core Concepts';

  if (docXml) {
    // Extract paragraphs and explicit page breaks from word/document.xml
    const pMatches = docXml.match(/<w:p(?:\s+[^>]*)?>[\s\S]*?<\/w:p>/g) || [];

    const hasExplicitPageBreaks = /<w:br\s+[^>]*w:type="page"|<w:lastRenderedPageBreak/i.test(docXml);

    let currentChapter = initialDefaultChapter;
    let currentSection = '';
    let currentPageNum = 1;
    let currentPageParagraphs: string[] = [];
    let wordsOnPage = 0;
    const approxWordsPerPage = 320;

    for (let i = 0; i < pMatches.length; i++) {
      const pXml = pMatches[i];
      const isPageBreak = /<w:br\s+[^>]*w:type="page"|<w:lastRenderedPageBreak/i.test(pXml);

      // Extract all text within <w:t> tags
      const tMatches = pXml.match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
      const rawPText = tMatches.map((t) => t.replace(/<[^>]+>/g, '')).join('');
      const pText = decodeXmlEntities(rawPText).trim();

      // Detect heading styles or chapter patterns
      const isHeading1 = /w:val="Heading1"|w:val="Title"|w:val="heading 1"/i.test(pXml);
      const isHeading2 = /w:val="Heading2"|w:val="Heading3"|w:val="heading 2"/i.test(pXml);

      if (pText) {
        if (isHeading1 || /^(فصل|باب|بخش|Chapter|Part)\s+[۰-۹0-9IVXLCDM]+/i.test(pText)) {
          currentChapter = pText;
          if (!chaptersSet.includes(pText)) chaptersSet.push(pText);
        } else if (isHeading2 || /^([۰-۹0-9]+\.[۰-۹0-9]+|Section\s+[۰-۹0-9]+)/i.test(pText)) {
          currentSection = pText;
        }

        currentPageParagraphs.push(pText);
        const words = pText.split(/\s+/).filter(Boolean).length;
        wordsOnPage += words;
      }

      // Check for page cut
      const shouldBreakByExplicit = hasExplicitPageBreaks && isPageBreak && currentPageParagraphs.length > 0;
      const shouldBreakByLength = !hasExplicitPageBreaks && wordsOnPage >= approxWordsPerPage && currentPageParagraphs.length > 0;

      if (shouldBreakByExplicit || shouldBreakByLength) {
        const pageContent = currentPageParagraphs.join('\n\n').trim();
        if (pageContent) {
          pages.push({
            pageNumber: currentPageNum,
            text: pageContent,
            chapter: currentChapter,
            section: currentSection || currentChapter,
            charCount: pageContent.length,
          });
          currentPageNum++;
          currentPageParagraphs = [];
          wordsOnPage = 0;
        }
      }
    }

    if (currentPageParagraphs.length > 0) {
      const pageContent = currentPageParagraphs.join('\n\n').trim();
      if (pageContent) {
        pages.push({
          pageNumber: currentPageNum,
          text: pageContent,
          chapter: currentChapter,
          section: currentSection || currentChapter,
          charCount: pageContent.length,
        });
      }
    }

    fullText = pages.map((p) => p.text).join('\n\n');
  }

  // Fallback if XML parsing did not yield sufficient pages or text
  if (pages.length === 0 || fullText.trim().length < 50) {
    const rawFallback = decodeXmlEntities(mammothText.trim() || fullText.trim());
    if (!rawFallback || rawFallback.length < 30) {
      throw new Error(
        'The uploaded DOCX document contains no readable educational text. Please verify the file is not empty or password-protected.'
      );
    }

    const paragraphs = rawFallback
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 10);

    const approxParasPerPage = Math.max(1, Math.ceil(paragraphs.length / Math.max(1, Math.ceil(rawFallback.length / 2000))));
    let pNum = 1;
    let curChapter = sampleHasRtl ? 'فصل اول: مفاهیم اصلی' : 'Chapter 1: Overview and Core Concepts';

    for (let idx = 0; idx < paragraphs.length; idx += approxParasPerPage) {
      const slice = paragraphs.slice(idx, idx + approxParasPerPage);
      const firstLine = slice[0] || '';
      if (/^(فصل|باب|بخش|Chapter|Part)\s+/i.test(firstLine)) {
        curChapter = firstLine.slice(0, 80);
        if (!chaptersSet.includes(curChapter)) chaptersSet.push(curChapter);
      }
      const pageText = slice.join('\n\n');
      pages.push({
        pageNumber: pNum,
        text: pageText,
        chapter: curChapter,
        section: curChapter,
        charCount: pageText.length,
      });
      pNum++;
    }
    fullText = rawFallback;
  }

  // Detect language and direction
  const { language, isRtl } = detectLanguageAndDirection(fullText);

  // If detected language is English (or non-RTL), purge any leftover Persian default chapter labels
  if (!isRtl) {
    const persianChapterPattern = /[\u0600-\u06FF]/;
    for (const p of pages) {
      if (p.chapter && persianChapterPattern.test(p.chapter || '')) {
        p.chapter = 'Chapter 1: Overview and Core Concepts';
      }
      if (p.section && persianChapterPattern.test(p.section || '')) {
        p.section = p.chapter;
      }
    }
    for (let i = 0; i < chaptersSet.length; i++) {
      if (persianChapterPattern.test(chaptersSet[i] || '')) {
        chaptersSet[i] = 'Chapter 1: Overview and Core Concepts';
      }
    }
  }

  if (chaptersSet.length === 0 && pages.length > 0) {
    chaptersSet.push(pages[0].chapter || (isRtl ? 'فصل اول' : 'Chapter 1: Overview and Core Concepts'));
  }

  return {
    filename,
    file_type: 'docx',
    file_size_bytes: fileBuffer.length,
    total_pages: pages.length,
    detected_language: language,
    is_rtl: isRtl,
    pages,
    chapters: chaptersSet,
    text: fullText,
  };
}
