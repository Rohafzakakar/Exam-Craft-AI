import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runScreenshotSpecificsTest() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: USER SCREENSHOT SPECIFIC QUALITY TEST`);
  console.log(`======================================================\n`);

  // 1. Verify existing DB exam is safely preserved
  const db = new DatabaseSync('./data/examcraft.db', { readOnly: true });
  const row = db.prepare("SELECT id, title, total_marks FROM exams WHERE id = 'exam-cell-bio-midterm'").get();
  assert(row, 'Saved seed exam must be preserved');
  console.log(`✓ Saved examination ${row.id} (${row.title}) is safely preserved in SQLite`);
  db.close();

  // 2. Register teacher and upload the exact document content from DOC-20261028-WA0016.pdf
  const teacherEmail = `quality_verifier_${Date.now()}@edu.af`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Engineer Safi',
      institution: 'Kabul Polytechnic University',
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Teacher registration must succeed');
  const teacher = await regRes.json();
  const token = teacher.token;

  // Real text segments from DOC-20261028-WA0016.pdf
  const docText = `
Household Water Conservation: From Smart Devices to Artificial Intelligence
Hamza Safi · Madina Kakar Page
Contents
• Executive Summary
• The Water Situation in Afghanistan
• Technologies at a Glance
01 Smart Water Meters
Smart water meters record household volumetric consumption continuously and transmit real-time telemetry to municipal utilities.
02 Ultrasonic Flow Measurement
Ultrasonic water meters utilize high-frequency acoustic wave propagation velocity to measure volumetric fluid flow rates without moving mechanical parts.
Transit-time ultrasonic transducers calculate fluid velocity by measuring bidirectional time differentials of emitted sound pulses.
03 Acoustic Leak Detection
Artificial intelligence for leak detection monitors acoustic vibrations across household pipe networks to distinguish fluid turbulence from structural ambient noise.
Deep learning vibration algorithms distinguish subtle background vibrations from high-pressure pipe ruptures.
04 Greywater Recycling
Greywater recycling systems collect non-potable household drainage from bathroom sinks, showers, and laundry units for secondary flushing and outdoor landscape irrigation.
05 Rainwater Harvesting
Smart rainwater harvesting channels rooftop precipitation through coarse mesh pre-filters into dedicated storage cisterns.
Automated controllers regulate tank storage and pump operation based on tank water levels and local weather forecasts.
06 Afghan Environmental Context
Drought prevalence rose to 64% in 2025 from 34% in 2024, and in worst-affected regions 92% of households faced extreme water access challenges.
Kabul's groundwater could be depleted by 2030 if unmanaged extraction rates persist across residential extraction wells.
In Afghanistan the challenge is acute: repeated drought, groundwater depletion and infrastructure damage require urgent solutions.
Fix the basics first. Leaks, overflowing tanks and unmanaged consumption must be addressed before installing advanced digital twins.
Smart-meter research shows savings come mainly from finding and repairing leaks, not just habit change.
Protect health. Greywater, rainwater and sensor systems must never compromise drinking-water ●
Household Water Conservation: From Smart Devices to Artificial Intelligence
Hamza Safi · Madina Kakar Page
safety [12].
`;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const formData = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="DOC-20261028-WA0016.txt"',
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

  // 3. Generate exam with 6 questions: MCQ, True/False, Fill in Blank, Short Answer, Essay
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_id: uploadedDoc.id,
      title: 'Water Management Midterm Examination',
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
  if (genRes.status !== 201) {
    const errText = await genRes.text();
    console.error('Generation failed:', genRes.status, errText);
  }
  assert.strictEqual(genRes.status, 201, 'Exam generation must succeed');
  const exam = await genRes.json();

  const group = exam.groups[0];
  console.log(`Generated ${group.questions.length} questions in exam:`);
  for (const q of group.questions) {
    console.log(`[${q.question_type}] ${q.question_text}`);
    if (q.options) {
      q.options.forEach((opt, idx) => console.log(`   ${String.fromCharCode(65 + idx)}) ${opt}`));
    }
  }

  // 4. Assert strict question quality criteria:
  for (const q of group.questions) {
    // A. No raw bullet glyphs or square characters or tabs
    assert(!/[•●*➢\t]/.test(q.question_text), `Question stem must not contain inline bullet glyphs: "${q.question_text}"`);
    if (q.options) {
      for (const opt of q.options) {
        assert(!/[•●*➢\t]/.test(opt), `Option must not contain inline bullet glyphs: "${opt}"`);
      }
    }

    // B. No bibliography citations like [12], [8][9], [1]
    assert(!/\[\d+\]/.test(q.question_text), `Question stem must not contain citation brackets: "${q.question_text}"`);
    if (q.options) {
      for (const opt of q.options) {
        assert(!/\[\d+\]/.test(opt), `Option must not contain citation brackets: "${opt}"`);
      }
    }

    // C. No author names or document titles inside questions or options
    assert(!/\b(Hamza Safi|Madina Kakar)\b/i.test(q.question_text), `Question stem must not contain author names: "${q.question_text}"`);
    assert(!/\bHousehold Water Conservation: From Smart Devices\b/i.test(q.question_text), `Question stem must not contain document title: "${q.question_text}"`);
    assert(!/\bPage safety\b/i.test(q.question_text), `Question stem must not contain "Page safety": "${q.question_text}"`);

    // D. True/False checks
    if (q.question_type === 'true_false') {
      assert(!q.question_text.includes('Hamza Safi'), 'T/F question must not contain author names');
      assert(!q.question_text.includes('safety [12]'), 'T/F question must not contain orphan citation');
      const statMatches = q.question_text.match(/\b\d+(\.\d+)?(%|\s*percent)\b/gi) || [];
      assert(statMatches.length <= 1, `T/F question must not bundle multiple statistics: "${q.question_text}"`);
    }

    // E. Fill in the Blank checks
    if (q.question_type === 'fill_blank') {
      const blanks = (q.question_text.match(/\[_____\]/g) || []).length;
      assert.strictEqual(blanks, 1, 'Fill in the blank must have exactly 1 blank');
      assert(!q.question_text.includes('Hamza Safi'), 'Fill in blank must not contain author names');
      const statMatches = q.question_text.match(/\b\d+(\.\d+)?(%|\s*percent)\b/gi) || [];
      assert(statMatches.length <= 1, `Fill in blank must not bundle survey statistics: "${q.question_text}"`);
    }

    // F. MCQ checks
    if (q.question_type === 'mcq') {
      assert.strictEqual(q.options.length, 4, 'MCQ must have exactly 4 options');
      // No option should describe drought as rainfall surge
      for (const opt of q.options) {
        assert(!opt.includes('rainfall surge'), `MCQ options must not describe drought as rainfall surge: "${opt}"`);
      }
      // If stem is about drought, it must not ask for "operational role"
      if (/drought/i.test(q.question_text)) {
        assert(!q.question_text.includes('operational role of Drought'), `Drought stem must not ask for operational role: "${q.question_text}"`);
      }
      // If stem is about smart meters, options must not mix acoustic sensors or desalination
      if (/smart water meter/i.test(q.question_text)) {
        for (const opt of q.options) {
          assert(!opt.includes('desalination'), 'Smart meter MCQ must not mix desalination');
          assert(!opt.includes('satellite remote sensing'), 'Smart meter MCQ must not mix satellite remote sensing');
        }
      }
    }

    // G. Short Answer & Essay checks
    if (q.question_type === 'short_answer') {
      assert(!q.question_text.includes("Kabul's groundwater systems"), `Short answer must not append "systems" to Kabul's groundwater: "${q.question_text}"`);
      assert(!q.question_text.includes("in sustainable water resource management and monitoring systems"), `Short answer must not have bloated double-systems context: "${q.question_text}"`);
    }
    if (q.question_type === 'essay') {
      assert(!q.question_text.includes("Drought systems"), `Essay must not generate "Drought systems": "${q.question_text}"`);
    }
  }

  // 5. Test AI-Resistant Transformation scope restriction
  const aiResRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  assert.strictEqual(aiResRes.status, 200, 'AI-resistant draft generation must succeed');
  const aiDraft = await aiResRes.json();
  const draftGroup = aiDraft.draft_groups[0];

  for (let i = 0; i < group.questions.length; i++) {
    const origQ = group.questions[i];
    const draftQ = draftGroup.questions[i];
    if (['mcq', 'true_false', 'fill_blank'].includes(origQ.question_type)) {
      assert.strictEqual(draftQ.question_text, origQ.question_text, `Objective question ${origQ.question_type} must not be altered by AI-resistant draft`);
      assert.deepStrictEqual(draftQ.options, origQ.options, `Objective options for ${origQ.question_type} must not be altered`);
    }
  }
  console.log('✓ AI-resistant draft strictly restricted to Short Answer and Essay questions');

  console.log(`\n======================================================`);
  console.log(`  ALL USER SCREENSHOT SPECIFIC QUALITY TESTS PASSED!`);
  console.log(`======================================================\n`);
}

runScreenshotSpecificsTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
