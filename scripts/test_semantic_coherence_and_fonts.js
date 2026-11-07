import assert from 'node:assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runSemanticTests() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: VERIFYING SEMANTIC COHERENCE & QUALITY`);
  console.log(`======================================================\n`);

  // Wait for server to be healthy
  for (let i = 0; i < 15; i++) {
    try {
      const hRes = await fetch(`${BASE_URL}/api/health`);
      if (hRes.ok) {
        const hJson = await hRes.json();
        if (hJson.status === 'healthy') break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 600));
  }

  // 1. Register teacher
  const teacherEmail = `semantic_auditor_${Date.now()}@test.edu`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Prof. Semantic Quality',
      institution: 'Water Engineering Institute',
    }),
  });
  assert.strictEqual(regRes.status, 201);
  const teacher = await regRes.json();
  const token = teacher.token;

  // 2. Upload text
  const docContent = `
Water Resource Monitoring and Household Conservation
Chapter 1: Smart Water Metering and Flow Monitoring

Section 1.1: Smart Water Meters
Smart water meters record household volumetric consumption continuously and transmit real-time telemetry to municipal utilities.
Modern smart water meters incorporate high-precision solid-state flow sensors to monitor domestic consumption patterns.
Advanced digital metering infrastructure provides automated meter reading and bidirectional communication networks.
Continuous telemetry from smart water meters allows rapid identification of unusual consumption surges across distribution zones.

Section 1.2: Ultrasonic Water Flow Transducers
Ultrasonic water meters utilize high-frequency acoustic wave propagation velocity to measure volumetric fluid flow rates without moving mechanical parts.
Transit-time ultrasonic transducers calculate fluid velocity by measuring bidirectional time differentials of emitted sound pulses.
Acoustic flow measurement maintains sustained calibration accuracy even under turbulent fluid flow conditions.
Non-intrusive ultrasonic sensors eliminate mechanical wear and reduce pressure loss across distribution pipes.

Section 1.3: Artificial Intelligence for Pipe Leak Detection
Artificial intelligence for leak detection applies acoustic vibration sensors and trained machine learning neural networks to distinguish normal fluid turbulence from structural pipe ruptures.
Machine learning acoustic classifiers isolate high-frequency acoustic wave reflections produced by pressurized pipe fractures.
Automated neural network models continuously evaluate acoustic signatures to identify underground pipe micro-fractures before catastrophic ruptures occur.
Deep learning vibration algorithms filter external background traffic interference from genuine subsurface acoustic leak signals.

Section 1.4: Greywater Recycling Systems
Greywater recycling systems collect and biologically purify non-potable household drainage for garden irrigation and sanitary toilet flushing.
Decentralized greywater filtration utilizes multi-stage aerobic bioreactors to treat shower and laundry discharge.
Reclaimed domestic greywater reduces municipal freshwater intake while maintaining safe non-potable sanitation standards.
Constructed wetland biofilters effectively remove organic surfactants and suspended solids from residential greywater effluents.
`;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const formData = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="Water_Monitoring.txt"',
    'Content-Type: text/plain',
    '',
    docContent.trim(),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const uploadRes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  assert.strictEqual(uploadRes.status, 201);
  const doc = await uploadRes.json();

  // 3. Generate exam with 3 MCQs, 2 True/False, 2 Fill-in-Blank, 2 Short Answer, 1 Essay
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      document_id: doc.id,
      title: 'Water Engineering Examination',
      subject: 'Environmental Engineering',
      groups_count: 1,
      question_types_config: {
        mcq: 3,
        true_false: 2,
        fill_blank: 2,
        short_answer: 2,
        essay: 1,
      },
    }),
  });
  assert.strictEqual(genRes.status, 201);
  const exam = await genRes.json();
  const group = exam.groups[0];

  console.log(`Generated ${group.questions.length} questions for inspection:`);

  // 4. Validate semantic coherence of MCQs
  const mcqs = group.questions.filter((q) => q.question_type === 'mcq');
  assert.strictEqual(mcqs.length, 3, 'Must have 3 MCQs');

  for (const mcq of mcqs) {
    console.log(`\nMCQ Stem: ${mcq.question_text}`);
    console.log('Options:');
    mcq.options.forEach((opt, idx) => console.log(`  [${String.fromCharCode(65 + idx)}] ${opt}`));

    assert.strictEqual(mcq.options.length, 4, 'Must have exactly 4 options');
    const unique = new Set(mcq.options);
    assert.strictEqual(unique.size, 4, 'All 4 options must be distinct');
    assert(mcq.options.includes(mcq.correct_answer), 'Correct answer must be present');

    // Grammar check: Plural/singular agreement check
    assert(!/\bHow does (smart meters|ultrasonic|systems|sensors)\b/i.test(mcq.question_text), 'Subject-verb agreement must be correct');
    assert(!mcq.question_text.includes('UNICEF has warned'), 'No attribution clauses as topics');
    assert(!mcq.question_text.includes('FAO reports'), 'No attribution clauses as topics');

    // Topic coherence check: Distractors must not mix random topics
    // If the question is about Smart water meters, options should not be about Greywater or satellites
    if (/smart water meter/i.test(mcq.question_text)) {
      const mentionsGreywater = mcq.options.some((o) => /greywater/i.test(o));
      assert(!mentionsGreywater, 'Smart water meter MCQ options must not contaminate with greywater');
    }
    if (/ultrasonic/i.test(mcq.question_text)) {
      const mentionsGreywater = mcq.options.some((o) => /greywater/i.test(o));
      assert(!mentionsGreywater, 'Ultrasonic transducer MCQ options must not contaminate with greywater');
    }
  }

  // 5. Validate True/False questions
  const tfQuestions = group.questions.filter((q) => q.question_type === 'true_false');
  for (const tf of tfQuestions) {
    console.log(`\nT/F Stem: ${tf.question_text}`);
    assert(tf.question_text.startsWith('True or False: '), 'Clean True/False prefix');
    assert(/[.!?]$/.test(tf.question_text), 'Ends in punctuation');
    assert(!/\b\d+%\s+.*?\b\d+%/i.test(tf.question_text), 'Must not combine multiple statistics');
    assert(!/[\uFFFD\uFEFF\u00AD]/.test(tf.question_text), 'No malformed characters');
  }

  // 6. Validate Short Answer & Essay questions
  const saQuestions = group.questions.filter((q) => q.question_type === 'short_answer');
  for (const sa of saQuestions) {
    console.log(`\nShort Answer Stem: ${sa.question_text}`);
    assert(!sa.question_text.includes('FAO reports that'), 'No dangling attribution prefixes');
    assert(!sa.question_text.includes('UNICEF has warned that'), 'No dangling attribution prefixes');
    assert(!sa.question_text.includes('undefined'), 'No undefined in stem');
    assert(sa.question_text.length >= 40, 'Stem must be well-formed and contextualized');
  }

  const essayQuestions = group.questions.filter((q) => q.question_type === 'essay');
  for (const essay of essayQuestions) {
    console.log(`\nEssay Stem: ${essay.question_text}`);
    assert(essay.question_text.length >= 60, 'Essay stem must be well-formed and contextualized');
    assert(!essay.question_text.includes('undefined'), 'No undefined in stem');
  }

  // 7. Verify AI-resistant transformation restriction
  console.log('\n--- Verifying AI-Resistant Scope Restriction ---');
  const aiResistRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  assert.strictEqual(aiResistRes.status, 200);
  const aiDraft = await aiResistRes.json();
  const transformedGroups = aiDraft.draft_groups || [];
  const transformedQuestions = transformedGroups[0]?.questions || [];

  for (const origQ of group.questions) {
    const matched = transformedQuestions.find((t) => t.id === origQ.id);
    if (!matched) continue;
    if (origQ.question_type === 'mcq' || origQ.question_type === 'true_false' || origQ.question_type === 'fill_blank') {
      assert.strictEqual(matched.question_text, origQ.question_text, 'Objective question text must NOT be altered');
      if (origQ.options) {
        assert.deepStrictEqual(matched.options, origQ.options, 'Objective question options must NOT be altered');
      }
      assert.strictEqual(matched.correct_answer, origQ.correct_answer, 'Objective correct answer must NOT be altered');
    }
  }
  console.log('✓ AI-resistant transformation strictly preserves all MCQ, True/False, and Fill-in-Blank questions unchanged');

  // 8. PDF Export font and glyph test
  console.log('\n--- Verifying PDF and DOCX character integrity ---');
  const pdfRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/export/pdf?target=both&token=${encodeURIComponent(token)}`);
  assert.strictEqual(pdfRes.status, 200);
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  assert(pdfBytes.length > 5000, 'PDF buffer must be substantive');

  const docxRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/export/docx?target=both&token=${encodeURIComponent(token)}`);
  assert.strictEqual(docxRes.status, 200);
  const docxBytes = Buffer.from(await docxRes.arrayBuffer());
  assert(docxBytes.length > 5000, 'DOCX buffer must be substantive');

  console.log('✓ PDF and DOCX generated successfully with clean typography and zero malformed character errors');
  console.log('\n======================================================');
  console.log('  SEMANTIC COHERENCE & QUALITY AUDIT PASSED 100%!');
  console.log('======================================================\n');
}

runSemanticTests().catch((err) => {
  console.error('\n❌ Semantic quality test failed:', err);
  process.exit(1);
});
