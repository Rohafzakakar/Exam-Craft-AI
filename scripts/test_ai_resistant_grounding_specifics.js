import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runAiResistantGroundingSpecificsTest() {
  console.log(`\n======================================================`);
  console.log(`  AI-RESISTANT GROUNDING & PREVIEW SPECIFIC REGRESSION TEST`);
  console.log(`======================================================\n`);

  // 1. Verify seed exam in SQLite
  const db = new DatabaseSync('./data/examcraft.db', { readOnly: true });
  const row = db.prepare("SELECT id, title FROM exams WHERE id = 'exam-cell-bio-midterm'").get();
  assert(row, 'Saved seed exam must be preserved in SQLite');
  console.log(`✓ Saved examination ${row.id} is preserved`);
  db.close();

  // 2. Register teacher
  const teacherEmail = `ai_grounding_${Date.now()}@edu.af`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Dr. Test Grounding',
      institution: 'Kabul University',
    }),
  });
  assert(regRes.status === 200 || regRes.status === 201, 'Teacher registration must succeed');
  const teacher = await regRes.json();
  const token = teacher.token;

  // 3. Upload document containing the exact two problematic sentences:
  // Sentence A: "An alert is sent to the owner by app, SMS or a local alarm."
  // Sentence B: "Forecasts estimate next week's or next season's demand."
  const docText = `
Smart Household Water Systems and Resource Monitoring
Hamza Safi · Madina Kakar Page
Chapter 1: Smart Sensing Infrastructure
Smart water meters record volumetric water consumption continuously and transmit real-time telemetry to municipal utilities.
Ultrasonic water meters utilize high-frequency acoustic wave propagation velocity to measure fluid flow rates without moving mechanical parts.
An alert is sent to the owner by app, SMS or a local alarm.
Forecasts estimate next week's or next season's demand.
Greywater recycling systems collect non-potable household drainage for toilet flushing and outdoor landscape irrigation.
Drought prevalence rose across arid provinces, requiring urgent conservation measures.
`;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const formData = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="grounding_test_doc.txt"',
    'Content-Type: text/plain',
    '',
    docText.trim(),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const upRes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  assert.strictEqual(upRes.status, 201, 'Document upload must succeed');
  const uploadedDoc = await upRes.json();

  // 4. Generate an exam with 1 MCQ, 1 True/False, 1 Fill in Blank, 1 Short Answer, 1 Essay
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_id: uploadedDoc.id,
      title: 'Water Monitoring Examination',
      subject: 'Hydraulic Monitoring',
      groups_count: 1,
      question_types_config: {
        mcq: 1,
        true_false: 1,
        fill_blank: 1,
        short_answer: 1,
        essay: 1,
      },
      difficulty: 'medium',
      bloom_enabled: true,
    }),
  });
  assert.strictEqual(genRes.status, 201, 'Exam generation must succeed');
  const exam = await genRes.json();
  const origGroup = exam.groups[0];

  // Map original questions to their source evidence
  console.log(`Original questions generated: ${origGroup.questions.length}`);
  for (const q of origGroup.questions) {
    console.log(`  [${q.question_type}] ${q.question_text}`);
  }

  // 5. Test AI-Resistant draft generation (Preview mode)
  const aiDraftRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  assert.strictEqual(aiDraftRes.status, 200, 'AI-resistant draft generation must succeed');
  const aiDraft = await aiDraftRes.json();
  assert(aiDraft.draft_groups && aiDraft.draft_groups.length > 0, 'Must return draft_groups');
  const draftGroup = aiDraft.draft_groups[0];

  // 6. Verify non-destructive behavior: Exam in DB MUST NOT be modified yet!
  const dbCheck = new DatabaseSync('./data/examcraft.db', { readOnly: true });
  const checkRows = dbCheck.prepare('SELECT question_text FROM exam_questions WHERE exam_id = ? ORDER BY question_order ASC').all(exam.id);
  dbCheck.close();
  assert.deepStrictEqual(
    checkRows.map((q) => q.question_text),
    origGroup.questions.map((q) => q.question_text),
    'Non-destructive preview: Database questions must remain completely unchanged after draft generation'
  );
  console.log('✓ Non-destructive check passed: Exam in database was NOT altered by generating preview');

  // 7. Verify Objective questions (MCQ, True/False, Fill in Blank) remain 100% identical
  for (let i = 0; i < origGroup.questions.length; i++) {
    const origQ = origGroup.questions[i];
    const draftQ = draftGroup.questions[i];
    if (['mcq', 'true_false', 'fill_blank'].includes(origQ.question_type)) {
      assert.strictEqual(
        draftQ.question_text,
        origQ.question_text,
        `Objective question (${origQ.question_type}) text must remain 100% identical in AI-resistant preview`
      );
      assert.deepStrictEqual(
        draftQ.options,
        origQ.options,
        `Objective question (${origQ.question_type}) options must remain 100% identical`
      );
    }
  }
  console.log('✓ Objective questions (MCQ, True/False, Fill in Blank) remain 100% unchanged');

  // 8. Now directly test synthesizeAiResistantQuestion on the two exact problematic sentences
  const { synthesizeAiResistantQuestion, validateAiResistantQuestion } = await import(
    '../src/server/aiResistantGenerator.ts'
  );

  const fakeChunk = {
    id: 'chunk-1',
    document_id: uploadedDoc.id,
    page_number: 1,
    chapter: 'Smart Sensing Infrastructure',
    section: 'Alert Systems',
    content: docText,
    chunk_order: 1,
    substantiveWordsCount: 50,
  };

  // Test Issue 1: Short Answer with "An alert is sent to the owner by app, SMS or a local alarm."
  const alertSent = 'An alert is sent to the owner by app, SMS or a local alarm.';
  const saQ = synthesizeAiResistantQuestion(
    uploadedDoc,
    fakeChunk,
    alertSent,
    'short_answer',
    4,
    0,
    new Set(),
    exam.id,
    origGroup.id,
    5,
    3.0
  );

  assert(saQ, 'Synthesized alert question must not be null');
  console.log('\nSynthesized Alert Short Answer Question:');
  console.log('  Stem:', saQ.question_text);
  console.log('  Answer:', saQ.correct_answer);
  console.log('  Rubric:', saQ.explanation);

  // Assertions for Issue 1:
  assert(!saQ.question_text.includes('theoretical assumptions'), 'Must NOT introduce unsupported "theoretical assumptions"');
  assert(/\b(app|SMS|local alarm)\b/i.test(saQ.question_text) || /\b(app|SMS|local alarm)\b/i.test(saQ.correct_answer), 'Must mention documented delivery channels');
  assert(/\b(operational purpose|delivery channels|notified|alert)\b/i.test(saQ.question_text), 'Must ask about delivery channels and operational purpose');
  assert(validateAiResistantQuestion(saQ), 'Alert question must pass validateAiResistantQuestion');
  console.log('✓ Issue 1 verified: Alert question is strictly grounded, uses documented channels, has no theoretical assumptions');

  // Test Issue 2: Short Answer with "Forecasts estimate next week's or next season's demand."
  const forecastSent = "Forecasts estimate next week's or next season's demand.";
  const saForecast = synthesizeAiResistantQuestion(
    uploadedDoc,
    fakeChunk,
    forecastSent,
    'short_answer',
    5,
    0,
    new Set(),
    exam.id,
    origGroup.id,
    6,
    3.0
  );

  assert(saForecast, 'Synthesized forecast short answer question must not be null');
  console.log('\nSynthesized Forecast Short Answer Question:');
  console.log('  Stem:', saForecast.question_text);
  console.log('  Answer:', saForecast.correct_answer);
  console.log('  Rubric:', saForecast.explanation);

  // Assertions for Issue 2:
  assert(!/(?:^|[\s"“‘«([{])['’]s\s+(or|and)\b/i.test(saForecast.question_text), 'Must NOT contain broken possessive fragments');
  assert(!saForecast.question_text.includes("implications of 's or next season"), 'Must NOT have "implications of \'s or next season"');
  assert(saForecast.correct_answer.includes("next week's demand and next season's demand"), 'Must preserve complete phrase in answer');
  assert(!saForecast.question_text.includes('conventional understandings'), 'Must NOT claim findings "challenge conventional understandings"');
  assert(!saForecast.question_text.includes('theoretical assumptions'), 'Must NOT contain "theoretical assumptions"');
  assert(!saForecast.correct_answer.includes('weather unpredictability'), 'Must NOT invent weather unpredictability');
  assert(!saForecast.correct_answer.includes('private extraction'), 'Must NOT invent unmeasured private extraction');
  assert(saForecast.correct_answer.includes("next week's demand and next season's demand"), 'Must state documented horizons');
  assert(validateAiResistantQuestion(saForecast), 'Forecast short answer question must pass validateAiResistantQuestion');
  console.log('✓ Issue 2 verified: Forecast question preserves complete source phrase, avoids broken possessive, and avoids conventional understandings claims');

  // Verify that a brief 7-word fact safely returns null for a 5-mark essay so the original question is preserved
  const essayForecast = synthesizeAiResistantQuestion(
    uploadedDoc,
    fakeChunk,
    forecastSent,
    'essay',
    5,
    0,
    new Set(),
    exam.id,
    origGroup.id,
    6,
    5.0
  );
  assert.strictEqual(essayForecast, null, 'Brief 7-word fact must return null for 5-mark essay to preserve original question');
  console.log('✓ Brief fact safely returns null for 5-mark essay to preserve original question without speculation');

  console.log(`\n======================================================`);
  console.log(`  ALL AI-RESISTANT GROUNDING REGRESSION TESTS PASSED!`);
  console.log(`======================================================\n`);
}

runAiResistantGroundingSpecificsTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
