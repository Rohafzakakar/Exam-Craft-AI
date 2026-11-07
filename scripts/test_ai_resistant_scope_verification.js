import assert from 'node:assert';

const PORT = process.env.TEST_PORT || process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runScopeVerificationTests() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: AI-RESISTANT SCOPE RESTRICTION TESTS  `);
  console.log(`======================================================\n`);

  // 1. Register teacher
  const teacherEmail = `scope_teacher_${Date.now()}@university.edu`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Dr. Scope Verification',
      institution: 'ExamCraft Academic Board',
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Registration failed');
  const { token } = await regRes.json();
  console.log('✓ Teacher registered successfully');

  // 2. Generate exam with all 5 question types: mcq, true_false, fill_blank, short_answer, essay
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      document_id: 'doc-cell-biology-101',
      title: 'Comprehensive Cell Biology Assessment',
      subject: 'Cytology and Genetics',
      groups_count: 2,
      question_types_config: {
        mcq: 1,
        true_false: 1,
        fill_blank: 1,
        short_answer: 1,
        essay: 1,
      },
      difficulty_distribution: { easy: 20, medium: 50, hard: 30 },
      bloom_enabled: true,
    }),
  });
  assert.strictEqual(genRes.status, 201, 'Exam generation failed');
  const originalExam = await genRes.json();
  console.log(`✓ Original exam created with ${originalExam.groups.length} groups and ${originalExam.questions_count} questions`);

  const groupA = originalExam.groups[0];
  const origMcq = groupA.questions.find((q) => q.question_type === 'mcq');
  const origTf = groupA.questions.find((q) => q.question_type === 'true_false');
  const origFill = groupA.questions.find((q) => q.question_type === 'fill_blank');
  const origSa = groupA.questions.find((q) => q.question_type === 'short_answer');
  const origEssay = groupA.questions.find((q) => q.question_type === 'essay');

  assert(origMcq && origTf && origFill && origSa && origEssay, 'All 5 question types must be present in original exam');

  // 3. Generate AI-Resistant Draft
  console.log('\n--- Generating AI-Resistant Draft ---');
  const draftRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  assert.strictEqual(draftRes.status, 200, 'Draft generation failed');
  const draftData = await draftRes.json();

  const draftGroupA = draftData.draft_groups[0];
  const draftMcq = draftGroupA.questions.find((q) => q.question_type === 'mcq');
  const draftTf = draftGroupA.questions.find((q) => q.question_type === 'true_false');
  const draftFill = draftGroupA.questions.find((q) => q.question_type === 'fill_blank');
  const draftSa = draftGroupA.questions.find((q) => q.question_type === 'short_answer');
  const draftEssay = draftGroupA.questions.find((q) => q.question_type === 'essay');

  // Verification 1: Objective questions remain EXACTLY unchanged
  console.log('\n[Verification 1] Objective questions remain unchanged in draft:');
  assert.strictEqual(draftMcq.question_text, origMcq.question_text, 'MCQ stem must be unchanged');
  assert.deepStrictEqual(draftMcq.options, origMcq.options, 'MCQ options must be unchanged');
  assert.strictEqual(draftMcq.correct_answer, origMcq.correct_answer, 'MCQ correct answer must be unchanged');
  assert.strictEqual(draftMcq.marks, origMcq.marks, 'MCQ marks must be preserved');
  console.log('  ✓ MCQ stem, options, correct answer, and marks strictly preserved');

  assert.strictEqual(draftTf.question_text, origTf.question_text, 'True/False stem must be unchanged');
  assert.deepStrictEqual(draftTf.options, origTf.options, 'True/False options must be unchanged');
  assert.strictEqual(draftTf.correct_answer, origTf.correct_answer, 'True/False answer must be unchanged');
  console.log('  ✓ True/False stem, options, and answer strictly preserved');

  assert.strictEqual(draftFill.question_text, origFill.question_text, 'Fill in blank stem must be unchanged');
  assert.strictEqual(draftFill.correct_answer, origFill.correct_answer, 'Fill in blank answer must be unchanged');
  console.log('  ✓ Fill-in-the-blank stem and answer strictly preserved');

  // Verification 2: Short Answer and Essay ARE transformed
  console.log('\n[Verification 2] Subjective questions are transformed with higher-order prompts:');
  assert.notStrictEqual(draftSa.question_text, origSa.question_text, 'Short answer stem must be transformed');
  assert(draftSa.marks === origSa.marks, 'Short answer marks must match original configured marks');
  console.log(`  ✓ Short Answer transformed: "${draftSa.question_text}"`);

  assert.notStrictEqual(draftEssay.question_text, origEssay.question_text, 'Essay stem must be transformed');
  assert(draftEssay.marks === origEssay.marks, 'Essay marks must match original configured marks');
  console.log(`  ✓ Essay transformed: "${draftEssay.question_text}"`);

  // Verification 3: Database exam is NOT modified before explicit apply
  console.log('\n[Verification 3] Database exam remains untouched before explicit confirmation:');
  const dbBeforeRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dbBefore = await dbBeforeRes.json();
  const dbSaBefore = dbBefore.groups[0].questions.find((q) => q.question_type === 'short_answer');
  assert.strictEqual(dbSaBefore.question_text, origSa.question_text, 'Database SA question must remain original');
  console.log('  ✓ Database question remains original before teacher confirms apply');

  // Verification 4: Explicit apply persists changes
  console.log('\n[Verification 4] Explicit teacher apply persists transformed questions:');
  const applyRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}/apply-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ draft_groups: draftData.draft_groups }),
  });
  assert.strictEqual(applyRes.status, 200, 'Apply failed');

  const dbAfterRes = await fetch(`${BASE_URL}/api/exams/${originalExam.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const dbAfter = await dbAfterRes.json();
  const dbSaAfter = dbAfter.groups[0].questions.find((q) => q.question_type === 'short_answer');
  const dbMcqAfter = dbAfter.groups[0].questions.find((q) => q.question_type === 'mcq');
  assert.strictEqual(dbSaAfter.question_text, draftSa.question_text, 'Database SA now reflects AI-resistant question');
  assert.strictEqual(dbMcqAfter.question_text, origMcq.question_text, 'Database MCQ still reflects original question');
  console.log('  ✓ Database updated: Short Answer transformed while MCQ remained original');

  console.log('\n======================================================');
  console.log('  ALL AI-RESISTANT SCOPE RESTRICTION TESTS PASSED!    ');
  console.log('======================================================\n');
}

runScopeVerificationTests().catch((err) => {
  console.error('\nScope verification failed:', err);
  process.exit(1);
});
