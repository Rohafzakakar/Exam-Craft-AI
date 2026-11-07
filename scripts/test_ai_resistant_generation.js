import assert from 'node:assert';
import AdmZip from 'adm-zip';

const PORT = process.env.TEST_PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log(`Starting AI-Resistant Question Generation Test Suite against ${BASE_URL}...`);

  // 1. Seed exam protection test
  console.log('\n--- Test 1: Seed Exam Protection ---');
  const seedDraftRes = await fetch(`${BASE_URL}/api/exams/exam-cell-bio-midterm/generate-ai-resistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.strictEqual(seedDraftRes.status, 403, 'Seed exam draft generation must return 403 Forbidden');
  console.log('✓ Seed exam generate-ai-resistant is protected with 403 Forbidden');

  const seedApplyRes = await fetch(`${BASE_URL}/api/exams/exam-cell-bio-midterm/apply-ai-resistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft_groups: [] }),
  });
  assert.strictEqual(seedApplyRes.status, 403, 'Seed exam apply must return 403 Forbidden');
  console.log('✓ Seed exam apply-ai-resistant is protected with 403 Forbidden');

  // 2. Teacher Registration and Document Upload
  console.log('\n--- Test 2: Teacher Exam Creation & AI-Resistant Draft Generation ---');
  const teacherEmail = `air_teacher_${Date.now()}@university.edu`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Dr. Analytical Faculty',
      institution: 'Academic Institute',
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Teacher registration failed');
  const teacherData = await regRes.json();
  const teacherToken = teacherData.token;
  console.log('✓ Teacher registered successfully');

  // Create an examination
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      document_id: 'doc-cell-biology-101',
      title: 'Advanced Cell Biology',
      subject: 'Bioenergetics & Cytology',
      groups_count: 2,
      question_types_config: { mcq: 2, true_false: 1, short_answer: 1 },
      difficulty_distribution: { easy: 20, medium: 50, hard: 30 },
      bloom_enabled: true,
    }),
  });
  assert.strictEqual(genRes.status, 201, 'Exam generation failed');
  const originalExam = await genRes.json();
  console.log(`✓ Original exam created with ${originalExam.groups.length} groups and ${originalExam.questions_count} questions`);

  const originalQ1Text = originalExam.groups[0].questions[0].question_text;

  // 3. Authorization Isolation: An unauthorized guest or different teacher cannot access this exam's draft or apply
  console.log('\n--- Test 3: Ownership Authorization Isolation ---');
  const unauthorizedGuestId = `unauth-guest-${Date.now()}`;
  const unauthRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Session-ID': unauthorizedGuestId,
    },
  });
  assert.strictEqual(unauthRes.status, 403, 'Unauthorized guest must be rejected with 403');
  console.log('✓ Unauthorized guest denied with 403 Forbidden');

  // 4. Generate AI-Resistant Draft (Non-destructive preview)
  console.log('\n--- Test 4: Generate AI-Resistant Draft (Preview Step) ---');
  const draftRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
  });
  assert.strictEqual(draftRes.status, 200, 'Draft generation must succeed');
  const draftData = await draftRes.json();
  assert(Array.isArray(draftData.draft_groups), 'draft_groups must be an array');
  assert.strictEqual(draftData.draft_groups.length, 2, 'Must have 2 groups matching original exam');
  assert.strictEqual(draftData.draft_groups[0].questions.length, 4, 'Must have 4 questions matching original group quota');

  const draftQ1 = draftData.draft_groups[0].questions[0];
  console.log(`Draft Q1 Type: ${draftQ1.question_type}, Marks: ${draftQ1.marks}, Bloom: ${draftQ1.bloom_level}`);
  console.log(`Draft Q1 Stem: "${draftQ1.question_text}"`);
  assert(draftQ1.source_page > 0, 'Source page must be set');
  assert(draftQ1.source_evidence && draftQ1.source_evidence.length > 0, 'Source evidence must be present');
  if (draftQ1.question_type === 'mcq') {
    assert.strictEqual(draftQ1.options.length, 4, 'MCQ must have 4 options');
    assert(draftQ1.options.includes(draftQ1.correct_answer), 'Options must include correct answer');
  }

  // Verify SQLite database exam was NOT modified yet!
  const checkDbRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const dbExamBeforeApply = await checkDbRes.json();
  assert.strictEqual(
    dbExamBeforeApply.groups[0].questions[0].question_text,
    originalQ1Text,
    'Database exam MUST remain untouched before explicit apply'
  );
  console.log('✓ Verified: Draft generation did NOT overwrite database questions prematurely');

  // 5. Apply AI-Resistant Questions
  console.log('\n--- Test 5: Apply & Replace Exam Questions ---');
  const applyRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}/apply-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({ draft_groups: draftData.draft_groups }),
  });
  assert.strictEqual(applyRes.status, 200, 'Apply AI-resistant questions must succeed');
  const applyResult = await applyRes.json();
  assert.strictEqual(applyResult.success, true, 'Result success must be true');
  assert(applyResult.exam, 'Result must contain updated exam');
  console.log('✓ Successfully applied AI-resistant questions');

  // Check updated exam from database
  const checkUpdatedRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const updatedExamInDb = await checkUpdatedRes.json();
  assert.strictEqual(
    updatedExamInDb.groups[0].questions[0].question_text,
    draftQ1.question_text,
    'Database exam now reflects the confirmed AI-resistant questions'
  );
  console.log('✓ Verified: Updated exam questions properly persisted to SQLite database');

  // Check answer keys
  const akRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}/answer-key`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  assert.strictEqual(akRes.status, 200);
  const answerKeys = await akRes.json();
  assert.strictEqual(answerKeys.length, 2, 'Must have answer keys for both groups');
  assert.strictEqual(answerKeys[0].items[0].correct_answer, draftQ1.correct_answer, 'Answer key synchronized with replaced questions');
  console.log('✓ Verified: Answer keys synchronized with replaced questions');

  // 6. Persian / RTL Document and Exam AI-Resistant Generation
  console.log('\n--- Test 6: Persian RTL Document and AI-Resistant Generation ---');
  const zip = new AdmZip();
  const paragraphs = [
    'تفکیک قوای سه‌گانه مانع از تمرکز قدرت و استبداد فردی در اداره حکومت می‌گردد.',
    'حاکمیت قانون تضمین‌کننده عدالت اجتماعی و برابری همگان در برابر قانون است.',
    'استقلال دستگاه قضایی اعتماد عمومی به نظام عدالت را تحکیم می‌بخشد.',
    'سند پکن بر آموزش همگانی و ارتقای سواد حقوقی به عنوان راهبردهای کلیدی توانمندسازی تأکید می‌ورزد.',
    'توسعه سیاسی پایدار بدون تضمین مشارکت فعال و برابر اقشار مختلف جامعه امکان‌پذیر نخواهد بود.',
    'نهادهای مدنی مستقل به عنوان پل ارتباطی میان دولت و شهروندان عمل می‌کنند.',
    'انتخابات دوره‌ای و شفاف شاخصه اصلی پویایی نظام‌های دموکراتیک است.',
    'صیانت از حقوق شهروندی در تمامی مراحل دادرسی قضایی الزامی است.',
    'برابری فرصت‌های شغلی و آموزشی بنیان‌های عدالت اجتماعی را استوار می‌سازد.',
    'نظارت همگانی بر عملکرد نهادهای عمومی از فساد ساختاری جلوگیری به عمل می‌آورد.',
  ];
  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>`;
  for (const p of paragraphs) {
    docXml += `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`;
  }
  docXml += `</w:body></w:document>`;
  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf8'));
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`, 'utf8')
  );
  zip.addFile(
    '_rels/.rels',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`, 'utf8')
  );
  const docxBuf = zip.toBuffer();

  const formData = new FormData();
  formData.append('file', new Blob([docxBuf], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'Political_Science_Principles.docx');

  const uploadRes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherToken}` },
    body: formData,
  });
  assert.strictEqual(uploadRes.status, 201, 'Document upload must succeed');
  const uploadedDoc = await uploadRes.json();
  const faDocId = uploadedDoc.id;

  // Generate Persian exam directly
  const faGenRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      document_id: faDocId,
      title: 'آزمون علوم سیاسی و مبانی مردم‌سالاری',
      subject: 'علوم سیاسی',
      language: 'fa',
      is_rtl: true,
      groups_count: 2,
      question_types_config: { mcq: 1, true_false: 1, short_answer: 1 },
      bloom_enabled: true,
    }),
  });
  if (faGenRes.status !== 201) {
    console.error('faGenRes error:', await faGenRes.text());
  }
  assert.strictEqual(faGenRes.status, 201);
  const faExam = await faGenRes.json();

  const faDraftRes = await fetch(`${BASE_URL}/api/exams/${faExam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
  });
  assert.strictEqual(faDraftRes.status, 200);
  const faDraftData = await faDraftRes.json();
  assert(faDraftData.draft_groups.length === 2);
  const faQ1 = faDraftData.draft_groups[0].questions[0];
  console.log(`Persian Draft Q1 Stem: "${faQ1.question_text}"`);
  assert(!faQ1.question_text.includes('طبق تحلیل ارائه‌شده در متن منبع'), 'Must not contain boilerplate RAG text');
  assert(!faQ1.question_text.includes('با استناد به مباحث مندرج در صفحه'), 'Must not contain boilerplate RAG text');
  assert(faQ1.source_page === 1 || faQ1.source_page === 2, 'Must cite source page');
  assert(faQ1.source_evidence.length > 0, 'Must include source evidence');
  console.log('✓ Verified: Persian AI-Resistant questions generated cleanly with high-order academic stems and source grounding');

  console.log('\n======================================================');
  console.log('ALL AI-RESISTANT QUESTION GENERATION TESTS PASSED 100%');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
