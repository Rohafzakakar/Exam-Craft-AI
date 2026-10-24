import assert from 'node:assert';
import http from 'node:http';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } from 'docx';
import { PDFParse } from 'pdf-parse';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function httpPostJson(url, data, token, sessionId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpPutJson(url, data, token, sessionId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpGet(url, token, sessionId) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function httpUploadFile(url, fileBuffer, filename, mimetype, sessionId) {
  return new Promise((resolve, reject) => {
    const boundary = '----ExamCraftRegenBoundary' + Math.random().toString(36).slice(2);
    const parsed = new URL(url);

    const crlf = '\r\n';
    let header = `--${boundary}${crlf}`;
    header += `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}`;
    header += `Content-Type: ${mimetype}${crlf}${crlf}`;

    let footer = `${crlf}--${boundary}`;
    if (sessionId) {
      footer += `${crlf}Content-Disposition: form-data; name="session_id"${crlf}${crlf}${sessionId}`;
      footer += `${crlf}--${boundary}`;
    }
    footer += `--${crlf}`;

    const headerBuf = Buffer.from(header, 'utf8');
    const footerBuf = Buffer.from(footer, 'utf8');
    const totalLength = headerBuf.length + fileBuffer.length + footerBuf.length;

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': totalLength,
          ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(headerBuf);
    req.write(fileBuffer);
    req.write(footerBuf);
    req.end();
  });
}

async function createDariDemocracyDocxBuffer() {
  const chapters = [
    { title: 'فصل اول: مبانی و پیشینه تاریخی مردم‌سالاری در افغانستان', text: 'دموکراسی پایدار در افغانستان بر پایه حاکمیت قانون، اراده آزاد ملت و صیانت از حقوق بنیادین شهروندی استوار است. در تاریخ معاصر افغانستان، سنت‌های مشورتی سنتی نظیر لوی جرگه همواره به عنوان سازوکاری برای اجماع‌سازی ملی و حل بحران‌های کلان سیاسی مورد استفاده قرار گرفته است. دهه دموکراسی با تصویب قانون اساسی نقطه عطفی در شناسایی تفکیک قوا و آزادی مطبوعات به شمار می‌رود.' },
    { title: 'فصل دوم: تفکیک قوا و ساختار نظام سیاسی', text: 'اصل تفکیک قوا از ارکان انکارناپذیر مردم‌سالاری مدرن است که از تمرکز نامحدود قدرت در دست یک فرد یا جناح جلوگیری می‌نماید. در یک نظام دموکراتیک، قوه مقننه وظیفه خطیر قانون‌گذاری و نظارت بر عملکرد قوه مجریه را بر عهده دارد. قوه قضائیه مستقل به مثابه ضامن اجرای عدالت و تطبیق بی‌طرفانه قوانین بر همگان عمل می‌کند.' },
    { title: 'فصل سوم: نهادهای انتخاباتی و مشارکت سیاسی', text: 'انتخابات شفاف، دوره‌ای و رقابتی مشروعیت‌بخش اصلی کارگزاران قدرت در نظام‌های دموکراتیک است. استقلال کمیسیون مستقل انتخابات و کمیسیون رسیدگی به شکایات انتخاباتی، پیش‌شرط اساسی صیانت از آرای پاک مردم محسوب می‌شود. حق رأی همگانی و برابر، بدون هیچ‌گونه تبعیض قومی، جنسیتی یا زبانی، مظهر تجلی اراده عمومی است.' },
    { title: 'فصل چهارم: جامعه مدنی و احزاب سیاسی', text: 'جامعه مدنی فعال پل ارتباطی مستمر و سازمان‌یافته میان توده‌های مردم و ارکان حاکمیت به شمار می‌رود. احزاب سیاسی برنامه‌محور با کادرسازی علمی و ارائه خط‌مشی‌های سنجیده اقتصادی و اجتماعی، رقابت سیاسی را نظام‌مند می‌سازند.' },
  ];

  const children = [];
  chapters.forEach((ch, idx) => {
    children.push(new Paragraph({ text: ch.title, heading: HeadingLevel.HEADING_1 }));
    children.push(new Paragraph({ text: ch.text }));
    if (idx < chapters.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new Document({
    sections: [{ children }],
  });

  return await Packer.toBuffer(doc);
}

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  process.stdout.write(`• Test ${totalTests}: ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log('PASSED ✓');
  } catch (err) {
    console.log('FAILED ✗');
    console.error(err);
    throw err;
  }
}

async function main() {
  console.log('\n================================================================');
  console.log('  EXAMCRAFT AI: REGENERATION & EXPORT QUALITY REGRESSION SUITE  ');
  console.log('================================================================\n');

  const testSessionId = `test-session-${Date.now()}`;

  // 1. Upload Dari democracy document
  let docId = '';
  await runTest('Upload "دموکراسی پایدار در افغانستان.docx" and detect Dari/Persian language', async () => {
    const buf = await createDariDemocracyDocxBuffer();
    const res = await httpUploadFile(
      `${BASE_URL}/api/documents/upload`,
      buf,
      'دموکراسی پایدار در افغانستان.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      testSessionId
    );

    if (res.statusCode !== 201) {
      console.log('Upload response debug:', res.statusCode, res.raw ? res.raw.slice(0, 200) : res.body);
    }
    assert.strictEqual(res.statusCode, 201, `Upload status expected 201, got ${res.statusCode}: ${JSON.stringify(res.body || res.raw)}`);
    assert.ok(res.body.id, 'Document ID must be returned');
    assert.strictEqual(res.body.detected_language, 'fa', 'Detected language must be Persian/Dari (fa)');
    assert.strictEqual(res.body.is_rtl, true, 'is_rtl must be true');
    docId = res.body.id;
  });

  // 2. Generate small 3-question exam
  let examId = '';
  let initialQuestions = [];
  await runTest('Generate grounded 3-question exam from Dari document', async () => {
    const res = await httpPostJson(
      `${BASE_URL}/api/exams/generate`,
      {
        document_id: docId,
        title: 'آزمون دموکراسی پایدار',
        subject: 'علوم سیاسی',
        groups_count: 1,
        question_types_config: { mcq: 2, short_answer: 1 },
      },
      null,
      testSessionId
    );

    assert.strictEqual(res.statusCode, 201, `Generate status expected 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, 'Exam ID must be generated');
    assert.strictEqual(res.body.groups.length, 1);
    assert.strictEqual(res.body.groups[0].questions.length, 3);

    examId = res.body.id;
    initialQuestions = JSON.parse(JSON.stringify(res.body.groups[0].questions));
  });

  // 3. Test single-question regeneration on MCQ
  const mcqQuestion = initialQuestions.find((q) => q.question_type === 'mcq');
  assert.ok(mcqQuestion, 'Must have at least one MCQ question to test regeneration');
  const siblingQuestions = initialQuestions.filter((q) => q.id !== mcqQuestion.id);

  let regeneratedMCQ = null;
  await runTest('Regenerate Dari MCQ: must not contain English biology prefix or placeholder options', async () => {
    const res = await httpPostJson(
      `${BASE_URL}/api/exams/${examId}/questions/${mcqQuestion.id}/regenerate`,
      { instructions: 'تمرکز بر اصل تفکیک قوا و قوه مقننه' },
      null,
      testSessionId
    );

    assert.strictEqual(res.statusCode, 200, `Regenerate status expected 200, got ${res.statusCode}`);
    regeneratedMCQ = res.body;

    // Requirement 1 & 2: NO English prefixes and NO biology terms
    assert.ok(!regeneratedMCQ.question_text.includes('Regenerated:'), 'Must NOT contain "Regenerated:" prefix');
    assert.ok(!regeneratedMCQ.question_text.includes('Focused Concept'), 'Must NOT contain "Focused Concept" prefix');
    assert.ok(!/biological role|cellular function|mitochondria/i.test(regeneratedMCQ.question_text), 'Must NOT contain biology concepts');

    // Requirement 2: Language must be Dari/Persian (RTL characters)
    assert.ok(/[\u0600-\u06FF]/.test(regeneratedMCQ.question_text), 'Question text must be in Dari/Persian script');

    // Requirement 4: Exactly 4 distinct options, no placeholders
    assert.ok(Array.isArray(regeneratedMCQ.options), 'Options must be an array');
    assert.strictEqual(regeneratedMCQ.options.length, 4, `Options must contain exactly 4 choices, got ${regeneratedMCQ.options.length}`);

    // No fake options such as "New Option E" or "New Option"
    for (const opt of regeneratedMCQ.options) {
      assert.ok(!/^New Option\b/i.test(opt), `Option cannot be placeholder: "${opt}"`);
      assert.ok(!/^Option\s+[A-Z0-9]/i.test(opt), `Option cannot be generic placeholder: "${opt}"`);
      assert.ok(!/^گزینه جدید/i.test(opt), `Option cannot be generic Persian placeholder: "${opt}"`);
      assert.ok(opt.trim().length > 0, 'Option text must not be empty');
    }

    const uniqueOptions = new Set(regeneratedMCQ.options.map((o) => o.trim()));
    assert.strictEqual(uniqueOptions.size, 4, 'All 4 options must be distinct');

    // Exactly 1 correct answer that exists in the 4 options
    assert.ok(regeneratedMCQ.correct_answer, 'Must have a correct answer');
    assert.ok(
      regeneratedMCQ.options.includes(regeneratedMCQ.correct_answer),
      `Correct answer "${regeneratedMCQ.correct_answer}" must match one of the 4 options: ${JSON.stringify(regeneratedMCQ.options)}`
    );

    // Provenance grounded in target document
    assert.strictEqual(regeneratedMCQ.source_document_name, 'دموکراسی پایدار در افغانستان.docx');
  });

  // 4. Test Isolation: Ensure NO other questions in the exam were modified
  await runTest('Regeneration Isolation: sibling questions, marks, and ordering remain 100% unchanged', async () => {
    const res = await httpGet(`${BASE_URL}/api/exams/${examId}`, null, testSessionId);
    assert.strictEqual(res.statusCode, 200);
    const examData = JSON.parse(res.buffer.toString('utf8'));
    const groupQuestions = examData.groups[0].questions;

    for (const originalSibling of siblingQuestions) {
      const currentSibling = groupQuestions.find((q) => q.id === originalSibling.id);
      assert.ok(currentSibling, `Sibling question ${originalSibling.id} must still exist`);
      assert.strictEqual(currentSibling.question_text, originalSibling.question_text, 'Sibling question text must be untouched');
      assert.strictEqual(currentSibling.marks, originalSibling.marks, 'Sibling question marks must be untouched');
      assert.strictEqual(currentSibling.correct_answer, originalSibling.correct_answer, 'Sibling correct answer must be untouched');
      assert.deepStrictEqual(currentSibling.options, originalSibling.options, 'Sibling options must be untouched');
      assert.strictEqual(currentSibling.question_order, originalSibling.question_order, 'Sibling order must be untouched');
      assert.strictEqual(currentSibling.source_evidence, originalSibling.source_evidence, 'Sibling citation must be untouched');
    }
  });

  // 5. Test PUT Question Validation: Reject "New Option E" and require 4 options
  await runTest('PUT validation: rejects 5 options or placeholder "New Option E"', async () => {
    const badPayload = {
      question_text: 'سوال ویرایش شده تستی',
      options: ['گزینه الف', 'گزینه ب', 'گزینه ج', 'گزینه د', 'New Option E'],
      correct_answer: 'گزینه الف',
    };

    const res = await httpPutJson(
      `${BASE_URL}/api/exams/${examId}/questions/${mcqQuestion.id}`,
      badPayload,
      null,
      testSessionId
    );

    assert.strictEqual(res.statusCode, 422, `Expected 422 for 5 options with placeholder, got ${res.statusCode}`);

    // Test valid 4-option update
    const goodPayload = {
      question_text: 'کدام مورد از وظایف اصلی قوه مقننه در یک نظام دموکراتیک است؟',
      options: [
        'قانون‌گذاری و نظارت بر قوه مجریه',
        'فرماندهی مستقیم نیروهای امنیتی',
        'صدور احکام قطعی در دعاوی کیفری',
        'تعیین نرخ روزانه اسعار خارجی',
      ],
      correct_answer: 'قانون‌گذاری و نظارت بر قوه مجریه',
    };

    const goodRes = await httpPutJson(
      `${BASE_URL}/api/exams/${examId}/questions/${mcqQuestion.id}`,
      goodPayload,
      null,
      testSessionId
    );

    assert.strictEqual(goodRes.statusCode, 200, `Expected 200 for valid 4-option update, got ${goodRes.statusCode}`);
    assert.strictEqual(goodRes.body.options.length, 4);
    assert.strictEqual(goodRes.body.correct_answer, 'قانون‌گذاری و نظارت بر قوه مجریه');
  });

  // 6. Test DOCX Export Sanitization
  await runTest('Export DOCX: verify no internal labels or "New Option E" in exported document', async () => {
    const res = await httpGet(`${BASE_URL}/api/exams/${examId}/export/docx`, null, testSessionId);
    assert.strictEqual(res.statusCode, 200, `DOCX export failed with status ${res.statusCode}`);
    assert.ok(res.buffer.length > 2000, 'DOCX buffer must be non-empty');

    const docxStr = res.buffer.toString('binary');
    // Binary/XML check for unwanted strings
    assert.ok(!docxStr.includes('Regenerated:'), 'DOCX must NOT contain "Regenerated:"');
    assert.ok(!docxStr.includes('Focused Concept'), 'DOCX must NOT contain "Focused Concept"');
    assert.ok(!docxStr.includes('New Option E'), 'DOCX must NOT contain "New Option E"');
    assert.ok(!docxStr.includes('(E)'), 'DOCX must NOT contain option label (E)');
    assert.ok(!docxStr.includes('(F)'), 'DOCX must NOT contain option label (F)');
  });

  // 7. Test PDF Export Sanitization
  await runTest('Export PDF: verify no internal labels or "New Option E" in PDF stream', async () => {
    const res = await httpGet(`${BASE_URL}/api/exams/${examId}/export/pdf`, null, testSessionId);
    assert.strictEqual(res.statusCode, 200, `PDF export failed with status ${res.statusCode}`);
    assert.ok(res.buffer.length > 3000, 'PDF buffer must be non-empty');

    // Parse PDF text with pdf-parse
    const parser = new PDFParse({ data: res.buffer });
    const textRes = await parser.getText();
    await parser.destroy();

    const pdfText = typeof textRes === 'string' ? textRes : (textRes && textRes.text) || res.buffer.toString('latin1');
    assert.ok(!pdfText.includes('Regenerated:'), 'PDF text must NOT contain "Regenerated:"');
    assert.ok(!pdfText.includes('Focused Concept'), 'PDF text must NOT contain "Focused Concept"');
    assert.ok(!pdfText.includes('New Option E'), 'PDF text must NOT contain "New Option E"');
    assert.ok(!pdfText.includes('(E)'), 'PDF text must NOT contain (E)');
  });

  // 8. English Document Regression Check
  await runTest('English Document Regression: single-question regeneration on Cell_Biology_101.pdf', async () => {
    const res = await httpPostJson(
      `${BASE_URL}/api/exams/exam-cell-bio-midterm/questions/q-a-1/regenerate`,
      { instructions: 'Focus on nucleolus rRNA synthesis' },
      null,
      'default'
    );

    assert.strictEqual(res.statusCode, 200, `Regenerate status expected 200, got ${res.statusCode}`);
    assert.ok(!res.body.question_text.includes('Regenerated:'), 'English regenerated text must not contain "Regenerated:" prefix');
    assert.ok(!res.body.question_text.includes('Focused Concept'), 'English regenerated text must not contain "Focused Concept" prefix');
    assert.strictEqual(res.body.options.length, 4, 'English MCQ must have exactly 4 options');
    assert.ok(!res.body.options.some((o) => /^New Option/i.test(o)), 'English options must not contain placeholder labels');
  });

  console.log('\n================================================================');
  console.log(`  ALL ${passedTests}/${totalTests} REGENERATION & EXPORT TESTS PASSED SUCCESSFULLY ✓`);
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\nTest suite failed with error:', err);
  process.exit(1);
});
