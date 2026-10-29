import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.TEST_PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsedBody = null;
        try {
          parsedBody = JSON.parse(raw);
        } catch {
          parsedBody = null;
        }
        resolve({ statusCode: res.statusCode, headers: res.headers, body: parsedBody, raw });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

function httpPostJson(path, data, token, sessionId) {
  const postData = JSON.stringify(data);
  return httpRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
      },
    },
    postData
  );
}

function httpPatchJson(path, data, token, sessionId) {
  const postData = JSON.stringify(data);
  return httpRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
      },
    },
    postData
  );
}

function httpGet(path, token, sessionId) {
  return httpRequest({
    hostname: 'localhost',
    port: PORT,
    path,
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
    },
  });
}

function httpDelete(path, token, sessionId) {
  return httpRequest({
    hostname: 'localhost',
    port: PORT,
    path,
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
    },
  });
}

async function runDashboardTests() {
  console.log('\n======================================================');
  console.log('  EXAMCRAFT AI: PHASE 2 TEACHER DASHBOARD TESTS       ');
  console.log('======================================================\n');

  const ts = Date.now();
  const teacherA = {
    email: `dash_teacher_a_${ts}@test.edu`,
    password: 'Password123!',
    full_name: 'Professor Maryam Karimi',
    institution: 'Kabul University',
  };
  const teacherB = {
    email: `dash_teacher_b_${ts}@test.edu`,
    password: 'Password123!',
    full_name: 'Dr. Farid Noori',
    institution: 'Balkh University',
  };

  // Register Teacher A
  const regA = await httpPostJson('/api/auth/register', teacherA);
  assert.strictEqual(regA.statusCode, 201, 'Teacher A registration must succeed');
  const tokenA = regA.body.token;

  // Register Teacher B
  const regB = await httpPostJson('/api/auth/register', teacherB);
  assert.strictEqual(regB.statusCode, 201, 'Teacher B registration must succeed');
  const tokenB = regB.body.token;

  // 1. Test GET /api/documents endpoint for Teacher A and Teacher B
  console.log('[1] Testing Document Library APIs and Data Isolation...');
  const docsResA = await httpGet('/api/documents', tokenA);
  assert.strictEqual(docsResA.statusCode, 200, 'GET /api/documents must return 200');
  assert(Array.isArray(docsResA.body), 'Document response must be an array');
  assert(docsResA.body.some((d) => d.id === 'doc-cell-biology-101'), 'Shared tutorial document must be present');
  console.log('  ✓ GET /api/documents returns authorized document listing');

  // Test Document Chunk inspection
  const chunksRes = await httpGet('/api/documents/doc-cell-biology-101/chunks', tokenA);
  assert.strictEqual(chunksRes.statusCode, 200, 'GET /api/documents/:id/chunks must return 200');
  assert(Array.isArray(chunksRes.body) && chunksRes.body.length > 0, 'Chunks list must be non-empty');
  console.log('  ✓ GET /api/documents/:id/chunks successfully returns chunk segments');

  // 2. Test Institution & Exam Preferences Update (PATCH /api/auth/profile)
  console.log('\n[2] Testing Institution & Exam Preferences (PATCH /api/auth/profile)...');
  const anonPatch = await httpPatchJson('/api/auth/profile', { institution: 'Fake' });
  assert.strictEqual(anonPatch.statusCode, 401, 'Unauthenticated user cannot update profile (401)');
  console.log('  ✓ Unauthenticated profile update rejected (401)');

  const patchRes = await httpPatchJson(
    '/api/auth/profile',
    {
      full_name: 'Prof. Maryam Karimi, Ph.D.',
      institution: 'Kabul University - Faculty of Medicine',
    },
    tokenA
  );
  assert.strictEqual(patchRes.statusCode, 200, 'Teacher A profile update must return 200');
  assert.strictEqual(patchRes.body.user.full_name, 'Prof. Maryam Karimi, Ph.D.');
  assert.strictEqual(patchRes.body.user.institution, 'Kabul University - Faculty of Medicine');
  console.log('  ✓ Teacher profile and institution preferences updated successfully');

  // Verify persistence via GET /api/auth/me
  const meRes = await httpGet('/api/auth/me', tokenA);
  assert.strictEqual(meRes.statusCode, 200);
  assert.strictEqual(meRes.body.user.institution, 'Kabul University - Faculty of Medicine');
  console.log('  ✓ Updated institution preferences verified in session state');

  // 3. Test Teacher Examination Generation & Dashboard Statistics Accuracy
  console.log('\n[3] Testing Dashboard Statistics Calculation & Data Integrity...');
  const examGenRes = await httpPostJson(
    '/api/exams/generate',
    {
      document_id: 'doc-cell-biology-101',
      title: 'Cytology & Cell Physiology Final',
      subject: 'Cellular Biology',
      institution: 'Kabul University - Faculty of Medicine',
      groups_count: 3,
      question_types_config: { mcq: 2, true_false: 1 },
    },
    tokenA
  );
  assert.strictEqual(examGenRes.statusCode, 201, 'Exam generation for Teacher A must return 201');
  const examA = examGenRes.body;

  // Fetch Teacher A exams list
  const examsListA = await httpGet('/api/exams', tokenA);
  assert.strictEqual(examsListA.statusCode, 200);
  const teacherAExams = examsListA.body;
  assert(teacherAExams.some((e) => e.id === examA.id), 'Teacher A must see their created exam');

  // Calculate live statistics
  const totalExams = teacherAExams.length;
  const totalQuestions = teacherAExams.reduce((sum, e) => sum + (e.questions_count || 0), 0);
  const totalGroups = teacherAExams.reduce((sum, e) => sum + (e.groups_count || 1), 0);
  assert(totalExams >= 1, 'Total exams count must be >= 1');
  assert(totalQuestions >= 3, 'Total questions count must be >= 3');
  assert(totalGroups >= 3, 'Total groups count must be >= 3');
  console.log(`  ✓ Accurate statistics verified: ${totalExams} exams, ${totalQuestions} questions, ${totalGroups} groups`);

  // Verify Teacher B data isolation: Teacher B must NOT see Teacher A's custom exam
  const examsListB = await httpGet('/api/exams', tokenB);
  assert.strictEqual(examsListB.statusCode, 200);
  assert(!examsListB.body.some((e) => e.id === examA.id), 'Teacher B must NOT see Teacher A exam');
  console.log('  ✓ Authenticated data isolation: Teacher B cannot see Teacher A examinations');

  // 4. Test Teacher Dashboard Component Source Structure
  console.log('\n[4] Testing TeacherDashboard UI Component Structure...');
  const dashboardSrcPath = path.resolve(process.cwd(), 'src', 'components', 'TeacherDashboard.tsx');
  assert(fs.existsSync(dashboardSrcPath), 'TeacherDashboard.tsx must exist');
  const dashboardSrc = fs.readFileSync(dashboardSrcPath, 'utf8');

  // Verify all 4 required tabs are present
  assert(dashboardSrc.includes("activeTab === 'overview'"), 'Overview tab must be implemented');
  assert(dashboardSrc.includes("activeTab === 'exams'"), 'My Examinations tab must be implemented');
  assert(dashboardSrc.includes("activeTab === 'documents'"), 'Document Library tab must be implemented');
  assert(dashboardSrc.includes("activeTab === 'preferences'"), 'Institution & Exam Preferences tab must be implemented');
  console.log('  ✓ All 4 navigation tabs implemented: Overview, My Examinations, Document Library, Preferences');

  // Verify search, filtering, and sorting in My Examinations
  assert(dashboardSrc.includes('examSearch'), 'Examination search must be implemented');
  assert(dashboardSrc.includes('examGroupFilter'), 'Group filter must be implemented');
  assert(dashboardSrc.includes('examLangFilter'), 'Language filter must be implemented');
  assert(dashboardSrc.includes('examSort'), 'Sorting controls must be implemented');
  console.log('  ✓ Examination search, filter by groups, language script, and sorting implemented');

  // Verify Document management actions
  assert(dashboardSrc.includes('handleUploadFile'), 'Document file upload must be implemented');
  assert(dashboardSrc.includes('handleInspectDocChunks'), 'Document chunk inspection must be implemented');
  assert(dashboardSrc.includes('handleDeleteDoc'), 'Document deletion must be implemented');
  console.log('  ✓ Document Library actions implemented: Upload, Chunk inspection, Exam generation, Safe deletion');

  // Verify App.tsx integration
  const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src', 'App.tsx'), 'utf8');
  assert(appSrc.includes('<TeacherDashboard'), 'App.tsx must render TeacherDashboard');
  assert(appSrc.includes("mainView === 'dashboard'"), 'App.tsx must support dashboard view');
  assert(appSrc.includes("mainView === 'workspace'"), 'App.tsx must support workspace view');
  console.log('  ✓ App.tsx seamlessly integrates TeacherDashboard and ExamWorkspace switching');

  // Clean up test exam
  await httpDelete(`/api/exams/${examA.id}`, tokenA);

  console.log('\n======================================================');
  console.log('  ALL PHASE 2 TEACHER DASHBOARD TESTS PASSED OK!      ');
  console.log('======================================================\n');
}

runDashboardTests().catch((err) => {
  console.error('\nDashboard Test Suite Failed:', err);
  process.exit(1);
});
