import assert from 'node:assert';
import http from 'node:http';
import AdmZip from 'adm-zip';
import { decodeXmlEntities } from '../src/server/docxParser.ts';
import { cleanLeadingPersianDiscourseMarkers, extractPersianEducationalTopic } from '../src/server/textQuality.ts';

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
    const boundary = '----ExamCraftQualityBoundary' + Math.random().toString(36).slice(2);
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

async function runTests() {
  console.log('--- TEST SUITE: DARI/PERSIAN QUALITY & XML ENTITY FIXES ---');

  // =========================================================================
  // 1. XML Entity Decoding (decodeXmlEntities)
  // =========================================================================
  console.log('\n[1] Testing XML entity decoding...');

  // Hexadecimal Persian entities
  const hexStr = '&#x628;&#x631;&#x20;&#x627;&#x633;&#x627;&#x633;';
  assert.strictEqual(decodeXmlEntities(hexStr), 'بر اساس', 'Failed to decode hex entities into Persian "بر اساس"');

  // Uppercase hex
  const upperHex = '&#X0628;&#X0631;';
  assert.strictEqual(decodeXmlEntities(upperHex), 'بر', 'Failed to decode uppercase hex entity &#X0628;');

  // Decimal Persian entities
  const decStr = '&#1576;&#1585;&#32;&#1575;&#1587;&#1575;&#1587;';
  assert.strictEqual(decodeXmlEntities(decStr), 'بر اساس', 'Failed to decode decimal entities into Persian "بر اساس"');

  // Named entities
  const namedStr = '&lt;div&gt;&quot;Hello &amp; Welcome&apos;&lt;/div&gt;';
  assert.strictEqual(decodeXmlEntities(namedStr), '<div>"Hello & Welcome\'</div>', 'Failed to decode standard XML named entities');

  // Combined mixed entities
  const mixedStr = 'حقوق &#x632;&#x646;&#x627;&#x646; &amp; &#1570;&#1586;&#1575;&#1583;&#1740;';
  assert.strictEqual(decodeXmlEntities(mixedStr), 'حقوق زنان & آزادی', 'Failed to decode mixed named, hex, and decimal entities');

  // Safe handling of malformed and out-of-range inputs (Must NOT crash)
  assert.strictEqual(decodeXmlEntities('&#xGHI;'), '&#xGHI;', 'Malformed hex should remain untouched');
  assert.strictEqual(decodeXmlEntities('&#999999999;'), '&#999999999;', 'Out-of-range decimal should remain untouched');
  assert.strictEqual(decodeXmlEntities('&#xD800;'), '&#xD800;', 'Surrogate code point should not crash and remain untouched');
  assert.strictEqual(decodeXmlEntities('&#xDFFF;'), '&#xDFFF;', 'Surrogate code point 0xDFFF should not crash');
  assert.strictEqual(decodeXmlEntities('&#x110000;'), '&#x110000;', 'Out of Unicode range (> 0x10FFFF) should remain untouched');
  assert.strictEqual(decodeXmlEntities(''), '', 'Empty string should return empty string');
  assert.strictEqual(decodeXmlEntities(null), '', 'Null should return empty string without error');

  console.log('✓ [1] XML Entity Decoding passed with full Unicode validation and crash safety.');

  // =========================================================================
  // 2. Persian Discourse Marker Cleaning (cleanLeadingPersianDiscourseMarkers)
  // =========================================================================
  console.log('\n[2] Testing Persian leading discourse marker stripping...');

  const s1 = 'همچنین، تفکیک قوا یکی از ارکان بنیادی مردم‌سالاری است.';
  assert.strictEqual(
    cleanLeadingPersianDiscourseMarkers(s1),
    'تفکیک قوا یکی از ارکان بنیادی مردم‌سالاری است.',
    'Failed to strip leading «همچنین،»'
  );

  const s2 = 'بنابراین، مشارکت شهروندان در انتخابات ضامن مشروعیت نظام سیاسی است.';
  assert.strictEqual(
    cleanLeadingPersianDiscourseMarkers(s2),
    'مشارکت شهروندان در انتخابات ضامن مشروعیت نظام سیاسی است.',
    'Failed to strip leading «بنابراین،»'
  );

  const s3 = 'علاوه بر این در نتیجه، آموزش عمومی نقش کلیدی در توسعه پایدار دارد.';
  assert.strictEqual(
    cleanLeadingPersianDiscourseMarkers(s3),
    'آموزش عمومی نقش کلیدی در توسعه پایدار دارد.',
    'Failed to strip chained leading markers'
  );

  const s4 = 'حاکمیت قانون اساس عدالت اجتماعی در هر کشور است.';
  assert.strictEqual(
    cleanLeadingPersianDiscourseMarkers(s4),
    s4,
    'Substantive sentence without discourse markers should remain intact'
  );

  console.log('✓ [2] Persian Discourse Marker Cleaning passed.');

  // =========================================================================
  // 3. Educational Topic Extraction (extractPersianEducationalTopic)
  // =========================================================================
  console.log('\n[3] Testing Persian educational topic extraction...');

  const dummyChunk = {
    id: 'chunk-test-1',
    document_id: 'doc-1',
    page_number: 1,
    chapter: 'فصل اول: حاکمیت قانون',
    section: 'تفکیک قوا و عدالت',
    content: '',
    token_count: 100,
    chunk_index: 0,
  };

  // Connective sentence: Topic must NOT be «همچنین»
  const topic1 = extractPersianEducationalTopic(
    'همچنین، اصل تفکیک قوا تضمین‌کننده استقلال قوه قضائیه از مداخلات قوه مجریه است.',
    dummyChunk
  );
  assert(topic1 && !topic1.includes('همچنین'), `Topic must not contain «همچنین», got: ${topic1}`);
  assert(topic1.length >= 5, 'Topic must be substantive');

  // Quoted term extraction
  const topic2 = extractPersianEducationalTopic(
    'در این چارچوب، مفهوم «عدالت اجتماعی» به عنوان معیار سنجش توسعه مطرح می‌شود.',
    dummyChunk
  );
  assert.strictEqual(topic2, 'عدالت اجتماعی', `Expected «عدالت اجتماعی», got: ${topic2}`);

  // Pure connective sentence: must safely fallback or return null if non-substantive
  const pureConnective = 'همچنین، بنابراین در واقع.';
  const fallbackTopic = extractPersianEducationalTopic(pureConnective, dummyChunk);
  assert(
    fallbackTopic === 'تفکیک قوا و عدالت' || fallbackTopic === null,
    `Pure connective sentence should either fallback to substantive section or return null, got: ${fallbackTopic}`
  );

  console.log('✓ [3] Educational Topic Extraction passed: zero connective contamination.');

  // =========================================================================
  // 4. End-to-End DOCX Ingestion with Hex/Decimal Entities & Exam Generation
  // =========================================================================
  console.log('\n[4] Testing DOCX upload with XML hex entities and exam generation...');

  // Build a test DOCX ZIP containing hexadecimal character references
  const testDocxZip = new AdmZip();
  testDocxZip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    )
  );

  testDocxZip.addFile(
    '_rels/.rels',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    )
  );

  // Document XML containing 10 substantive Persian paragraphs encoded with hexadecimal XML character references
  // &#x628;&#x631;&#x20;&#x627;&#x633;&#x627;&#x633; = "بر اساس"
  // &#x62A;&#x641;&#x6A9;&#x6CC;&#x6A9;&#x20;&#x642;&#x648;&#x627; = "تفکیک قوا"
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>فصل اول: مبانی حقوق اساسی و مردم‌سالاری</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>&#x628;&#x631;&#x20;&#x627;&#x633;&#x627;&#x633; اصول قانون اساسی، تفکیک قوا مانع تمرکز انحصاری قدرت در نهاد مجریه می‌شود.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>همچنین، استقلال محاکم قضائی ضامن اجرای بی‌طرفانه عدالت در رسیدگی به دعاوی است.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>علاوه بر این، نظام مالیاتی تصاعدی ابزار کارآمد دولت برای توزیع متوازن ثروت در جامعه می‌باشد.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>در نتیجه، حفاظت از ذخایر محیط زیست تعهدی بین‌نسلی برای جلوگیری از فرسایش منابع طبیعی است.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>&#x62A;&#x636;&#x645;&#x6CC;&#x646; سلامت همگانی و دسترسی به خدمات بهداشتی اولیه شاخص حیاتی توسعه انسانی است.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>نظارت دیوان محاسبات بر هزینه‌کرد بودجه مانع اختلاس دارایی‌های عمومی در پروژه‌های عمرانی می‌شود.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>توسعه صنعت گردشگری تاریخی موجب معرفی هویت باستانی کشور و رونق اقتصاد محلی می‌گردد.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>پژوهش‌های بنیادین در علوم پایه پیش‌نیاز دستیابی به استقلال صنعتی و تولید فناوری بومی است.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>شوراهای منتخب محلی وظیفه تسهیل ارائه خدمات شهری و بهسازی زیرساخت‌های ترابری را بر عهده دارند.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>حفظ حریم خصوصی دیجیتال و داده‌های شخصی کاربران مرز ضروری نظارت الکترونیک در عصر اینترنت است.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>دانشگاه‌های خودمختار نقش پیشگام در گسترش تفکر انتقادی و ارتقای سطح پژوهش‌های دانشگاهی دارند.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>برنامه‌ریزی استراتژیک در بخش کشاورزی امنیت غذایی کشور را در برابر خشکسالی‌های موسمی تضمین می‌نماید.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  testDocxZip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
  const docxBuffer = testDocxZip.toBuffer();

  const sessionId = 'test-session-quality-' + Date.now();
  const uploadRes = await httpUploadFile(
    `${BASE_URL}/api/documents/upload`,
    docxBuffer,
    'persian_law_entities.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sessionId
  );

  assert.strictEqual(uploadRes.statusCode, 201, `Upload failed: ${JSON.stringify(uploadRes.body)}`);
  assert(uploadRes.body.id, 'Uploaded document must return an ID');
  const docId = uploadRes.body.id;

  // Verify that chunks do NOT contain literal &#x628;
  const docRes = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
    document_id: docId,
    session_id: sessionId,
    title: 'آزمون حقوق اساسی',
    subject: 'حقوق و مردم‌سالاری',
    grade_level: 'دانشگاهی',
    institution: 'دانشکده حقوق',
    teacher_name: 'استاد رحیمی',
    duration_minutes: 60,
    groups_count: 2,
    question_types_config: {
      mcq: 1,
      true_false: 1,
      short_answer: 1,
      essay: 1,
    },
    difficulty_distribution: { easy: 30, medium: 40, hard: 30 },
  }, null, sessionId);

  assert.strictEqual(docRes.statusCode, 201, `Exam generation failed: ${JSON.stringify(docRes.body)}`);
  const exam = docRes.body;
  assert(exam && exam.groups && exam.groups.length === 2, 'Must have generated 2 groups');

  console.log(`Exam generated: ${exam.title} (${exam.groups.length} groups, ${exam.questions_count} questions)`);

  for (const group of exam.groups) {
    console.log(`\nValidating questions in ${group.group_name}:`);
    for (const q of group.questions) {
      console.log(`  [${q.question_type}] ${q.question_text.slice(0, 60)}...`);

      // 1. Check no literal hex/decimal XML entities appear in question text, options, or answer
      assert(!q.question_text.includes('&#x'), `Question text contains literal XML entity: ${q.question_text}`);
      assert(!q.question_text.includes('&#15'), `Question text contains literal decimal entity: ${q.question_text}`);
      assert(!q.correct_answer.includes('&#x'), `Correct answer contains literal XML entity: ${q.correct_answer}`);

      // 2. Check no question topic is purely «همچنین» or «بنابراین»
      assert(!q.question_text.includes('«همچنین»'), `Question topic contaminated with «همچنین»: ${q.question_text}`);
      assert(!q.question_text.includes('«بنابراین»'), `Question topic contaminated with «بنابراین»: ${q.question_text}`);
      assert(!q.question_text.includes('«در نتیجه»'), `Question topic contaminated with «در نتیجه»: ${q.question_text}`);

      // 3. For MCQ: check that options do NOT have trailing '...' truncation
      if (q.question_type === 'mcq') {
        assert(Array.isArray(q.options) && q.options.length === 4, 'MCQ must have 4 options');
        for (const opt of q.options) {
          assert(!opt.endsWith('...'), `MCQ option has trailing truncation ellipses: "${opt}"`);
          assert(!opt.includes('&#x'), `Option contains literal XML entity: ${opt}`);
        }
        assert(!q.correct_answer.endsWith('...'), `Correct answer has trailing truncation ellipses: "${q.correct_answer}"`);
      }

      // 4. For True/False: check that statement is a complete proposition ending in proper terminal punctuation
      if (q.question_type === 'true_false') {
        assert(!q.question_text.includes('...'), `True/False stem has truncation ellipses: "${q.question_text}"`);
        assert(/[.!?؛۔]$/.test(q.question_text.trim()), `True/False stem must end in terminal punctuation: "${q.question_text}"`);
        assert(!q.question_text.includes('صحیح یا غلط: بر اساس متن منبع (صفحه 1)، همچنین'), 'True/False retained leading discourse marker');
      }

      // 5. Source grounding check: page and chunk metadata present
      assert(q.source_page === 1, `Source page must be 1, got ${q.source_page}`);
      assert(q.source_evidence && q.source_evidence.length > 10, 'Source evidence must be present');
    }
  }

  console.log('\n✓ [4] End-to-End DOCX ingestion & exam generation quality passed.');

  // =========================================================================
  // 5. Single Question Regeneration Quality Check
  // =========================================================================
  console.log('\n[5] Testing single question regeneration...');
  const targetQ = exam.groups[0].questions[0];
  const regenRes = await httpPostJson(
    `${BASE_URL}/api/exams/${exam.id}/questions/${targetQ.id}/regenerate`,
    {
      instruction: 'تمرکز بر مفاهیم تفکیک قوا و عدالت',
    },
    null,
    sessionId
  );

  assert.strictEqual(regenRes.statusCode, 200, `Regeneration failed: ${JSON.stringify(regenRes.body)}`);
  const regeneratedQ = regenRes.body;
  assert(regeneratedQ.id === targetQ.id, 'Regenerated question must retain same ID');
  assert(!regeneratedQ.question_text.includes('&#x'), 'Regenerated text must not have literal XML entities');
  assert(!regeneratedQ.question_text.includes('«همچنین»'), 'Regenerated question must not have «همچنین» as topic');
  if (regeneratedQ.options) {
    for (const opt of regeneratedQ.options) {
      assert(!opt.endsWith('...'), `Regenerated option has trailing ellipses: ${opt}`);
    }
  }
  console.log('✓ [5] Single question regeneration quality passed.');

  console.log('\n======================================================');
  console.log('ALL DARI/PERSIAN QUALITY AND ENTITY FIXES VERIFIED OK!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Quality and entity test failure:', err);
  process.exit(1);
});
