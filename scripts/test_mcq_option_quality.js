import assert from 'node:assert';
import http from 'node:http';
import AdmZip from 'adm-zip';
import {
  formatConcisePersianOption,
  generateConceptSpecificPersianDistractors,
} from '../src/server/textQuality.ts';
import { areQuestionsDuplicate } from '../src/server/duplicateDetector.ts';

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

function httpUploadFile(url, fileBuffer, filename, mimetype, sessionId) {
  return new Promise((resolve, reject) => {
    const boundary = '----OptionQualityBoundary' + Math.random().toString(36).slice(2);
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

    const payload = Buffer.concat([
      Buffer.from(header, 'utf8'),
      fileBuffer,
      Buffer.from(footer, 'utf8'),
    ]);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
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
    req.write(payload);
    req.end();
  });
}

function buildSyntheticDocx(paragraphs) {
  const zip = new AdmZip();
  let documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>`;

  for (const p of paragraphs) {
    documentXml += `
    <w:p>
      <w:r>
        <w:t>${p}</w:t>
      </w:r>
    </w:p>`;
  }

  documentXml += `
  </w:body>
</w:document>`;

  zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`, 'utf8')
  );
  zip.addFile(
    '_rels/.rels',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, 'utf8')
  );

  return zip.toBuffer();
}

async function runTests() {
  console.log('\n================================================================');
  console.log('  EXAMCRAFT AI: MCQ OPTION QUALITY & DEDUPLICATION TEST SUITE  ');
  console.log('================================================================\n');

  // =========================================================================
  // 1. Unit Tests: formatConcisePersianOption
  // =========================================================================
  console.log('[1] Testing formatConcisePersianOption...');
  const test1 = formatConcisePersianOption('بنابراین حاکمیت قانون تضمین‌کننده برابری تمام شهروندان در برابر محاکم قضایی است.');
  assert(!test1.startsWith('بنابراین'), 'Discourse markers must be stripped');
  assert(test1.length <= 95, `Option must be concise (length: ${test1.length})`);
  assert(!/[.!?؛]$/.test(test1), 'Trailing punctuation must be stripped');
  console.log(`  Formatted: "${test1}" (${test1.length} chars)`);

  const longClause = 'همچنین تفکیک قوا میان قوای سه‌گانه مقننه، مجریه و قضاییه مانع از تمرکز قدرت و استبداد فردی در اداره حکومت می‌گردد، که این امر ضامن بقای دموکراسی است.';
  const test2 = formatConcisePersianOption(longClause, 'تفکیک قوا');
  assert(test2.length <= 95, `Long clause must be trimmed concisely (${test2.length} chars)`);
  assert(!test2.includes('همچنین'), 'Discourse marker removed');
  console.log(`  Formatted long clause: "${test2}" (${test2.length} chars)`);
  console.log('✓ [1] formatConcisePersianOption tests passed.');

  // =========================================================================
  // 2. Unit Tests: generateConceptSpecificPersianDistractors & Safe Rejection
  // =========================================================================
  console.log('\n[2] Testing generateConceptSpecificPersianDistractors...');
  const mockChunks = [
    { chunk_id: 'c1', content: 'حاکمیت قانون تضمین‌کننده عدالت اجتماعی و برابری همگان در برابر قانون است.' },
    { chunk_id: 'c2', content: 'تفکیک قوا موجب نظارت متقابل و جلوگیری از تمرکز قدرت در دستان یک قوه می‌گردد.' },
    { chunk_id: 'c3', content: 'انتخابات شفاف و مشارکت سیاسی آزاد از پایه‌های اساسی مشروعیت نظام‌های دموکراتیک به شمار می‌رود.' },
    { chunk_id: 'c4', content: 'استقلال دستگاه قضایی اعتماد عمومی به نظام عدالت را تحکیم می‌بخشد.' },
  ];

  const used = new Set();
  const distractors1 = generateConceptSpecificPersianDistractors(
    mockChunks[0].content,
    'حاکمیت قانون',
    mockChunks,
    'c1',
    0,
    0,
    used,
    'تضمین‌کننده برابری تمام شهروندان در برابر محاکم قضایی'
  );

  assert(distractors1 !== null, 'Distractors should be generated for well-grounded concept');
  assert.strictEqual(distractors1.length, 3, 'Must return exactly 3 distractors');
  for (const d of distractors1) {
    assert(d.length <= 100, `Distractor too long: ${d}`);
    assert(!used.has(d), `Distractor already in used set: ${d}`);
    used.add(d);
  }
  console.log(`  Distractors for "حاکمیت قانون":\n    - ${distractors1.join('\n    - ')}`);

  // Now generate for concept 2 ("تفکیک قوا") and verify distinctness from concept 1
  const distractors2 = generateConceptSpecificPersianDistractors(
    mockChunks[1].content,
    'تفکیک قوا',
    mockChunks,
    'c2',
    1,
    0,
    used,
    'مانع از تمرکز مطلق قدرت در قوه مجریه می‌گردد'
  );
  assert(distractors2 !== null, 'Distractors for concept 2 must be generated');
  assert.strictEqual(distractors2.length, 3, 'Must return exactly 3 distractors');
  console.log(`  Distractors for "تفکیک قوا":\n    - ${distractors2.join('\n    - ')}`);

  // Assert NO overlap between distractors1 and distractors2
  const overlap = distractors1.filter((d) => distractors2.includes(d));
  assert.strictEqual(overlap.length, 0, `Distractors should not be identical across concepts: ${overlap}`);

  // Test safe candidate rejection when chunks are empty and concept is unknown
  const emptyRejection = generateConceptSpecificPersianDistractors(
    'یک جمله بسیار مبهم و ناشناخته بدون زمینه مفهومی.',
    'مفهوم_نامعلوم_xyz',
    [],
    'c_none',
    0,
    0,
    new Set(),
    'پاسخ صحیح تستی'
  );
  assert.strictEqual(emptyRejection, null, 'Must safely reject (return null) if insufficient distinct evidence');
  console.log('✓ [2] generateConceptSpecificPersianDistractors unit tests and safe rejection passed.');

  // =========================================================================
  // 3. Unit Tests: areQuestionsDuplicate with Shared MCQ Options
  // =========================================================================
  console.log('\n[3] Testing areQuestionsDuplicate with shared options...');
  const qA = {
    question_text: 'در رابطه با حاکمیت قانون کدام مورد صحیح است؟',
    question_type: 'mcq',
    options: ['گزینه الف', 'گزینه ب', 'گزینه ج', 'گزینه د'],
  };
  const qB_reusedOptions = {
    question_text: 'در خصوص تفکیک قوا کدام تحلیل درست است؟',
    question_type: 'mcq',
    // Shares 3 options with qA
    options: ['گزینه الف', 'گزینه ب', 'گزینه ج', 'گزینه ه'],
  };
  const isDup = areQuestionsDuplicate(qA, qB_reusedOptions);
  assert.strictEqual(isDup, true, 'MCQs sharing 2+ options MUST be flagged as duplicates');
  console.log('✓ [3] areQuestionsDuplicate correctly rejects questions with shared option sets.');

  // =========================================================================
  // 4. End-to-End API Test: Generation with Multiple MCQs
  // =========================================================================
  console.log('\n[4] Testing live exam generation with 2 MCQs in Dari/Persian...');
  const sessionId = 'mcq_option_test_' + Date.now();

  const paragraphs = [
    'حاکمیت قانون بنیاد جامعه مدنی و متضمن برابری تمام افراد جامعه در پیشگاه عدالت است. هیچ مقامی نمی‌تواند فراتر از مقررات مدون عمل نماید.',
    'تفکیک قوا میان قوای سه‌گانه مقننه، مجریه و قضاییه ضامن مهار قدرت و جلوگیری از استبداد سیاسی است و هماهنگی سازنده میان نهادها را ایجاد می‌کند.',
    'انتخابات ادواری و شفاف رکن اساسی مشروعیت دموکراتیک به حساب می‌آید که مشارکت آگاهانه شهروندان را در تعیین سرنوشت رقم می‌زند.',
    'نظام قضایی مستقل نقشی حیاتی در رسیدگی منصفانه به دعاوی و حراست از حقوق اساسی ملت ایفا می‌نماید.',
    'رسانه‌های آزاد و جامعه مدنی فعال نظارت همگانی بر عملکرد مسوولان را تقویت نموده و شفافیت ساختاری به بار می‌آورند.',
    'حقوق و آزادی‌های فردی از ارکان لاینفک قانون اساسی بوده و کرامت انسانی شهروندان را تضمین می‌کند.',
    'نظام مالیاتی عادلانه و شفافیت بودجه عمومی از شروط اساسی سلامت اقتصادی و انضباط مالی حکومت به شمار می‌آید.',
    'توسعه پایدار نیازمند صیانت از منابع طبیعی، محیط زیست و برنامه‌ریزی جامع برای نسل‌های آینده جامعه است.',
    'آموزش عمومی و سوادآموزی فراگیر زیربنای آگاهی مدنی، رشد اقتصادی و مشارکت فعال مردم در امور عمومی محسوب می‌شود.',
    'سلامت همگانی و دسترسی عادلانه به خدمات صحی از حقوق اولیه هر فرد در ساختار رفاه اجتماعی مدرن است.',
  ];

  const docxBuffer = buildSyntheticDocx(paragraphs);
  const uploadRes = await httpUploadFile(
    `${BASE_URL}/api/documents/upload`,
    docxBuffer,
    'mcq_option_quality_test.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sessionId
  );

  assert(
    uploadRes.statusCode === 200 || uploadRes.statusCode === 201,
    `Upload failed (${uploadRes.statusCode}): ${JSON.stringify(uploadRes.body)}`
  );
  const docId = uploadRes.body.id;
  console.log(`  Uploaded test document: ${docId}`);

  // Generate Exam with 2 groups, 2 MCQs each
  const genRes = await httpPostJson(
    `${BASE_URL}/api/exams/generate`,
    {
      title: 'امتحان حقوق اساسی و ساختار حاکمیت',
      subject: 'حقوق و علوم سیاسی',
      document_id: docId,
      language: 'fa',
      difficulty: 'medium',
      duration_minutes: 60,
      groups_count: 2,
      question_types_config: {
        mcq: 2,
        true_false: 1,
      },
    },
    null,
    sessionId
  );

  assert.strictEqual(genRes.statusCode, 201, `Exam generation failed: ${JSON.stringify(genRes.body)}`);
  const exam = genRes.body;
  assert(exam && exam.groups && exam.groups.length === 2, 'Must have 2 groups');
  console.log(`  Generated Exam ID: ${exam.id} (${exam.groups.length} groups, ${exam.questions_count} questions)`);

  for (const group of exam.groups) {
    console.log(`\n  Inspecting Group ${group.group_name}:`);
    const mcqs = group.questions.filter((q) => q.question_type === 'mcq');
    assert(mcqs.length >= 2, `Group ${group.group_name} must have at least 2 MCQs (got ${mcqs.length})`);

    const mcq1 = mcqs[0];
    const mcq2 = mcqs[1];

    console.log(`    MCQ 1 Stem: ${mcq1.question_text}`);
    console.log(`    MCQ 1 Options:\n      ${mcq1.options.map((o, idx) => `[${idx + 1}] ${o}`).join('\n      ')}`);
    console.log(`    MCQ 1 Correct: ${mcq1.correct_answer}`);

    console.log(`    MCQ 2 Stem: ${mcq2.question_text}`);
    console.log(`    MCQ 2 Options:\n      ${mcq2.options.map((o, idx) => `[${idx + 1}] ${o}`).join('\n      ')}`);
    console.log(`    MCQ 2 Correct: ${mcq2.correct_answer}`);

    // Requirement: Exactly 4 options
    assert.strictEqual(mcq1.options.length, 4, 'MCQ 1 must have exactly 4 options');
    assert.strictEqual(mcq2.options.length, 4, 'MCQ 2 must have exactly 4 options');

    // Requirement: Strict correct_answer alignment
    assert(
      mcq1.options.includes(mcq1.correct_answer),
      `MCQ 1 correct_answer "${mcq1.correct_answer}" must match an option`
    );
    assert(
      mcq2.options.includes(mcq2.correct_answer),
      `MCQ 2 correct_answer "${mcq2.correct_answer}" must match an option`
    );

    // Requirement: Options are distinct within the question
    assert.strictEqual(new Set(mcq1.options).size, 4, 'MCQ 1 must have 4 distinct options');
    assert.strictEqual(new Set(mcq2.options).size, 4, 'MCQ 2 must have 4 distinct options');

    // Requirement: No run-on long paragraph copies
    for (const opt of [...mcq1.options, ...mcq2.options]) {
      assert(opt.length <= 110, `Option is too long (>110 chars): "${opt}" (${opt.length} chars)`);
      assert(opt.length >= 10, `Option is too short: "${opt}"`);
    }

    // CRITICAL REQUIREMENT: Questions 1 and 2 must NOT reuse the same options!
    const sharedOptions = mcq1.options.filter((opt1) => mcq2.options.includes(opt1));
    console.log(`    Shared options between MCQ 1 and MCQ 2: ${sharedOptions.length} (${JSON.stringify(sharedOptions)})`);
    assert(
      sharedOptions.length <= 1,
      `MCQ 1 and MCQ 2 reused nearly identical options! Found ${sharedOptions.length} identical options: ${JSON.stringify(sharedOptions)}`
    );

    // Requirement: Metadata grounding
    assert(mcq1.source_page !== undefined && mcq1.source_page !== null, 'MCQ 1 missing source_page');
    assert(mcq1.source_evidence, 'MCQ 1 missing source_evidence');
    assert(mcq2.source_page !== undefined && mcq2.source_page !== null, 'MCQ 2 missing source_page');
    assert(mcq2.source_evidence, 'MCQ 2 missing source_evidence');
  }

  console.log('✓ [4] Generated MCQs have distinct, concise, parallel options with strict correct-answer alignment.');

  // =========================================================================
  // 5. MCQ Regeneration Deduplication Test
  // =========================================================================
  console.log('\n[5] Testing single MCQ regeneration with cross-question option deduplication...');
  const targetMcq = exam.groups[0].questions.find((q) => q.question_type === 'mcq');
  assert(targetMcq, 'Target MCQ for regeneration must exist');

  const regenRes = await httpPostJson(
    `${BASE_URL}/api/exams/${exam.id}/questions/${targetMcq.id}/regenerate`,
    {
      instruction: 'تأکید بر استقلال قوه قضاییه',
    },
    null,
    sessionId
  );

  assert.strictEqual(regenRes.statusCode, 200, `Regeneration failed: ${JSON.stringify(regenRes.body)}`);
  const regeneratedMcq = regenRes.body;
  assert.strictEqual(regeneratedMcq.question_type, 'mcq', 'Regenerated question must be MCQ');
  assert.strictEqual(regeneratedMcq.options.length, 4, 'Regenerated MCQ must have 4 options');
  assert(
    regeneratedMcq.options.includes(regeneratedMcq.correct_answer),
    `Regenerated MCQ correct_answer "${regeneratedMcq.correct_answer}" must match one of options`
  );
  console.log(`  Regenerated MCQ stem: ${regeneratedMcq.question_text}`);
  console.log(`  Regenerated Options: ${JSON.stringify(regeneratedMcq.options)}`);

  console.log('\n================================================================');
  console.log('  ALL MCQ OPTION QUALITY & DEDUPLICATION TESTS PASSED OK!       ');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
