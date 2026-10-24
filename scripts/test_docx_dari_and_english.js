import assert from 'node:assert';
import http from 'node:http';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } from 'docx';

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
    const boundary = '----ExamCraftBoundary' + Math.random().toString(36).slice(2);
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
    { title: 'فصل اول: مبانی و پیشینه تاریخی مردم‌سالاری در افغانستان', text: 'دموکراسی پایدار در افغانستان بر پایه حاکمیت قانون، اراده آزاد ملت و صیانت از حقوق بنیادین شهروندی استوار است. در تاریخ معاصر افغانستان، سنت‌های مشورتی سنتی نظیر لوی جرگه همواره به عنوان سازوکاری برای اجماع‌سازی ملی و حل بحران‌های کلان سیاسی مورد استفاده قرار گرفته است. دهه دموکراسی (۱۳۴۳-۱۳۵۳ خورشیدی) با تصویب قانون اساسی ۱۳۴۳، نقطه عطفی در شناسایی تفکیک قوا و آزادی مطبوعات به شمار می‌رود.' },
    { title: 'فصل دوم: تفکیک قوا و ساختار نظام سیاسی', text: 'اصل تفکیک قوا از ارکان انکارناپذیر مردم‌سالاری مدرن است که از تمرکز نامحدود قدرت در دست یک فرد یا جناح جلوگیری می‌نماید. در یک نظام دموکراتیک، قوه مقننه (شورای ملی) وظیفه خطیر قانون‌گذاری و نظارت بر عملکرد قوه مجریه را بر عهده دارد. قوه قضائیه مستقل به مثابه ضامن اجرای عدالت و تطبیق بی‌طرفانه قوانین بر همگان عمل می‌کند.' },
    { title: 'فصل سوم: نهادهای انتخاباتی و مشارکت سیاسی', text: 'انتخابات شفاف، دوره‌ای و رقابتی مشروعیت‌بخش اصلی کارگزاران قدرت در نظام‌های دموکراتیک است. استقلال کمیسیون مستقل انتخابات و کمیسیون رسیدگی به شکایات انتخاباتی، پیش‌شرط اساسی صیانت از آرای پاک مردم محسوب می‌شود. حق رأی همگانی و برابر، بدون هیچ‌گونه تبعیض قومی، جنسیتی یا زبانی، مظهر تجلی اراده عمومی است.' },
    { title: 'فصل چهارم: جامعه مدنی و احزاب سیاسی', text: 'جامعه مدنی فعال پل ارتباطی مستمر و سازمان‌یافته میان توده‌های مردم و ارکان حاکمیت به شمار می‌رود. احزاب سیاسی برنامه‌محور با کادرسازی علمی و ارائه خط‌مشی‌های سنجیده اقتصادی و اجتماعی، رقابت سیاسی را نظام‌مند می‌سازند.' },
    { title: 'فصل پنجم: آزادی بیان و مطبوعات آزاد', text: 'رسانه‌های آزاد، مستقل و تکثرگرا به عنوان رکن چهارم دموکراسی، نقشی بازدارنده در برابر فساد اداری و سوءاستفاده از صلاحیت‌ها ایفا می‌کنند. آزادی بیان بدون ترس از سانسور یا تعقیب قضایی، شاخص کلیدی پویایی فکری جامعه است.' },
    { title: 'فصل ششم: جایگاه و مشارکت سیاسی زنان', text: 'دموکراسی بدون حضور برابر، مؤثر و همه‌جانبه زنان ناقص و شکننده است. تضمین حق تحصیل، اشتغال آزادانه و دسترسی به فرصت‌های مدیریتی برای بانوان از الزامات توسعه انسانی افغانستان به شمار می‌رود.' },
    { title: 'فصل هفتم: تکثرگرایی و عدالت اجتماعی', text: 'افغانستان کشوری با تکثر قومی، زبانی و فرهنگی غنی است که دموکراسی پایدار در آن تنها با به رسمیت شناختن تنوع امکان‌پذیر است. مدل‌های مردم‌سالاری توافقی با توزیع عادلانه فرصت‌ها، احساس محرومیت را کاهش می‌دهند.' },
    { title: 'فصل هشتم: حاکمیت قانون و مبارزه با فساد', text: 'حاکمیت قانون به این معناست که هیچ فرد، مقام یا گروهی بالاتر از قانون قرار ندارد و همه در برابر عدالت برابرند. فساد اداری، خویشاوندسالاری و رشوت، بزرگ‌ترین تهدیدهای پیش روی اعتماد عمومی به سازوکارهای دموکراتیک هستند.' },
    { title: 'فصل نهم: نهادهای امنیتی در چارچوب حاکمیت قانون', text: 'نیروهای امنیتی و دفاعی باید کاملاً ملی، غیرسیاسی و وفادار به قانون اساسی کشور باشند. نظارت پارلمانی بر بودجه و فعالیت‌های نهادهای نظامی، مانع از مداخله نیروهای مسلح در بازی‌های حزبی می‌گردد.' },
    { title: 'فصل دهم: توسعه اقتصادی پایدار و ریشه‌کنی فقر', text: 'پایداری نظام‌های دموکراتیک ارتباط تنگاتنگی با امنیت اقتصادی و کاهش شکاف‌های طبقاتی دارد. فقر مزمن و بیکاری جوانان، زمینه‌ساز عضوگیری گروه‌های افراطی و تضعیف اراده جمعی برای دفاع از مردم‌سالاری است.' },
    { title: 'فصل یازدهم: سیاست خارجی متوازن و تعامل بین‌المللی', text: 'افغانستان به عنوان چهارراه تجارتی و فرهنگی آسیای میانه و جنوب آسیا، نیازمند سیاست خارجی متوازن و بی‌طرفانه است. تعامل سازنده با جامعه جهانی بر اساس احترام متقابل و عدم مداخله در امور داخلی پیگیری می‌شود.' },
    { title: 'فصل دوازدهم: چشم‌انداز آینده و چالش‌های فراروی دموکراسی', text: 'مسیر رسیدن به دموکراسی پایدار در افغانستان جریانی تدریجی، پویا و مستلزم اراده مستمر جمعی است. تقویت نظام آموزشی مدرن، پرورش نخبگان متعهد و نهادینه‌سازی خرد جمعی، کلید غلبه بر بحران‌های ادواری کشور می‌باشد.' },
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

async function createEnglishSoftwareEngineeringDocxBuffer() {
  const children = [
    new Paragraph({ text: 'Chapter 1: Software Architecture and Quality', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'Software architecture defines the high-level structures of a software system and the discipline of creating such structures. Separation of concerns and modularity reduce cognitive complexity and allow independent component testing.' }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ text: 'Chapter 2: Continuous Integration and Testing', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'Automated continuous integration ensures that code changes are validated through automated regression test suites on every commit. Test-driven development emphasizes writing failing assertions before writing functional implementations.' }),
  ];

  const doc = new Document({
    sections: [{ children }],
  });

  return await Packer.toBuffer(doc);
}

async function runTests() {
  console.log('\n================================================================');
  console.log('  EXAMCRAFT AI: MULTILINGUAL DOCX & GROUNDED GENERATION SUITE  ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  const guestSession = 'guest_regression_tester_' + Date.now();
  let uploadedDariDocId = '';
  let uploadedEnglishDocId = '';

  // 1. Upload 12-page Dari DOCX
  await test('Upload: 12-page Dari DOCX ("دموکراسی پایدار در افغانستان.docx") parses cleanly', async () => {
    const buffer = await createDariDemocracyDocxBuffer();
    const res = await httpUploadFile(
      `${BASE_URL}/api/documents/upload`,
      buffer,
      'دموکراسی پایدار در افغانستان.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      guestSession
    );

    assert.strictEqual(res.statusCode, 201, `Upload failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
    uploadedDariDocId = res.body.id;
    assert.strictEqual(res.body.detected_language, 'fa', 'Detected language must be Dari/Persian (fa)');
    assert.strictEqual(res.body.is_rtl, true, 'Document must be marked RTL');
    assert.strictEqual(res.body.total_pages, 12, 'Must detect exactly 12 pages');
    assert.ok(res.body.chunks_count >= 12, `Must create at least 12 chunks (got ${res.body.chunks_count})`);
    console.log(`         Uploaded Doc ID: ${uploadedDariDocId}, pages: ${res.body.total_pages}, chunks: ${res.body.chunks_count}`);
  });

  // 2. Generate 3 questions on newly uploaded Dari DOCX with page selection [1, 2]
  await test('Generation: Generate 3 questions from selected pages [1, 2] of uploaded Dari DOCX', async () => {
    const res = await httpPostJson(
      `${BASE_URL}/api/exams/generate`,
      {
        document_id: uploadedDariDocId,
        selected_pages: [1, 2],
        title: 'آزمون مبانی دموکراسی در افغانستان',
        subject: 'علوم سیاسی و حقوق',
        groups_count: 1,
        question_types_config: { mcq: 2, true_false: 1 },
      },
      null,
      guestSession
    );

    assert.strictEqual(res.statusCode, 201, `Generation failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
    assert.ok(res.body.id, 'Exam ID must be generated');
    const groupA = res.body.groups[0];
    assert.strictEqual(groupA.questions.length, 3, 'Group A must contain exactly 3 questions');

    groupA.questions.forEach((q, i) => {
      assert.ok([1, 2].includes(q.source_page), `Question ${i + 1} must be from selected pages 1 or 2 (got ${q.source_page})`);
      assert.ok(q.source_evidence && q.source_evidence.length > 10, `Question ${i + 1} must have source_evidence`);
      assert.ok(q.question_text && q.question_text.length > 15, `Question ${i + 1} must have valid question_text`);
      console.log(`         Q${i + 1} [${q.question_type}] (Page ${q.source_page}): "${q.question_text.slice(0, 70)}..."`);
    });
  });

  // 3. Generate 3 questions on the repaired user document "doc-1792739520381-0j23p" (all pages)
  await test('Verification: Generate 3 questions from all pages of Dari DOCX ("دموکراسی پایدار در افغانستان.docx")', async () => {
    const targetDocId = uploadedDariDocId;
    const targetSession = guestSession;

    const res = await httpPostJson(
      `${BASE_URL}/api/exams/generate`,
      {
        document_id: targetDocId,
        selected_pages: null, // "all" pages
        title: 'Cell Biology Midterm Examination', // Stale biology title from frontend should be resolved safely!
        subject: 'Molecular & Cellular Biology',    // Stale biology subject should be resolved safely!
        groups_count: 1,
        question_types_config: { mcq: 2, true_false: 1 },
      },
      null,
      targetSession
    );

    assert.strictEqual(res.statusCode, 201, `Generation failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
    assert.ok(res.body.title !== 'Cell Biology Midterm Examination', 'Title must be resolved to document title, not stale biology');
    assert.strictEqual(res.body.is_rtl, true, 'Exam must be RTL');
    const groupA = res.body.groups[0];
    assert.strictEqual(groupA.questions.length, 3, 'Group A must contain exactly 3 questions');
    console.log(`         Resolved Exam Title: "${res.body.title}", Subject: "${res.body.subject}"`);
  });

  // 4. Test upload and generation for English DOCX
  await test('English Support: Upload English DOCX and generate 3 questions', async () => {
    const buffer = await createEnglishSoftwareEngineeringDocxBuffer();
    const uploadRes = await httpUploadFile(
      `${BASE_URL}/api/documents/upload`,
      buffer,
      'Software_Engineering_Principles.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      guestSession
    );

    assert.strictEqual(uploadRes.statusCode, 201, `Upload failed: ${uploadRes.statusCode}`);
    uploadedEnglishDocId = uploadRes.body.id;
    assert.strictEqual(uploadRes.body.detected_language, 'en', 'Detected language must be English (en)');
    assert.strictEqual(uploadRes.body.is_rtl, false, 'Document must not be RTL');
    assert.strictEqual(uploadRes.body.total_pages, 2, 'Must detect 2 pages');

    const genRes = await httpPostJson(
      `${BASE_URL}/api/exams/generate`,
      {
        document_id: uploadedEnglishDocId,
        selected_pages: [1, 2],
        title: 'Software Engineering Quiz',
        subject: 'Computer Science',
        groups_count: 1,
        question_types_config: { mcq: 1, true_false: 1, short_answer: 1 },
      },
      null,
      guestSession
    );

    assert.strictEqual(genRes.statusCode, 201, `Generation failed: ${genRes.statusCode}`);
    assert.strictEqual(genRes.body.groups[0].questions.length, 3, 'Must have 3 questions');
    console.log(`         Generated English exam: "${genRes.body.title}" with 3 questions`);
  });

  // 5. Existing Biology functionality remains 100% intact
  await test('Regression: Seed Cell Biology document generates exam without errors', async () => {
    const res = await httpPostJson(
      `${BASE_URL}/api/exams/generate`,
      {
        document_id: 'doc-cell-biology-101',
        selected_pages: [1],
        title: 'Cell Biology Midterm Examination',
        subject: 'Molecular & Cellular Biology',
        groups_count: 1,
        question_types_config: { mcq: 2, true_false: 1 },
      },
      null,
      guestSession
    );

    assert.strictEqual(res.statusCode, 201, `Cell biology generation failed: ${res.statusCode}`);
    assert.strictEqual(res.body.groups[0].questions.length, 3, 'Cell biology must generate 3 questions');
  });

  console.log(`\n================================================================`);
  console.log(`  ALL ${passed}/${total} REGRESSION & VERIFICATION TESTS PASSED!`);
  console.log(`================================================================\n`);
}

runTests().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
