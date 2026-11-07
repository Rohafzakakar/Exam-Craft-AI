import assert from 'node:assert';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: TEACHER DASHBOARD & AUTH ISOLATION TEST`);
  console.log(`======================================================\n`);

  // Wait for server to be responsive
  let healthy = false;
  for (let i = 0; i < 15; i++) {
    try {
      const hRes = await fetch(`${BASE_URL}/api/health`);
      if (hRes.ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  assert(healthy, 'Dev server must be healthy at ' + BASE_URL);
  console.log('✓ Dev server healthy on port ' + PORT);

  // -------------------------------------------------------------------------
  // 1. Teacher A Registration & Login
  // -------------------------------------------------------------------------
  const teacherAEmail = `prof_alicia_${Date.now()}@oxford.ac.uk`;
  const regARes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherAEmail,
      password: 'TeacherPassword123!',
      full_name: 'Prof. Alicia Stone',
      institution: 'Department of Biochemistry',
    }),
  });
  assert(regARes.status === 200 || regARes.status === 201, `Teacher A registration should succeed (got ${regARes.status})`);
  const regAData = await regARes.json();
  const tokenA = regAData.token;
  const userAId = regAData.user.id;
  assert(tokenA && userAId, 'Token and User ID must be returned for Teacher A');
  console.log('✓ 1. Teacher A registration succeeded');

  // Verify Login with Teacher A
  const loginARes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherAEmail,
      password: 'TeacherPassword123!',
    }),
  });
  assert.strictEqual(loginARes.status, 200, 'Teacher A login should return 200');
  const loginAData = await loginARes.json();
  assert.strictEqual(loginAData.user.id, userAId, 'Logged in user ID must match registered ID');
  console.log('✓ 2. Teacher A login verification succeeded');

  // Verify /api/auth/me for Teacher A
  const meARes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(meARes.status, 200);
  const meAData = await meARes.json();
  assert.strictEqual(meAData.authenticated, true, 'Teacher A must be authenticated');
  assert.strictEqual(meAData.is_guest, false, 'Teacher A must not be marked guest');
  console.log('✓ 3. Teacher A /api/auth/me verification succeeded');

  // -------------------------------------------------------------------------
  // 2. Teacher B Registration
  // -------------------------------------------------------------------------
  const teacherBEmail = `dr_brian_${Date.now()}@cambridge.ac.uk`;
  const regBRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherBEmail,
      password: 'TeacherPassword456!',
      full_name: 'Dr. Brian Miller',
      institution: 'School of Chemical Sciences',
    }),
  });
  assert(regBRes.status === 200 || regBRes.status === 201, `Teacher B registration should succeed (got ${regBRes.status})`);
  const regBData = await regBRes.json();
  const tokenB = regBData.token;
  const userBId = regBData.user.id;
  assert(tokenB && userBId, 'Token and User ID must be returned for Teacher B');
  console.log('✓ 4. Teacher B registration succeeded');

  // -------------------------------------------------------------------------
  // 3. Document Upload & Generation by Teacher A
  // -------------------------------------------------------------------------
  const docAText = `
Advanced Cellular Thermodynamics and Enzyme Kinetics
Professor Alicia Stone, Department of Biochemistry

1. Principles of Gibbs Free Energy
In biological systems, biochemical transformations occur under constant temperature and pressure conditions.
Standard free energy change indicates whether a chemical reaction proceeds spontaneously without external work.
Exergonic reactions have negative delta G values and release free energy to surrounding cellular aqueous environments.
Endergonic reactions have positive delta G values and require stoichiometric energy coupling with adenosine triphosphate hydrolysis.
Equilibrium constants directly quantify the ratio of product activities to reactant activities at thermodynamic balance.

2. Michaelis-Menten Kinetics and Catalysis
The Michaelis constant represents the substrate concentration at which initial reaction velocity reaches half of maximal velocity.
A smaller value of the Michaelis constant indicates higher affinity between enzyme active sites and target substrates.
Competitive inhibitors bind reversibly to the catalytic active site and increase the apparent Michaelis constant without altering maximal velocity.
Non-competitive inhibitors bind to allosteric regulatory sites and decrease maximal velocity while maintaining an unchanged Michaelis constant.
Catalytic efficiency is calculated as the mathematical ratio of turnover number to the Michaelis constant.
Lineweaver-Burk double reciprocal plots produce linear graphical representations where the vertical axis intercept corresponds to the inverse of maximal velocity.
Allosteric enzymes exhibit sigmoidal cooperative velocity curves described mathematically by Hill cooperativity coefficients.
  `.trim();

  const formDataA = new FormData();
  formDataA.append('file', new Blob([docAText], { type: 'text/plain' }), 'cellular_thermodynamics.txt');

  const uploadARes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: formDataA,
  });
  assert(uploadARes.status === 200 || uploadARes.status === 201, `Teacher A document upload must succeed (got ${uploadARes.status})`);
  const docA = await uploadARes.json();
  assert(docA.id, 'Document A must have an id');
  assert.strictEqual(docA.user_id, userAId, 'Document A must belong to Teacher A');
  console.log('✓ 5. Teacher A uploaded document successfully: ' + docA.id);

  // Generate Exam A under Teacher A
  const genARes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      document_id: docA.id,
      title: 'Thermodynamics Midterm Exam',
      subject: 'Biochemistry',
      institution: 'Department of Biochemistry',
      teacher_name: 'Prof. Alicia Stone',
      duration_minutes: 90,
      total_marks: 20,
      groups_count: 2,
      question_types_config: { mcq: 1, true_false: 1 },
    }),
  });
  if (!genARes.ok) {
    const errBody = await genARes.json().catch(() => ({}));
    console.error('Exam generation error detail:', errBody);
  }
  assert(genARes.status === 200 || genARes.status === 201, `Teacher A exam generation must succeed (got ${genARes.status})`);
  const examA = await genARes.json();
  assert(examA.id, 'Exam A must have an ID');
  assert.strictEqual(examA.user_id, userAId, 'Exam A must be owned by Teacher A');
  console.log('✓ 6. Teacher A generated exam successfully: ' + examA.id);

  // -------------------------------------------------------------------------
  // 4. Data Isolation: Teacher B and Guest CANNOT access Teacher A's assets
  // -------------------------------------------------------------------------
  const guestSessionId = `guest_test_${Date.now()}`;

  // Guest attempts to get Exam A details -> Must be 403 Forbidden!
  const guestExamARes = await fetch(`${BASE_URL}/api/exams/${examA.id}`, {
    headers: {
      Authorization: `Bearer ${guestSessionId}`,
      'X-Guest-Session-Id': guestSessionId,
    },
  });
  assert.strictEqual(guestExamARes.status, 403, 'Guest must receive 403 when requesting Teacher A exam');
  console.log('✓ 7. Guest blocked from Teacher A exam (403 Forbidden)');

  // Teacher B attempts to get Exam A details -> Must be 403 Forbidden!
  const teacherBExamARes = await fetch(`${BASE_URL}/api/exams/${examA.id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(teacherBExamARes.status, 403, 'Teacher B must receive 403 when requesting Teacher A exam');
  console.log('✓ 8. Teacher B blocked from Teacher A exam (403 Forbidden)');

  // Guest attempts to get Document A details -> Must be 403 Forbidden!
  const guestDocARes = await fetch(`${BASE_URL}/api/documents/${docA.id}`, {
    headers: {
      Authorization: `Bearer ${guestSessionId}`,
      'X-Guest-Session-Id': guestSessionId,
    },
  });
  assert.strictEqual(guestDocARes.status, 403, 'Guest must receive 403 when requesting Teacher A document');
  console.log('✓ 9. Guest blocked from Teacher A document (403 Forbidden)');

  // Teacher B attempts to get Document A chunks -> Must be 403 Forbidden!
  const teacherBDocAChunksRes = await fetch(`${BASE_URL}/api/documents/${docA.id}/chunks`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(teacherBDocAChunksRes.status, 403, 'Teacher B must receive 403 when requesting Teacher A document chunks');
  console.log('✓ 10. Teacher B blocked from Teacher A document chunks (403 Forbidden)');

  // Guest attempts to export Teacher A exam to DOCX/PDF -> Must be 403 Forbidden!
  const guestExportDocxRes = await fetch(`${BASE_URL}/api/exams/${examA.id}/export/docx?target=both`, {
    headers: {
      Authorization: `Bearer ${guestSessionId}`,
      'X-Guest-Session-Id': guestSessionId,
    },
  });
  assert.strictEqual(guestExportDocxRes.status, 403, 'Guest export of teacher exam must return 403');
  console.log('✓ 11. Guest blocked from exporting Teacher A exam (403 Forbidden)');

  // Guest attempts to delete Teacher A exam -> Must be 403 Forbidden!
  const guestDeleteRes = await fetch(`${BASE_URL}/api/exams/${examA.id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${guestSessionId}`,
      'X-Guest-Session-Id': guestSessionId,
    },
  });
  assert.strictEqual(guestDeleteRes.status, 403, 'Guest delete of teacher exam must return 403');
  console.log('✓ 12. Guest blocked from deleting Teacher A exam (403 Forbidden)');

  // -------------------------------------------------------------------------
  // 5. Teacher A Ownership & Management
  // -------------------------------------------------------------------------
  // Teacher A CAN access their own exam
  const teacherAExamARes = await fetch(`${BASE_URL}/api/exams/${examA.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(teacherAExamARes.status, 200, 'Teacher A must be able to view their own exam');
  const reopenedExam = await teacherAExamARes.json();
  assert.strictEqual(reopenedExam.id, examA.id);
  assert.strictEqual(reopenedExam.groups.length, 2);
  console.log('✓ 13. Teacher A successfully reopened exam in workspace');

  // Teacher A queries exams list (Dashboard & History)
  const teacherAExamsListRes = await fetch(`${BASE_URL}/api/exams`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(teacherAExamsListRes.status, 200);
  const teacherAExams = await teacherAExamsListRes.json();
  const hasExamA = teacherAExams.some((e) => e.id === examA.id);
  assert(hasExamA, 'Teacher A exams list must include Exam A');
  console.log('✓ 14. Teacher A dashboard correctly lists owned exam');

  // Teacher B queries exams list (Must NOT see Exam A)
  const teacherBExamsListRes = await fetch(`${BASE_URL}/api/exams`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(teacherBExamsListRes.status, 200);
  const teacherBExams = await teacherBExamsListRes.json();
  const teacherBHasExamA = teacherBExams.some((e) => e.id === examA.id);
  assert(!teacherBHasExamA, 'Teacher B MUST NOT see Teacher A exam');
  console.log('✓ 15. Teacher B does not see Teacher A exam in their dashboard');

  // Guest queries exams list (Must NOT see Exam A)
  const guestExamsListRes = await fetch(`${BASE_URL}/api/exams`, {
    headers: {
      Authorization: `Bearer ${guestSessionId}`,
      'X-Guest-Session-Id': guestSessionId,
    },
  });
  assert.strictEqual(guestExamsListRes.status, 200);
  const guestExams = await guestExamsListRes.json();
  const guestHasExamA = guestExams.some((e) => e.id === examA.id);
  assert(!guestHasExamA, 'Guest MUST NOT see Teacher A exam');
  console.log('✓ 16. Guest does not see Teacher A exam in history');

  // Teacher A queries document list
  const teacherADocsRes = await fetch(`${BASE_URL}/api/documents`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(teacherADocsRes.status, 200);
  const teacherADocs = await teacherADocsRes.json();
  assert(teacherADocs.some((d) => d.id === docA.id), 'Teacher A document library must contain Doc A');
  console.log('✓ 17. Teacher A document library lists Doc A');

  // Guest queries document list (Must NOT see Doc A)
  const guestDocsRes = await fetch(`${BASE_URL}/api/documents`, {
    headers: {
      Authorization: `Bearer ${guestSessionId}`,
      'X-Guest-Session-Id': guestSessionId,
    },
  });
  assert.strictEqual(guestDocsRes.status, 200);
  const guestDocs = await guestDocsRes.json();
  assert(!guestDocs.some((d) => d.id === docA.id), 'Guest must NEVER see Doc A');
  console.log('✓ 18. Guest does not see Teacher A document in library');

  // -------------------------------------------------------------------------
  // 6. Seed Exam Access for Demo/Tutorial
  // -------------------------------------------------------------------------
  // All users (Teacher A, Teacher B, Guest) can view default seed exam for demo purposes
  const seedGuestRes = await fetch(`${BASE_URL}/api/exams/exam-cell-bio-midterm`, {
    headers: {
      Authorization: `Bearer ${guestSessionId}`,
      'X-Guest-Session-Id': guestSessionId,
    },
  });
  assert.strictEqual(seedGuestRes.status, 200, 'Default seed exam must remain accessible for demo');

  // But seed exam cannot be deleted
  const deleteSeedRes = await fetch(`${BASE_URL}/api/exams/exam-cell-bio-midterm`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(deleteSeedRes.status, 403, 'Seed exam must not be deletable');
  console.log('✓ 19. Seed exam preserved and protected from deletion');

  // -------------------------------------------------------------------------
  // 7. Profile & Institution Preferences
  // -------------------------------------------------------------------------
  // Teacher A updates preferences
  const patchProfileRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      full_name: 'Professor Alicia Stone DPhil',
      institution: 'Oxford Institute of Molecular Sciences',
    }),
  });
  assert.strictEqual(patchProfileRes.status, 200, 'Teacher profile update must succeed');
  const patchProfileData = await patchProfileRes.json();
  assert.strictEqual(patchProfileData.user.full_name, 'Professor Alicia Stone DPhil');
  assert.strictEqual(patchProfileData.user.institution, 'Oxford Institute of Molecular Sciences');
  console.log('✓ 20. Teacher profile and institution preferences updated successfully');

  // Guest attempts to update profile -> 401 Unauthorized
  const guestProfileRes = await fetch(`${BASE_URL}/api/auth/profile`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${guestSessionId}`,
    },
    body: JSON.stringify({
      full_name: 'Hacker',
      institution: 'Rogue',
    }),
  });
  assert.strictEqual(guestProfileRes.status, 401, 'Guest profile update must be rejected with 401');
  console.log('✓ 21. Guest update profile rejected (401 Unauthorized)');

  // -------------------------------------------------------------------------
  // 8. Exam Deletion by Owner
  // -------------------------------------------------------------------------
  const deleteExamARes = await fetch(`${BASE_URL}/api/exams/${examA.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(deleteExamARes.status, 204, 'Owner deletion of exam must return 204');

  const verifyDeletedRes = await fetch(`${BASE_URL}/api/exams/${examA.id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(verifyDeletedRes.status, 404, 'Deleted exam should return 404');
  console.log('✓ 22. Teacher A exam deleted and confirmed removed');

  console.log(`\n======================================================`);
  console.log(`  ALL TEACHER DASHBOARD & AUTH TESTS PASSED (22/22)`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
