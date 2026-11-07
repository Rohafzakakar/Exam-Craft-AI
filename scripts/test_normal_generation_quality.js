import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runNormalGenerationQualityTest() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: NORMAL QUESTION GENERATION QUALITY TEST`);
  console.log(`======================================================\n`);

  // 1. Verify seed exam in SQLite is preserved
  const db = new DatabaseSync('./data/examcraft.db', { readOnly: true });
  const row = db.prepare("SELECT id, title FROM exams WHERE id = 'exam-cell-bio-midterm'").get();
  assert(row, 'Saved seed exam must be preserved in SQLite');
  console.log(`✓ Saved examination ${row.id} is preserved`);
  db.close();

  // 2. Register teacher
  const teacherEmail = `normal_quality_${Date.now()}@edu.af`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Professor QA Test',
      institution: 'Kabul Polytechnic University',
    }),
  });
  assert(regRes.status === 200 || regRes.status === 201, 'Teacher registration must succeed');
  const teacher = await regRes.json();
  const token = teacher.token;

  // 3. Document text containing:
  // - Author descriptions and table rows (which MUST BE EXCLUDED from questions)
  // - Clear substantive facts for MCQs, True/False, Fill in Blank, Short Answer, Essay
  const docText = `
Household Water Conservation: From Smart Devices to Artificial Intelligence
Hamza Safi · Madina Kakar Page
About the Authors: Hamza Safi is an assistant professor in the Department of Water Engineering at Kabul Polytechnic University.
Madina Kakar received her master's degree from Kabul University and lectures in environmental science.

Table 1: Household Water Consumption by End-Use Category in Arid Climates
| End-Use Category | Average Liters per Day | Percentage of Household Total |
| Bathroom and Shower | 120 | 40% |
| Laundry and Washing | 75 | 25% |

Chapter 1: Smart Sensing Infrastructure
Smart water meters record volumetric water consumption continuously and transmit real-time telemetry to municipal utilities.
Ultrasonic water meters utilize high-frequency acoustic wave propagation velocity to measure fluid flow rates without moving mechanical parts.
Transit-time ultrasonic transducers calculate fluid velocity by measuring bidirectional time differentials of emitted sound pulses.
Artificial intelligence for leak detection monitors acoustic vibrations across household pipe networks to distinguish fluid turbulence from structural ambient noise.
Greywater recycling systems collect non-potable household drainage from bathroom sinks and laundry units for secondary landscape irrigation.
Smart rainwater harvesting channels rooftop precipitation through coarse mesh pre-filters into dedicated storage cisterns.
Automated controllers regulate tank storage and pump operation based on tank water levels and local weather forecasts.
Soil mulching reduces evaporative moisture loss from topsoil by creating a protective physical barrier against solar radiation.
Drought prevalence rose across arid provinces, requiring urgent conservation measures.
`;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const formData = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="normal_pipeline_test.txt"',
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

  // 4. Generate exam with 6 questions: 2 MCQ, 1 True/False, 1 Fill in Blank, 1 Short Answer, 1 Essay
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_id: uploadedDoc.id,
      title: 'Water Management Quality Examination',
      subject: 'Hydraulic Systems',
      groups_count: 1,
      question_types_config: {
        mcq: 2,
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
  const group = exam.groups[0];

  console.log(`Generated ${group.questions.length} questions:`);
  for (const q of group.questions) {
    console.log(`\n[${q.question_type}] ${q.question_text}`);
    if (q.options) {
      q.options.forEach((opt, idx) => console.log(`   ${String.fromCharCode(65 + idx)}) ${opt}`));
    }
    console.log(`   Answer: ${q.correct_answer}`);
    console.log(`   Rubric: ${q.explanation}`);
  }

  // 5. Rigorous quality verification for all 6 questions:

  for (const q of group.questions) {
    // Check 1: NO question or answer contains author descriptions or table rows
    assert(!/\b(Hamza Safi|Madina Kakar|Table 1|About the Authors|assistant professor|Department of Water Engineering|master'?s degree)\b/i.test(q.question_text),
      `Question stem must not contain author descriptions or table labels: "${q.question_text}"`);
    assert(!/\|/.test(q.question_text), `Question stem must not contain table pipes: "${q.question_text}"`);
    assert(!/\b(Table 1|End-Use Category|Liters per Day)\b/i.test(q.correct_answer),
      `Answer must not contain table metadata: "${q.correct_answer}"`);

    // Check 2: MCQ Grammar and Scientific Coherence
    if (q.question_type === 'mcq') {
      assert.strictEqual(q.options.length, 4, 'MCQ must have exactly 4 options');
      assert(q.options.includes(q.correct_answer), 'Correct answer must be among options');
      const uniqueOpts = new Set(q.options);
      assert.strictEqual(uniqueOpts.size, 4, 'All 4 MCQ options must be unique');

      // Stems must be grammatically complete and end in '?'
      assert(q.question_text.endsWith('?'), `MCQ stem must end in question mark: "${q.question_text}"`);
      assert(!/\bHow does (Smart water meters|meters|sensors|transducers|technologies|systems)\b/i.test(q.question_text),
        `MCQ stem must have subject-verb agreement: "${q.question_text}"`);
      assert(!/\bHow do (drought|groundwater|water table)\b/i.test(q.question_text),
        `Singular environmental topics must use "does": "${q.question_text}"`);

      // All 4 options must be complete, punctuated sentences
      for (const opt of q.options) {
        assert(/[.!?]$/.test(opt), `Option must end in punctuation: "${opt}"`);
        assert(!/\.{3}|…/.test(opt), `Option must not contain truncation ellipses: "${opt}"`);
        assert(opt.length >= 25, `Option must be substantive (>= 25 chars): "${opt}"`);
      }
    }

    // Check 3: True/False Question
    if (q.question_type === 'true_false') {
      assert(/^True or False:\s+[A-Z]/i.test(q.question_text),
        `True/False stem must start with "True or False:" followed by capitalized proposition: "${q.question_text}"`);
      assert(q.question_text.endsWith('.'), `True/False proposition must end in a period: "${q.question_text}"`);
      assert(!/\|/.test(q.question_text), 'T/F must not contain table pipes');
      assert(!q.question_text.includes('About the Authors'), 'T/F must not contain author biography');
      assert(!q.question_text.includes('Table 1'), 'T/F must not contain table captions');
    }

    // Check 4: Fill in the Blank
    if (q.question_type === 'fill_blank') {
      const blanks = (q.question_text.match(/\[_____\]/g) || []).length;
      assert.strictEqual(blanks, 1, 'Fill in blank must contain exactly one [_____]');
      assert(!q.question_text.includes('Hamza Safi'), 'Fill in blank must not contain author name');
      assert(!q.question_text.includes('Table 1'), 'Fill in blank must not contain table name');

      // Target word must not be a trivial ambiguous stop word
      const forbiddenAnswers = ['water', 'first', 'local', 'owner', 'total', 'large', 'small', 'state'];
      assert(!forbiddenAnswers.includes(q.correct_answer.toLowerCase()),
        `Fill in blank answer must not be an ambiguous stop word: "${q.correct_answer}"`);
    }

    // Check 5: Short Answer
    if (q.question_type === 'short_answer') {
      assert(q.question_text.length >= 35, `Short answer stem must be substantive: "${q.question_text}"`);
      assert(q.correct_answer.startsWith('According to the source text'),
        `Short answer model answer must cite the source text: "${q.correct_answer}"`);
      assert(q.explanation.includes('Scoring Rubric'), `Explanation must include Scoring Rubric: "${q.explanation}"`);
      assert(!q.question_text.includes('About the Authors'), 'Short answer must not contain author biography');
    }

    // Check 6: Essay
    if (q.question_type === 'essay') {
      assert(q.question_text.length >= 50, `Essay stem must be substantive: "${q.question_text}"`);
      assert(q.correct_answer.includes('Comprehensive analytical response grounded in Page'),
        `Essay answer must be structured and grounded: "${q.correct_answer}"`);
      assert(q.explanation.includes('Scoring Rubric'), `Essay explanation must include Scoring Rubric: "${q.explanation}"`);
    }
  }

  console.log('\n✓ All 6 normal examination questions verified for grammar, grounding, and absence of table/author contamination');

  // 6. Test AI-Resistant Preview Model Answers and Rubrics for Alert Delivery
  const { synthesizeAiResistantQuestion, validateAiResistantQuestion } = await import(
    '../src/server/aiResistantGenerator.ts'
  );

  const fakeChunk = {
    id: 'chunk-test',
    document_id: uploadedDoc.id,
    page_number: 1,
    chapter: 'Chapter 1: Smart Sensing Infrastructure',
    section: 'Alert Systems',
    content: docText,
    chunk_order: 1,
    substantiveWordsCount: 50,
  };

  const alertSent = 'An alert is sent to the owner by app, SMS or a local alarm.';
  const saAlert = synthesizeAiResistantQuestion(
    uploadedDoc,
    fakeChunk,
    alertSent,
    'short_answer',
    4,
    0,
    new Set(),
    exam.id,
    group.id,
    5,
    3.0
  );

  assert(saAlert, 'Synthesized alert question must not be null');
  console.log('\nAI-Resistant Alert Question:');
  console.log('  Stem:', saAlert.question_text);
  console.log('  Answer:', saAlert.correct_answer);
  console.log('  Rubric:', saAlert.explanation);

  // Assert NO unsupported claims about detecting leaks or network outages
  assert(!saAlert.correct_answer.includes('detected leaks'), 'Must not claim detected leaks');
  assert(!saAlert.correct_answer.includes('network is unavailable'), 'Must not claim operating during network outages');
  assert(!saAlert.explanation.includes('prompt anomaly reporting'), 'Rubric must not claim prompt anomaly reporting');
  assert(saAlert.correct_answer.includes('app, SMS, or a local alarm'), 'Must state documented delivery methods');
  assert(validateAiResistantQuestion(saAlert), 'Alert question must pass validation');
  console.log('✓ AI-Resistant alert model answer and rubric strictly grounded in document evidence');

  console.log(`\n======================================================`);
  console.log(`  ALL NORMAL QUESTION GENERATION QUALITY TESTS PASSED!`);
  console.log(`======================================================\n`);
}

runNormalGenerationQualityTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
