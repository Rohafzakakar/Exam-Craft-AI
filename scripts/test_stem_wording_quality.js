import assert from 'node:assert';
import http from 'node:http';
import AdmZip from 'adm-zip';
import { removeRagBoilerplateFromQuestionStem } from '../src/server/textQuality.ts';

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
    const boundary = '----StemWordingBoundary' + Math.random().toString(36).slice(2);
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
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  );

  zip.addFile(
    '_rels/.rels',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  );

  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>`;

  for (const p of paragraphs) {
    docXml += `
    <w:p>
      <w:r>
        <w:t>${p}</w:t>
      </w:r>
    </w:p>`;
  }

  docXml += `
  </w:body>
</w:document>`;

  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf8'));
  return zip.toBuffer();
}

async function runTests() {
  console.log('================================================================');
  console.log('  EXAMCRAFT AI: STUDENT-FACING WORDING & RAG BOILERPLATE TESTS  ');
  console.log('================================================================\n');

  // =========================================================================
  // 1. Unit Tests for removeRagBoilerplateFromQuestionStem
  // =========================================================================
  console.log('[1] Testing removeRagBoilerplateFromQuestionStem unit logic...');

  // 1a. MCQ with "با استناد به مباحث مندرج در صفحه ۱ پیرامون..."
  const mcq1 = 'با استناد به مباحث مندرج در صفحه ۱ پیرامون «مردم‌سالاری دینی»، کدام گزینه بیانگر تحلیل و نتیجه‌گیری صحیح است؟';
  const cleanMcq1 = removeRagBoilerplateFromQuestionStem(mcq1);
  assert(!cleanMcq1.includes('با استناد به مباحث مندرج در صفحه ۱'));
  assert(!cleanMcq1.includes('پیرامون'));
  assert(cleanMcq1.includes('«مردم‌سالاری دینی»'));
  console.log('  ✓ MCQ stem 1 cleaned:', cleanMcq1);

  // 1b. MCQ with "طبق تحلیل ارائه شده در متن منبع" and "ارائهشده"
  const mcq2 = 'طبق تحلیل ارائه شده در متن منبع در خصوص «تفکیک قوا»، کدام گزاره مفهوم محوری را به درستی تبیین می‌کند؟';
  const cleanMcq2 = removeRagBoilerplateFromQuestionStem(mcq2);
  assert(!cleanMcq2.includes('طبق تحلیل ارائه شده در متن منبع'));
  assert(cleanMcq2.includes('«تفکیک قوا»'));
  console.log('  ✓ MCQ stem 2 cleaned:', cleanMcq2);

  const mcq2b = 'طبق تحلیل ارائهشده در متن منبع در خصوص «حاکمیت قانون»، کدام گزاره مفهوم محوری را به درستی تبیین می‌کند؟';
  const cleanMcq2b = removeRagBoilerplateFromQuestionStem(mcq2b);
  assert(!cleanMcq2b.includes('طبق تحلیل ارائهشده در متن منبع'));
  assert(cleanMcq2b.includes('«حاکمیت قانون»'));
  console.log('  ✓ MCQ stem 2b (unspaced ارائهشده) cleaned:', cleanMcq2b);

  // 1c. True/False with "بر اساس متن منبع (صفحه ۱):"
  const tf1 = 'صحیح یا غلط: بر اساس متن منبع (صفحه ۱): تفکیک قوا مانع تمرکز استبدادی قدرت در نظام سیاسی می‌شود.';
  const cleanTf1 = removeRagBoilerplateFromQuestionStem(tf1);
  assert.strictEqual(cleanTf1, 'صحیح یا غلط: تفکیک قوا مانع تمرکز استبدادی قدرت در نظام سیاسی می‌شود.');
  console.log('  ✓ True/False stem cleaned:', cleanTf1);

  // 1d. Fill in the blank with "با توجه به متن صفحه ۱"
  const fib1 = 'جای خالی را با توجه به متن صفحه ۱ تکمیل نمایید: حاکمیت قانون بر پایه [_____] استوار است.';
  const cleanFib1 = removeRagBoilerplateFromQuestionStem(fib1);
  assert.strictEqual(cleanFib1, 'جای خالی را با کلمه مناسب تکمیل نمایید: حاکمیت قانون بر پایه [_____] استوار است.');
  console.log('  ✓ Fill-in-the-blank stem cleaned:', cleanFib1);

  // 1e. Essay with "با استناد به تحلیل ارائه‌شده در صفحه ۱ پیرامون..."
  const essay1 = 'با استناد به تحلیل ارائه‌شده در صفحه ۱ پیرامون «حقوق شهروندی»، ابعاد راهبردی، موانع اجرایی و راه‌کارهای تحقق آن را به تفصیل ارزیابی و تحلیل نمایید.';
  const cleanEssay1 = removeRagBoilerplateFromQuestionStem(essay1);
  assert(!cleanEssay1.includes('با استناد به تحلیل ارائه‌شده'));
  assert(!cleanEssay1.includes('صفحه ۱'));
  assert(!cleanEssay1.includes('پیرامون'));
  assert(cleanEssay1.includes('«حقوق شهروندی»'));
  console.log('  ✓ Essay stem cleaned:', cleanEssay1);

  // 1f. Short Answer with "بر اساس متن آموزشی صفحه ۱"
  const sa1 = 'بر اساس متن آموزشی صفحه ۱، اهمیت و ابعاد کلیدی «عدالت اجتماعی» را در ۲ الی ۳ جمله تبیین نمایید.';
  const cleanSa1 = removeRagBoilerplateFromQuestionStem(sa1);
  assert(!cleanSa1.includes('بر اساس متن آموزشی صفحه ۱'));
  assert(cleanSa1.includes('«عدالت اجتماعی»'));
  console.log('  ✓ Short answer stem cleaned:', cleanSa1);

  // 1g. Genuine consultation of a specific table/figure/passage (Requirement 5)
  const genuineTable = 'با توجه به جدول مندرج در صفحه ۳، ارقام رشد اقتصادی را مقایسه نمایید.';
  const preservedTable = removeRagBoilerplateFromQuestionStem(genuineTable);
  assert.strictEqual(preservedTable, genuineTable, 'Genuine table consultation must be preserved');
  console.log('  ✓ Genuine table reference preserved:', preservedTable);

  console.log('✓ [1] Unit tests for stem cleaning passed successfully.\n');

  // =========================================================================
  // 2. End-to-End Test: Persian Document Upload & Exam Generation
  // =========================================================================
  console.log('[2] Testing End-to-End Persian Exam Generation without RAG Boilerplate...');
  const sessionId = `guest_wording_test_${Date.now()}`;

  const docxBuffer = buildSyntheticDocx([
    'فصل اول: مبانی حقوق عمومی و دموکراسی در افغانستان.',
    'حاکمیت قانون یکی از بنیادی‌ترین ارکان نظام مردم‌سالار است که از خودکامگی و تمرکز غیرقانونی قدرت جلوگیری می‌کند.',
    'تفکیک قوا میان قوای سه‌گانه مقننه، مجریه و قضائیه ضامن استقلال محاکم و صیانت از آزادی‌های مشروع شهروندان است.',
    'مشارکت فعال شهروندان در انتخابات سراسری مشروعیت نهادهای حکومتی را تحکیم نموده و پاسخگویی مسئولان را ارتقا می‌دهد.',
    'عدالت قضایی نیازمند ساختار اداری شفاف، بیطرفی کامل قضات و دسترسی برابر کلیه اقشار جامعه به محاکم صالحه است.',
    'حقوق اساسی زنان و دسترسی آنان به فرصت‌های تحصیلی و شغلی از مهم‌ترین شاخص‌های ارزیابی توسعه‌یافتگی اجتماعی محسوب می‌شود.',
    'جامعه مدنی و رسانه‌های آزاد نقش دیده‌بان مستقل را در نظارت بر حسن اجرای قوانین و مهار فساد اداری ایفا می‌کنند.',
    'آزادی بیان و قلم از حقوق بنیادین مصرح در اسناد حقوق بشری است که زمینه تضارب آرا و نقد سازنده را فراهم می‌آورد.',
    'برابری کلیه اتباع در برابر قانون بدون هرگونه تبعیض نژادی یا زبانی ضامن همبستگی ملی و ثبات سیاسی است.',
    'نظام مالیاتی عادلانه و مدیریت بودجه دولتی امکان ارائه خدمات عامه و کاهش فقر ساختاری را میسر می‌سازد.',
    'مسئولیت مدنی و پاسخگویی کارمندان دولت در قبال تخطی‌های قانونی از اصول خدشه‌ناپذیر حکومتداری شفاف به شمار می‌رود.',
    'نهادهای نظارتی مستقل برای تضمین شفافیت در قراردادهای عامه و پیشگیری از سوءاستفاده‌های مالی ضروری هستند.',
  ]);

  const uploadRes = await httpUploadFile(
    `${BASE_URL}/api/documents/upload`,
    docxBuffer,
    'public_law_afghanistan.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sessionId
  );

  assert.strictEqual(uploadRes.statusCode, 201, `Upload failed: ${JSON.stringify(uploadRes.body)}`);
  const docId = uploadRes.body.id;
  console.log(`  Uploaded document: ${docId}`);

  // Generate an exam across 2 groups with MCQ, True/False, Fill in Blank, Short Answer, and Essay
  const genRes = await httpPostJson(
    `${BASE_URL}/api/exams/generate`,
    {
      document_id: docId,
      session_id: sessionId,
      title: 'امتحان نهایی حقوق عمومی و دموکراسی',
      subject: 'حقوق عمومی',
      grade_level: 'دانشگاهی',
      institution: 'دانشکده حقوق و علوم سیاسی',
      duration_minutes: 90,
      groups_count: 2,
      question_types_config: {
        mcq: 1,
        true_false: 1,
        fill_blank: 1,
        short_answer: 1,
        essay: 1,
      },
    },
    null,
    sessionId
  );

  assert.strictEqual(genRes.statusCode, 201, `Generation failed: ${JSON.stringify(genRes.body)}`);
  const exam = genRes.body;
  assert(exam && exam.groups && exam.groups.length === 2, 'Must generate 2 groups');
  console.log(`  Generated Exam ID: ${exam.id} (${exam.groups.length} groups, ${exam.questions_count} questions)`);

  const forbiddenPhrases = [
    'طبق تحلیل ارائه شده در متن منبع',
    'طبق تحلیل ارائهشده در متن منبع',
    'با استناد به مباحث مندرج در صفحه',
    'بر اساس متن منبع (صفحه',
    'جای خالی را با توجه به متن صفحه',
    'دیدگاه‌های آموزشی مندرج در متن منبع درباره',
    'بر مبنای مباحث صفحه',
    'بر اساس متن آموزشی (صفحه',
    'بر اساس متن آموزشی صفحه',
    'با استناد به مفاهیم ارائه شده در صفحه',
    'با استناد به تحلیل ارائه‌شده در صفحه',
    'تحلیل گزاره صفحه',
    'مفاهیم پیرامونی مرتبط با مباحث صفحه',
  ];

  for (const group of exam.groups) {
    console.log(`\n  Checking Group ${group.group_name}:`);
    for (const q of group.questions) {
      console.log(`    [${q.question_type}] ${q.question_text}`);

      // Check that student-facing question text has NO forbidden boilerplate
      for (const phrase of forbiddenPhrases) {
        assert(
          !q.question_text.includes(phrase),
          `Question ${q.id} contains forbidden boilerplate "${phrase}": ${q.question_text}`
        );
      }

      // Check MCQ options do NOT contain fallback boilerplate
      if (q.options) {
        for (const opt of q.options) {
          assert(!opt.includes('تحلیل گزاره صفحه'), `Option contains boilerplate: ${opt}`);
          assert(!opt.includes('مرتبط با مباحث صفحه'), `Option contains boilerplate: ${opt}`);
        }
      }

      // Check that source metadata is genuinely preserved
      assert(q.source_page !== undefined && q.source_page !== null, `Question ${q.id} missing source_page`);
      assert(q.source_document_name, `Question ${q.id} missing source_document_name`);
      assert(q.source_chunk_id, `Question ${q.id} missing source_chunk_id`);
      assert(q.source_evidence, `Question ${q.id} missing source_evidence`);
      assert(q.explanation, `Question ${q.id} missing explanation`);
      assert(q.marks > 0, `Question ${q.id} must have positive marks`);
    }
  }

  console.log('\n✓ [2] All generated student-facing stems are natural, direct, and free from RAG boilerplate.');

  // =========================================================================
  // 3. Question Regeneration Test
  // =========================================================================
  console.log('\n[3] Testing single question regeneration wording...');
  const targetQ = exam.groups[0].questions[0];
  const regenRes = await httpPostJson(
    `${BASE_URL}/api/exams/${exam.id}/questions/${targetQ.id}/regenerate`,
    {
      instruction: 'تمرکز بر حاکمیت قانون و تفکیک قوا',
    },
    null,
    sessionId
  );

  assert.strictEqual(regenRes.statusCode, 200, `Regeneration failed: ${JSON.stringify(regenRes.body)}`);
  const regeneratedQ = regenRes.body;
  console.log(`  Regenerated: [${regeneratedQ.question_type}] ${regeneratedQ.question_text}`);

  for (const phrase of forbiddenPhrases) {
    assert(
      !regeneratedQ.question_text.includes(phrase),
      `Regenerated question contains forbidden boilerplate "${phrase}": ${regeneratedQ.question_text}`
    );
  }
  assert(regeneratedQ.source_page !== undefined, 'Regenerated question must retain source_page');
  assert(regeneratedQ.source_evidence, 'Regenerated question must retain source_evidence');
  console.log('✓ [3] Regenerated question stem is clean and preserves source metadata.');

  console.log('\n================================================================');
  console.log('  ALL STUDENT-FACING WORDING AND BOILERPLATE TESTS PASSED OK!   ');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
