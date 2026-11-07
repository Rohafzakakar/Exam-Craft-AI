import assert from 'node:assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: TESTING ALL THREE USER REPORTED ISSUES`);
  console.log(`======================================================\n`);

  // Wait for server to be responsive
  let healthy = false;
  for (let i = 0; i < 10; i++) {
    try {
      const hRes = await fetch(`${BASE_URL}/api/health`);
      if (hRes.ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(healthy, 'Dev server must be healthy at ' + BASE_URL);

  // 1. Register Teacher
  const teacherEmail = `water_auditor_${Date.now()}@university.edu`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Dr. Ahmad Karimi',
      institution: 'Faculty of Water & Environmental Engineering',
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Teacher registration must succeed');
  const teacher = await regRes.json();
  const teacherToken = teacher.token;
  console.log('✓ Teacher registered successfully');

  // 2. Prepare Household Water Management Document (with the exact text that previously broke)
  const householdWaterDoc = `
Household Water Conservation: From Smart Devices to Artificial Intelligence
Hamza Safi · Madina Kakar Page
Contents
• Executive Summary
• The Water Situation in Afghanistan
• Technologies at a Glance
01 Smart Water Meters
02 Smart Leak Detection Systems
03 Ultrasonic Water Meters
04 Artificial Intelligence for Leak Detection
05 AI-Based Water Consumption Analysis
06 AI-Powered Water Conservation Assistants
07 Smart Water Tank and Pump Controllers
08 Greywater Recycling Systems
09 Smart Rainwater Harvesting
10 Smart Water Quality Sensors
11 Smart Irrigation Systems
12 Internet of Things for Integrated Water Management
13 Digital Twins for Water Distribution Networks
14 Satellite Monitoring and AI for Drought Management
15 An Integrated Approach for Afghanistan
• Conclusion
• References

Executive Summary
Climate change, repeated drought, groundwater depletion and growing demand have made water conservation a global priority. In Afghanistan the challenge is acute: drought became the dominant environmental stressor across nearly all regions in 2025, and water access deteriorated sharply [1].

64%
drought prevalence in
2025, up from 34% in
2024 [1]

44%
full drinking-water
sufficiency in 2025, down
from 59% [1]

8 in 10
Afghans using
contaminated or unsafe
sources (UNICEF) [3]

2030
year Kabul's groundwater
could be depleted without
action [1][2]

Traditional conservation, such as repairing leaks, covering tanks and changing daily habits, remains the foundation of household water management. Modern technologies can make that work more accurate and measurable. This report reviews fifteen approaches, from smart meters and leak sensors to greywater reuse, satellite drought monitoring and artificial intelligence, and explains how each could be applied under Afghan conditions.

Key messages
Fix the basics first. Leaks, overflowing tanks and unmanaged storage are the cheapest and fastest sources of savings.
Measure before you invest. Smart-meter research shows savings come mainly from finding and repairing leaks, so devices should target the homes most likely to leak [8][9].
Use AI where it adds value. Consumption analysis, anomaly alerts and Dari/Pashto assistants are low-cost uses of AI; network-scale leak detection and digital twins suit utilities.
Protect health. Greywater, rainwater and sensor systems must never compromise drinking-water quality.

Technologies at a Glance
Smart water meters record household volumetric consumption continuously and transmit real-time telemetry to municipal utilities.
Ultrasonic water meters utilize high-frequency acoustic wave propagation velocity to measure volumetric fluid flow rates without moving mechanical parts.
Artificial intelligence for leak detection applies acoustic vibration sensors and trained machine learning neural networks to distinguish normal fluid turbulence from structural pipe ruptures.
Greywater recycling systems collect and biologically purify non-potable household drainage for garden irrigation and sanitary toilet flushing.
Smart rainwater harvesting utilizes automated storage cisterns to capture rooftop precipitation during intense storm cycles for supplemental domestic use.
Satellite observations, rainfall records, temperature data and ground measurements can be combined to monitor drought and changes in vegetation and snow cover.
Automated controllers regulate tank storage and pump operations without manual intervention.
Digital twins of municipal distribution networks simulate hydraulic pressure fluctuations and identify localized pipeline bursts before catastrophic failures occur.
`;

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const formData = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="Household_Water_Conservation.txt"',
    'Content-Type: text/plain',
    '',
    householdWaterDoc.trim(),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const uploadRes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Authorization: `Bearer ${teacherToken}`,
    },
    body: formData,
  });
  assert.strictEqual(uploadRes.status, 201, 'Upload must succeed');
  const docData = await uploadRes.json();
  const docId = docData.id;
  console.log(`✓ Household water document uploaded successfully (ID: ${docId})`);

  // 3. Generate Exam with ALL 5 Question Types
  console.log('\n--- Test 1: Real Exam Generation with All 5 Question Types ---');
  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      document_id: docId,
      title: 'Household Water Conservation & Technology Midterm',
      subject: 'Environmental Engineering',
      groups_count: 2,
      question_types_config: {
        mcq: 1,
        true_false: 1,
        fill_blank: 1,
        short_answer: 1,
        essay: 1,
      },
      bloom_enabled: true,
    }),
  });
  if (genRes.status !== 201) {
    const errBody = await genRes.text();
    console.error(`Generation failed with status ${genRes.status}:`, errBody);
  }
  assert.strictEqual(genRes.status, 201, 'Exam generation must succeed');
  const exam = await genRes.json();
  console.log(`✓ Exam generated successfully (ID: ${exam.id}, Groups: ${exam.groups.length})`);

  // 4. Verify Question and Option Quality Across Both Groups
  console.log('\n--- Test 2: Validating Generated Question Text & Options ---');
  for (const group of exam.groups) {
    console.log(`\nValidating ${group.group_name} (${group.questions.length} questions):`);
    for (const q of group.questions) {
      console.log(`- [${q.question_type}] ${q.question_text}`);

      // Check 1: No incomplete topics
      assert(!q.question_text.includes('In Afghanistan the challenge'), 'Must not have incomplete topic "In Afghanistan the challenge"');
      assert(!q.question_text.includes('the challenge?'), 'Must not have incomplete generic subject');
      assert(!q.question_text.includes('Fix the basics first?'), 'Must not treat imperative action as topic');
      assert(!q.question_text.includes('Low-cost?'), 'Must not have truncated topic');
      assert(!q.question_text.includes('64%'), 'Must not contain isolated stats');

      // Check 2: MCQ options
      if (q.question_type === 'mcq') {
        assert.strictEqual(q.options.length, 4, 'MCQ must have 4 options');
        const unique = new Set(q.options);
        assert.strictEqual(unique.size, 4, 'All 4 options must be distinct');
        assert(q.options.includes(q.correct_answer), 'Correct answer must be in options');
        for (const opt of q.options) {
          assert(!opt.endsWith('...'), `Option must not be truncated: ${opt}`);
          assert(!opt.includes('..'), `Option must not have double periods: ${opt}`);
          assert(opt.length >= 25, `Option must be a substantive sentence: ${opt}`);
        }
      }

      // Check 3: True / False
      if (q.question_type === 'true_false') {
        assert(q.question_text.startsWith('True or False: '), 'True/False must have clean prefix');
        assert(!q.question_text.includes('The foundation of household water management.'), 'Must not be incomplete noun phrase');
        assert(/[.!?]$/.test(q.question_text), 'True/False stem must end in terminal punctuation');
      }

      // Check 4: Fill in the Blank
      if (q.question_type === 'fill_blank') {
        assert(q.question_text.includes('[_____]'), 'Must have blank marker');
        assert(q.correct_answer.length >= 3, 'Must have meaningful answer');
      }

      // Check 5: Short Answer & Essay
      if (q.question_type === 'short_answer' || q.question_type === 'essay') {
        assert(q.correct_answer && q.correct_answer.length >= 15, 'Must have substantive rubric');
        assert(!q.question_text.includes('undefined'), 'Must not have undefined in prompt');
      }
    }
  }
  console.log('✓ All questions and options are grammatically complete and academically appropriate');

  // 5. Test Question Regeneration (Specifically targeting the page with the 64% statistic)
  console.log('\n--- Test 3: Question Regeneration Robustness ---');
  const targetQ = exam.groups[0].questions[0]; // first question
  const regenRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/questions/${targetQ.id}/regenerate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      instructions: 'Focus on water conservation and technology mechanisms',
    }),
  });
  assert.strictEqual(regenRes.status, 200, 'Regeneration must succeed');
  const regeneratedQ = await regenRes.json();
  console.log(`✓ Question regenerated: [${regeneratedQ.question_type}] ${regeneratedQ.question_text}`);
  assert(!regeneratedQ.question_text.includes('64%'), 'Regenerated question must not be based on 64% statistic');
  assert(!regeneratedQ.question_text.includes('In Afghanistan the challenge'), 'Regenerated question must not use broken topic');
  assert.strictEqual(regeneratedQ.question_type, targetQ.question_type, 'Preserves question type');
  assert.strictEqual(regeneratedQ.marks, targetQ.marks, 'Preserves marks');

  // 6. Test Lower Preview DOCX & PDF Export (Using query token & session_id)
  console.log('\n--- Test 4 & 5: Lower Preview Export Authorization (DOCX & PDF) ---');
  const currentGroupId = exam.groups[0].id;

  // 6a. Lower preview DOCX download with query token
  const lowerDocxUrl = `${BASE_URL}/api/exams/${exam.id}/export/docx?target=exam&include_references=true&group_id=${currentGroupId}&token=${encodeURIComponent(teacherToken)}`;
  const lowerDocxRes = await fetch(lowerDocxUrl);
  assert.strictEqual(lowerDocxRes.status, 200, 'Lower preview DOCX export must return 200 OK');
  assert(
    lowerDocxRes.headers.get('content-type')?.includes('wordprocessingml') ||
      lowerDocxRes.headers.get('content-type')?.includes('octet-stream'),
    'Content-Type must be DOCX'
  );
  const docxBuffer = await lowerDocxRes.arrayBuffer();
  assert(docxBuffer.byteLength > 1000, `DOCX buffer must be non-empty (got ${docxBuffer.byteLength} bytes)`);
  console.log(`✓ Lower preview DOCX download verified: 200 OK, ${docxBuffer.byteLength} bytes`);

  // 6b. Lower preview PDF download with query token
  const lowerPdfUrl = `${BASE_URL}/api/exams/${exam.id}/export/pdf?target=exam&include_references=true&group_id=${currentGroupId}&token=${encodeURIComponent(teacherToken)}`;
  const lowerPdfRes = await fetch(lowerPdfUrl);
  assert.strictEqual(lowerPdfRes.status, 200, 'Lower preview PDF export must return 200 OK');
  assert(
    lowerPdfRes.headers.get('content-type')?.includes('pdf'),
    'Content-Type must be application/pdf'
  );
  const pdfBuffer = await lowerPdfRes.arrayBuffer();
  assert(pdfBuffer.byteLength > 1000, `PDF buffer must be non-empty (got ${pdfBuffer.byteLength} bytes)`);
  console.log(`✓ Lower preview PDF download verified: 200 OK, ${pdfBuffer.byteLength} bytes`);

  // 7. Top-Level Export Regression
  console.log('\n--- Test 6: Top-Level Export Regression ---');
  const topExportUrl = `${BASE_URL}/api/exams/${exam.id}/export/docx?target=both&include_references=true&token=${encodeURIComponent(teacherToken)}`;
  const topRes = await fetch(topExportUrl);
  assert.strictEqual(topRes.status, 200, 'Top-level export must return 200 OK');
  const topBuffer = await topRes.arrayBuffer();
  assert(topBuffer.byteLength > 1000, 'Top-level export buffer must be non-empty');
  console.log(`✓ Top-level export regression verified: 200 OK, ${topBuffer.byteLength} bytes`);

  // 8. Guest Session Export & Isolation
  console.log('\n--- Test 7: Guest Session Exam Generation & Export ---');
  const guestSessionId = `guest_test_${Date.now()}`;

  // Guest upload
  const guestUploadRes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'X-Guest-Session-ID': guestSessionId,
    },
    body: formData,
  });
  assert.strictEqual(guestUploadRes.status, 201, 'Guest upload must succeed');
  const guestDoc = await guestUploadRes.json();

  // Guest exam generation
  const guestGenRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Session-ID': guestSessionId,
    },
    body: JSON.stringify({
      document_id: guestDoc.id,
      title: 'Guest Water Conservation Exam',
      groups_count: 1,
      question_types_config: { mcq: 1, true_false: 1 },
    }),
  });
  assert.strictEqual(guestGenRes.status, 201, 'Guest exam generation must succeed');
  const guestExam = await guestGenRes.json();

  // Guest lower preview export with session_id query param
  const guestExportUrl = `${BASE_URL}/api/exams/${guestExam.id}/export/pdf?target=exam&include_references=true&session_id=${encodeURIComponent(guestSessionId)}`;
  const guestExportRes = await fetch(guestExportUrl);
  assert.strictEqual(guestExportRes.status, 200, 'Guest export with valid session_id must return 200 OK');
  const guestPdfBuf = await guestExportRes.arrayBuffer();
  assert(guestPdfBuf.byteLength > 1000, 'Guest PDF must be non-empty');
  console.log(`✓ Valid guest session export verified: 200 OK, ${guestPdfBuf.byteLength} bytes`);

  // 9. Unauthorized Export Rejection
  console.log('\n--- Test 8 & 9: Unauthorized Export Rejections (403 Forbidden) ---');
  // 9a. No token and no session_id
  const unauthUrl = `${BASE_URL}/api/exams/${exam.id}/export/pdf?target=exam&include_references=true`;
  const unauthRes = await fetch(unauthUrl);
  assert.strictEqual(unauthRes.status, 403, 'Export without credentials must return 403 Forbidden');
  console.log('✓ Request without credentials correctly rejected with 403 Forbidden');

  // 9b. Different guest trying to export teacher's exam
  const otherGuestUrl = `${BASE_URL}/api/exams/${exam.id}/export/pdf?target=exam&include_references=true&session_id=stranger_guest_123`;
  const otherGuestRes = await fetch(otherGuestUrl);
  assert.strictEqual(otherGuestRes.status, 403, 'Cross-user guest access must return 403 Forbidden');
  console.log('✓ Cross-session unauthorized access correctly rejected with 403 Forbidden');

  console.log('\n======================================================');
  console.log('  ALL USER-REPORTED ISSUES TESTS PASSED 100%!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
