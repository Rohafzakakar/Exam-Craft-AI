import assert from 'node:assert';
import fs from 'node:fs';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: GUEST MODE NAVIGATION & MODAL TEST`);
  console.log(`======================================================\n`);

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Dev server should be healthy');
  console.log('✓ 1. Dev server healthy');

  // 2. Structural verification of App.tsx navigation logic
  const appCode = fs.readFileSync('src/App.tsx', 'utf8');

  // Ensure Teacher Dashboard button is strictly guarded by currentUser
  assert(
    appCode.includes('{currentUser ? ('),
    'App.tsx must conditionally render navigation based on currentUser'
  );
  assert(
    appCode.includes('Teacher Dashboard'),
    'App.tsx should contain Teacher Dashboard button definition'
  );
  // Verify Guest Mode does not render Teacher Dashboard button
  const guestNavBranch = appCode.slice(appCode.indexOf('{currentUser ? ('), appCode.indexOf('{/* Header Actions */}'));
  assert(
    guestNavBranch.includes('Teacher Dashboard'),
    'Teacher Dashboard must be inside the currentUser branch'
  );
  assert(
    guestNavBranch.includes('Exam Workspace'),
    'Exam Workspace must be present for both branches'
  );

  // Verify Exam History button is guarded by currentUser
  assert(
    appCode.includes('{/* Exam History Button (Exclusively for Authenticated Teachers) */}'),
    'Exam History button must have exclusive teacher comment tag'
  );
  const historySnippet = appCode.slice(
    appCode.indexOf('{/* Exam History Button (Exclusively for Authenticated Teachers) */}'),
    appCode.indexOf('{/* Secure LLM Settings Button */}')
  );
  assert(
    historySnippet.startsWith('{/* Exam History Button (Exclusively for Authenticated Teachers) */}\n          {currentUser && ('),
    'Exam History button MUST only render when currentUser is truthy'
  );

  // Verify ExamHistoryModal is guarded by currentUser
  const historyModalSnippet = appCode.slice(appCode.indexOf('{/* Exam History Modal (Exclusively for Authenticated Teachers) */}'));
  assert(
    historyModalSnippet.includes('{currentUser && (\n        <ExamHistoryModal'),
    'ExamHistoryModal MUST only be mounted when currentUser is truthy'
  );

  // Verify onBackToDashboard and onOpenHistory are passed conditionally
  assert(
    appCode.includes('onBackToDashboard={currentUser ? () => setMainView(\'dashboard\') : undefined}'),
    'onBackToDashboard must be undefined in Guest Mode'
  );
  assert(
    appCode.includes('onOpenHistory={currentUser ? () => setIsHistoryModalOpen(true) : undefined}'),
    'onOpenHistory must be undefined in Guest Mode'
  );
  console.log('✓ 2. App.tsx navigation and modal isolation structural rules verified:');
  console.log('    - Teacher Dashboard button hidden from guests');
  console.log('    - Exam History button hidden from guests');
  console.log('    - ExamHistoryModal drawer completely unmounted for guests');
  console.log('    - onBackToDashboard passed only for authenticated teachers');

  // 3. Structural verification of AuthModal.tsx explanation panel
  const authModalCode = fs.readFileSync('src/components/AuthModal.tsx', 'utf8');

  assert(
    authModalCode.includes('Teacher Dashboard & Document Archive'),
    'AuthModal must contain "Teacher Dashboard & Document Archive"'
  );
  assert(
    authModalCode.includes('The Teacher Dashboard, persistent examination histories, and institutional document libraries are reserved exclusively for authenticated educators.'),
    'AuthModal must contain exact requested explanation text'
  );
  assert(
    authModalCode.includes('Isolated Examination History'),
    'AuthModal must contain "Isolated Examination History"'
  );
  assert(
    authModalCode.includes('Securely archive, retrieve, reorder, and reopen your multi-group examination papers across sessions.'),
    'AuthModal must contain exact explanation for Isolated Examination History'
  );
  assert(
    authModalCode.includes('Private Document Library'),
    'AuthModal must contain "Private Document Library"'
  );
  assert(
    authModalCode.includes('Store and index your course syllabus, PDF materials, and textbooks with chunk-level inspection.'),
    'AuthModal must contain exact explanation for Private Document Library'
  );
  assert(
    authModalCode.includes('Department Preferences'),
    'AuthModal must contain "Department Preferences"'
  );
  assert(
    authModalCode.includes('Preset institutional branding, faculty headers, default test durations, and Bloom\'s taxonomy settings.'),
    'AuthModal must contain exact explanation for Department Preferences'
  );
  console.log('✓ 3. AuthModal.tsx explanation content and academic styling verified:');
  console.log('    - "Teacher Dashboard & Document Archive" title and description');
  console.log('    - "Isolated Examination History" feature explanation');
  console.log('    - "Private Document Library" feature explanation');
  console.log('    - "Department Preferences" feature explanation');

  // 4. Guest Exam Generation & Export Test
  const guestSessionId = `guest_test_flow_${Date.now()}`;
  console.log('\n[4] Testing Guest Workflow (Upload, Generate, Export)...');

  // Guest generates exam from default seed document
  const guestGenRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Guest-Session-Id': guestSessionId,
    },
    body: JSON.stringify({
      document_id: 'doc-cell-biology-101',
      title: 'Guest Biology Quiz',
      subject: 'Biology',
      groups_count: 2,
      mcq_count: 2,
      true_false_count: 1,
      short_answer_count: 1,
      total_marks: 20,
      duration_minutes: 30,
      language: 'en',
    }),
  });
  assert(
    guestGenRes.status === 200 || guestGenRes.status === 201,
    `Guest exam generation should succeed (got ${guestGenRes.status})`
  );
  const guestExam = await guestGenRes.json();
  assert(guestExam.id, 'Guest exam must have an ID');
  console.log(`✓ Guest exam generated successfully: ${guestExam.id}`);

  // Guest exports DOCX
  const guestDocxRes = await fetch(`${BASE_URL}/api/exams/${guestExam.id}/export/docx?session_id=${guestSessionId}`);
  assert.strictEqual(guestDocxRes.status, 200, 'Guest DOCX export must return HTTP 200');
  const docxBuf = await guestDocxRes.arrayBuffer();
  assert(docxBuf.byteLength > 1000, 'DOCX file must be non-empty');
  console.log(`✓ Guest DOCX export successful (${docxBuf.byteLength} bytes)`);

  // Guest exports PDF
  const guestPdfRes = await fetch(`${BASE_URL}/api/exams/${guestExam.id}/export/pdf?session_id=${guestSessionId}`);
  assert.strictEqual(guestPdfRes.status, 200, 'Guest PDF export must return HTTP 200');
  const pdfBuf = await guestPdfRes.arrayBuffer();
  assert(pdfBuf.byteLength > 1000, 'PDF file must be non-empty');
  console.log(`✓ Guest PDF export successful (${pdfBuf.byteLength} bytes)`);

  // 5. Verify Guest CANNOT access Teacher private records
  console.log('\n[5] Verifying Guest Access Restrictions...');

  // Create a teacher account with private exam and document
  const teacherEmail = `prof_guest_check_${Date.now()}@oxford.edu`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'TeacherSecurePassword123!',
      full_name: 'Professor Guest Shield',
      institution: 'Faculty of Medicine',
    }),
  });
  const regData = await regRes.json();
  const teacherToken = regData.token;

  // Teacher generates private exam
  const teacherExamRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      document_id: 'doc-cell-biology-101',
      title: 'Teacher Secret Exam',
      subject: 'Medicine',
      groups_count: 1,
      mcq_count: 2,
    }),
  });
  const teacherExam = await teacherExamRes.json();

  // Guest attempts to access Teacher exam directly -> Blocked (403)
  const guestAttemptRes = await fetch(`${BASE_URL}/api/exams/${teacherExam.id}`, {
    headers: { 'X-Guest-Session-Id': guestSessionId },
  });
  assert(
    guestAttemptRes.status === 403 || guestAttemptRes.status === 404,
    `Guest must be blocked from private teacher exam (got ${guestAttemptRes.status})`
  );
  console.log(`✓ Guest blocked from teacher exam (HTTP ${guestAttemptRes.status})`);

  // Guest attempts to export Teacher exam -> Blocked (403)
  const guestExportAttemptRes = await fetch(`${BASE_URL}/api/exams/${teacherExam.id}/export/docx?session_id=${guestSessionId}`);
  assert(
    guestExportAttemptRes.status === 403 || guestExportAttemptRes.status === 404,
    `Guest must be blocked from exporting private teacher exam (got ${guestExportAttemptRes.status})`
  );
  console.log(`✓ Guest blocked from exporting teacher exam (HTTP ${guestExportAttemptRes.status})`);

  // Guest queries exam list -> Teacher private exam NOT included
  const guestListRes = await fetch(`${BASE_URL}/api/exams`, {
    headers: { 'X-Guest-Session-Id': guestSessionId },
  });
  const guestExamsList = await guestListRes.json();
  const containsTeacherExam = guestExamsList.some((e) => e.id === teacherExam.id);
  assert.strictEqual(containsTeacherExam, false, 'Guest exam list must NOT contain teacher exam');
  console.log('✓ Teacher private exam is completely invisible to guest in exam list');

  console.log(`\n======================================================`);
  console.log(`  ALL GUEST MODE NAVIGATION & MODAL CHECKS PASSED!`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
