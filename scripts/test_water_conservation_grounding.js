import assert from 'node:assert';

const PORT = process.env.TEST_PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log(`Starting Water Conservation Grounding & AI-Resistant Quality Test Suite against ${BASE_URL}...`);

  // 1. Register a teacher
  const teacherEmail = `water_teacher_${Date.now()}@university.edu`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Prof. Hydrology & Agronomy',
      institution: 'Environmental Studies Faculty',
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Teacher registration failed');
  const teacherData = await regRes.json();
  const token = teacherData.token;
  console.log('✓ Teacher registered successfully');

  // 2. Upload a synthetic Water Conservation Document containing:
  // - A header line: "Foundational Water Conservation Methods 1" (unpunctuated fragment)
  // - Substantive sentences containing words that previously triggered false domain matches
  //   like "Cost Efficiency", "Performance", "replicate", "redundancy" in water context
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const textContent = `
Foundational Water Conservation Methods 1

Drip irrigation systems optimize agricultural water efficiency by delivering moisture directly to crop root zones.
The cost efficiency of drip irrigation exceeds traditional flood irrigation by reducing systemic evaporative losses.
Field performance evaluations demonstrate that sub-surface irrigation channels maintain soil hydration with minimal volume.
Agricultural engineers replicate localized watershed management practices to restore aquifer levels during prolonged drought.
Building community rainwater harvesting reservoirs provides essential storage redundancy against seasonal precipitation deficits.
Water metering protocols enable municipal utility managers to detect pipeline leakage and enforce equitable distribution quotas.
Mulching organic biomass over topsoil prevents thermal moisture evaporation and improves soil organic matter retention.
Constructed wetland biofilters naturally purify agricultural runoff before excess water discharges into regional waterways.
Laser land leveling produces uniform field topography that eliminates high-volume pooling and runoff waste.
Planting drought-tolerant native crop varieties significantly decreases irrigation demand across arid cultivating zones.
Industrial greywater recycling facilities treat non-potable processing effluent for reuse in cooling towers and sanitation.
Riparian vegetative buffer strips stabilize riverbanks and enhance groundwater percolation during storm surges.
`;

  // We can construct a multipart text upload or JSON document
  const formData = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="water_conservation_principles.txt"',
    'Content-Type: text/plain',
    '',
    textContent.trim(),
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
  assert.strictEqual(uploadRes.status, 201, 'Document upload failed');
  const uploadedDoc = await uploadRes.json();
  console.log(`✓ Water conservation document uploaded (ID: ${uploadedDoc.id})`);

  // 3. Generate exam
  console.log('\n--- Test: Exam Generation Source Grounding ---');
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      document_id: uploadedDoc.id,
      title: 'Water Resource Management Examination',
      subject: 'Hydrology and Conservation',
      groups_count: 2,
      question_types_config: { mcq: 2, true_false: 1, short_answer: 1 },
      difficulty_distribution: { easy: 20, medium: 50, hard: 30 },
      bloom_enabled: true,
    }),
  });
  if (genRes.status !== 201) {
    const errBody = await genRes.text();
    console.error('Exam generation failed:', genRes.status, errBody);
  }
  assert.strictEqual(genRes.status, 201, 'Exam generation failed');
  const exam = await genRes.json();
  console.log(`✓ Exam generated with ${exam.groups.length} groups and ${exam.questions_count} questions`);

  // Verify default exam questions:
  // Must NOT contain distributed file systems, petabytes, SAN/NAS, or unpunctuated heading fragment
  for (const group of exam.groups) {
    for (const q of group.questions) {
      const qText = q.question_text;
      const combined = (qText + ' ' + (q.options?.join(' ') || '') + ' ' + q.correct_answer).toLowerCase();

      assert(!combined.includes('distributed file system'), `Forbidden DFS reference in default exam: "${qText}"`);
      assert(!combined.includes('petabyte'), `Forbidden petabyte reference in default exam: "${qText}"`);
      assert(!combined.includes('san/nas'), `Forbidden SAN/NAS reference in default exam: "${qText}"`);
      assert(!qText.includes('Foundational Water Conservation Methods 1...'), `Truncated heading in stem: "${qText}"`);
      assert(!qText.includes('...'), `Ellipsis found in stem: "${qText}"`);
      if (q.question_type === 'mcq') {
        assert.strictEqual(q.options.length, 4, 'MCQ must have exactly 4 options');
        assert(q.options.includes(q.correct_answer), 'Options must include correct answer');
        for (const opt of q.options) {
          assert(!opt.includes('...'), `Ellipsis found in MCQ option: "${opt}"`);
        }
      }
    }
  }
  console.log('✓ Default exam verified: ZERO DFS questions, ZERO ellipses, ZERO heading fragments');

  // 4. Generate AI-Resistant Draft
  console.log('\n--- Test: AI-Resistant Question Quality & Grounding ---');
  const draftRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/generate-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  assert.strictEqual(draftRes.status, 200, 'AI-resistant draft generation failed');
  const draftData = await draftRes.json();

  console.log(`Generated ${draftData.draft_groups.length} draft groups.`);
  for (const group of draftData.draft_groups) {
    console.log(`\nValidating Draft Group: ${group.group_name} (${group.questions.length} questions)`);
    for (const q of group.questions) {
      console.log(`- [${q.question_type}] Marks: ${q.marks} | Stem: "${q.question_text}"`);
      if (q.options) {
        console.log(`  Options: ${JSON.stringify(q.options)}`);
        console.log(`  Correct: "${q.correct_answer}"`);
      }

      const qText = q.question_text;
      const combined = (qText + ' ' + (q.options?.join(' ') || '') + ' ' + q.correct_answer).toLowerCase();

      // Issue 1: No truncation or incomplete stems
      assert(!qText.includes('...'), `AI-resistant stem contains ellipsis: "${qText}"`);
      assert(!qText.includes('…'), `AI-resistant stem contains unicode ellipsis: "${qText}"`);

      // Issue 2: Zero cross-domain contamination
      assert(!combined.includes('distributed file system'), `DFS contamination: "${qText}"`);
      assert(!combined.includes('petabyte'), `Petabyte contamination: "${qText}"`);
      assert(!combined.includes('san/nas'), `SAN/NAS contamination: "${qText}"`);

      // Issue 3: Coherent True/False questions (no biochemical injection)
      if (q.question_type === 'true_false') {
        assert(!combined.includes('biochemical'), `Biochemical injection in water conservation: "${qText}"`);
        assert(qText.startsWith('True or False:'), `T/F must start with standard prefix: "${qText}"`);
        assert(!qText.includes('operates independently of all surrounding structural constraints without requiring underlying biochemical'), `Ungrammatical False stem detected: "${qText}"`);
      }

      // Issue 4: No heading fragments as subject or evidence
      assert(!qText.includes('Foundational Water Conservation Methods 1'), `Heading fragment in stem: "${qText}"`);
      assert(!q.source_evidence.includes('Foundational Water Conservation Methods 1'), `Heading fragment in evidence: "${q.source_evidence}"`);

      // Issue 5: No generic technical distractors
      assert(!combined.includes('passive equilibrium'), `Generic distractor "passive equilibrium" found: "${combined}"`);
      assert(!combined.includes('centralized consensus models'), `Generic distractor "centralized consensus models" found: "${combined}"`);

      // Structural validity
      if (q.question_type === 'mcq') {
        assert.strictEqual(q.options.length, 4, 'MCQ must have 4 options');
        assert(q.options.includes(q.correct_answer), 'Options must contain correct answer');
        const uniqueOpts = new Set(q.options);
        assert.strictEqual(uniqueOpts.size, 4, 'All 4 options must be distinct');
        for (const opt of q.options) {
          assert(!opt.includes('...'), `MCQ option contains ellipsis: "${opt}"`);
        }
      }
    }
  }

  // 5. Apply AI-Resistant questions and verify persistence
  console.log('\n--- Test: Apply AI-Resistant Questions & Persistence ---');
  const applyRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/apply-ai-resistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ draft_groups: draftData.draft_groups }),
  });
  assert.strictEqual(applyRes.status, 200, 'Apply AI-resistant failed');

  // Verify total marks preserved
  const verifyRes = await fetch(`${BASE_URL}/api/exams/${exam.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const updatedExam = await verifyRes.json();
  assert.strictEqual(updatedExam.total_marks, exam.total_marks, 'Total marks must be preserved');
  console.log(`✓ Total marks preserved: ${updatedExam.total_marks}`);

  console.log('\n============================================================');
  console.log('✓ ALL WATER CONSERVATION GROUNDING & QUALITY TESTS PASSED!');
  console.log('============================================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
