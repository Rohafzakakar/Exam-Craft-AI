import assert from 'node:assert';
import http from 'node:http';
import AdmZip from 'adm-zip';

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

function httpPutJson(path, data, token, sessionId) {
  const postData = JSON.stringify(data);
  return httpRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'PUT',
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

function httpUploadDocx(path, filename, paragraphs, token, sessionId) {
  const zip = new AdmZip();
  let documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>`;
  for (const p of paragraphs) {
    documentXml += `
    <w:p>
      <w:r>
        <w:t>${p}</w:t>
      </w:r>
    </w:p>`;
  }
  documentXml += `
  </w:body>
</w:document>`;

  zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`, 'utf8')
  );
  zip.addFile(
    '_rels/.rels',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, 'utf8')
  );

  const fileBuffer = zip.toBuffer();
  const boundary = '----SecurityBoundary' + Math.random().toString(36).slice(2);
  const crlf = '\r\n';
  let header = `--${boundary}${crlf}`;
  header += `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}`;
  header += `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document${crlf}${crlf}`;
  let footer = `${crlf}--${boundary}--${crlf}`;

  const payload = Buffer.concat([
    Buffer.from(header, 'utf8'),
    fileBuffer,
    Buffer.from(footer, 'utf8'),
  ]);

  return httpRequest(
    {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
      },
    },
    payload
  );
}

async function runSecurityTests() {
  console.log('\n======================================================');
  console.log('  EXAMCRAFT AI: PHASE 1 SECURITY HARDENING TESTS      ');
  console.log('======================================================\n');

  const ts = Date.now();
  const paragraphs = [
    'حاکمیت قانون ضامن برابری کلیه اتباع در برابر قانون بدون تبعیض نژادی یا طبقاتی است.',
    'تفکیک قوا میان قوای سه‌گانه مقننه و مجریه و قضائیه مانع از استبداد سیاسی و تمرکز قدرت می‌گردد.',
    'انتخابات آزاد و ادواری از ارکان بنیادین دموکراسی و تعیین سرنوشت ملت‌ها به شمار می‌رود.',
    'رسانه‌های مستقل و جامعه مدنی فعال نظارت عمومی بر کارگزاران را تحکیم می‌بخشند.',
  ];

  // =========================================================================
  // 1. Cross-Teacher Authorization Tests
  // =========================================================================
  console.log('[1] Testing Cross-Teacher Authorization & Ownership...');

  // Register Teacher 1
  const t1Res = await httpPostJson('/api/auth/register', {
    email: `teacher1_${ts}@test.edu`,
    password: 'password123',
    full_name: 'Dr. Teacher One',
    institution: 'Faculty of Law',
  });
  assert.strictEqual(t1Res.statusCode, 201, 'Teacher 1 registration must succeed');
  const token1 = t1Res.body.token;

  // Register Teacher 2
  const t2Res = await httpPostJson('/api/auth/register', {
    email: `teacher2_${ts}@test.edu`,
    password: 'password123',
    full_name: 'Prof. Teacher Two',
    institution: 'Faculty of Economics',
  });
  assert.strictEqual(t2Res.statusCode, 201, 'Teacher 2 registration must succeed');
  const token2 = t2Res.body.token;

  // Teacher 1 uploads a document
  const up1Res = await httpUploadDocx('/api/documents/upload', 'law_lecture.docx', paragraphs, token1);
  assert(up1Res.statusCode === 200 || up1Res.statusCode === 201, 'Doc upload must succeed');
  const doc1Id = up1Res.body.id;

  // Teacher 1 creates Exam 1
  const genRes1 = await httpPostJson(
    '/api/exams/generate',
    {
      title: 'امتحان حقوق اساسی استاد یک',
      subject: 'حقوق',
      document_id: doc1Id,
      groups_count: 2,
      question_types_config: { mcq: 1, true_false: 1 },
    },
    token1
  );
  assert.strictEqual(genRes1.statusCode, 201, 'Teacher 1 exam generation must succeed');
  const exam1 = genRes1.body;
  const exam1Q = exam1.groups[0].questions[0];

  // Attack 1: Teacher 2 attempts to PATCH Teacher 1's exam
  const patchCrossTeacher = await httpPatchJson(`/api/exams/${exam1.id}`, { title: 'Hacked Title' }, token2);
  assert.strictEqual(patchCrossTeacher.statusCode, 403, 'Cross-teacher PATCH must return 403 Forbidden');
  console.log('  ✓ Teacher 2 cannot PATCH Teacher 1 exam (403 Forbidden)');

  // Attack 2: Teacher 2 attempts to DELETE Teacher 1's exam
  const delCrossTeacher = await httpDelete(`/api/exams/${exam1.id}`, token2);
  assert.strictEqual(delCrossTeacher.statusCode, 403, 'Cross-teacher DELETE must return 403 Forbidden');
  console.log('  ✓ Teacher 2 cannot DELETE Teacher 1 exam (403 Forbidden)');

  // Attack 3: Teacher 2 attempts to export Teacher 1's DOCX
  const docxCrossTeacher = await httpGet(`/api/exams/${exam1.id}/export/docx`, token2);
  assert.strictEqual(docxCrossTeacher.statusCode, 403, 'Cross-teacher DOCX export must return 403 Forbidden');
  console.log('  ✓ Teacher 2 cannot export Teacher 1 DOCX (403 Forbidden)');

  // Attack 4: Teacher 2 attempts to export Teacher 1's PDF
  const pdfCrossTeacher = await httpGet(`/api/exams/${exam1.id}/export/pdf`, token2);
  assert.strictEqual(pdfCrossTeacher.statusCode, 403, 'Cross-teacher PDF export must return 403 Forbidden');
  console.log('  ✓ Teacher 2 cannot export Teacher 1 PDF (403 Forbidden)');

  // Attack 5: Teacher 2 attempts to edit Teacher 1's question
  const putQCrossTeacher = await httpPutJson(
    `/api/exams/${exam1.id}/questions/${exam1Q.id}`,
    { marks: 99 },
    token2
  );
  assert.strictEqual(putQCrossTeacher.statusCode, 403, 'Cross-teacher PUT question must return 403 Forbidden');
  console.log('  ✓ Teacher 2 cannot edit Teacher 1 question (403 Forbidden)');

  // Attack 6: Teacher 2 attempts to delete Teacher 1's question
  const delQCrossTeacher = await httpDelete(`/api/exams/${exam1.id}/questions/${exam1Q.id}`, token2);
  assert.strictEqual(delQCrossTeacher.statusCode, 403, 'Cross-teacher DELETE question must return 403 Forbidden');
  console.log('  ✓ Teacher 2 cannot delete Teacher 1 question (403 Forbidden)');

  // Attack 7: Teacher 2 attempts to regenerate Teacher 1's question
  const regenQCrossTeacher = await httpPostJson(
    `/api/exams/${exam1.id}/questions/${exam1Q.id}/regenerate`,
    { instructions: 'test' },
    token2
  );
  assert.strictEqual(regenQCrossTeacher.statusCode, 403, 'Cross-teacher question regenerate must return 403 Forbidden');
  console.log('  ✓ Teacher 2 cannot regenerate Teacher 1 question (403 Forbidden)');

  // Legitimate Teacher 1 operations
  const patchOwnerRes = await httpPatchJson(`/api/exams/${exam1.id}`, { title: 'عنوان اصلاح شده' }, token1);
  assert.strictEqual(patchOwnerRes.statusCode, 200, 'Owner teacher PATCH must succeed with 200');
  assert.strictEqual(patchOwnerRes.body.title, 'عنوان اصلاح شده');
  console.log('  ✓ Teacher 1 can legitimately PATCH own exam (200 OK)');

  const docxOwnerRes = await httpGet(`/api/exams/${exam1.id}/export/docx`, token1);
  assert.strictEqual(docxOwnerRes.statusCode, 200, 'Owner teacher DOCX export must succeed');
  console.log('  ✓ Teacher 1 can legitimately export own DOCX (200 OK)');

  const pdfOwnerRes = await httpGet(`/api/exams/${exam1.id}/export/pdf`, token1);
  assert.strictEqual(pdfOwnerRes.statusCode, 200, 'Owner teacher PDF export must succeed');
  console.log('  ✓ Teacher 1 can legitimately export own PDF (200 OK)');

  // =========================================================================
  // 2. Cross-Guest Session Isolation Tests
  // =========================================================================
  console.log('\n[2] Testing Cross-Guest Session Isolation...');
  const guestA = `guest_sec_test_A_${ts}`;
  const guestB = `guest_sec_test_B_${ts}`;

  // Guest A uploads document
  const upDocARes = await httpUploadDocx('/api/documents/upload', 'guest_a_notes.docx', paragraphs, null, guestA);
  assert(upDocARes.statusCode === 200 || upDocARes.statusCode === 201, 'Guest A doc upload must succeed');
  const docAId = upDocARes.body.id;

  // Guest A generates Exam A
  const genExamARes = await httpPostJson(
    '/api/exams/generate',
    {
      title: 'امتحان مهمان الف',
      subject: 'علوم',
      document_id: docAId,
      groups_count: 2,
      question_types_config: { mcq: 1, true_false: 1 },
    },
    null,
    guestA
  );
  assert.strictEqual(genExamARes.statusCode, 201, 'Guest A exam generation must succeed');
  const examA = genExamARes.body;
  const examAQ = examA.groups[0].questions[0];

  // Attack 8: Guest B attempts to delete Guest A document
  const delDocCrossGuest = await httpDelete(`/api/documents/${docAId}`, null, guestB);
  assert.strictEqual(delDocCrossGuest.statusCode, 403, 'Cross-guest document delete must return 403 Forbidden');
  console.log('  ✓ Guest B cannot DELETE Guest A document (403 Forbidden)');

  // Attack 9: Guest B attempts to PATCH Guest A exam
  const patchCrossGuest = await httpPatchJson(`/api/exams/${examA.id}`, { title: 'Guest B Tamper' }, null, guestB);
  assert.strictEqual(patchCrossGuest.statusCode, 403, 'Cross-guest exam PATCH must return 403 Forbidden');
  console.log('  ✓ Guest B cannot PATCH Guest A exam (403 Forbidden)');

  // Attack 10: Guest B attempts to DELETE Guest A exam
  const delExamCrossGuest = await httpDelete(`/api/exams/${examA.id}`, null, guestB);
  assert.strictEqual(delExamCrossGuest.statusCode, 403, 'Cross-guest exam DELETE must return 403 Forbidden');
  console.log('  ✓ Guest B cannot DELETE Guest A exam (403 Forbidden)');

  // Attack 11: Guest B attempts to export Guest A DOCX / PDF
  const docxCrossGuest = await httpGet(`/api/exams/${examA.id}/export/docx`, null, guestB);
  assert.strictEqual(docxCrossGuest.statusCode, 403, 'Cross-guest DOCX export must return 403 Forbidden');
  const pdfCrossGuest = await httpGet(`/api/exams/${examA.id}/export/pdf`, null, guestB);
  assert.strictEqual(pdfCrossGuest.statusCode, 403, 'Cross-guest PDF export must return 403 Forbidden');
  console.log('  ✓ Guest B cannot export Guest A DOCX or PDF (403 Forbidden)');

  // Attack 12: Guest B attempts to edit question in Guest A exam
  const putQCrossGuest = await httpPutJson(
    `/api/exams/${examA.id}/questions/${examAQ.id}`,
    { marks: 5 },
    null,
    guestB
  );
  assert.strictEqual(putQCrossGuest.statusCode, 403, 'Cross-guest question edit must return 403 Forbidden');
  console.log('  ✓ Guest B cannot edit Guest A question (403 Forbidden)');

  // Legitimate Guest A operations
  const patchGuestARes = await httpPatchJson(`/api/exams/${examA.id}`, { title: 'عنوان جدید مهمان الف' }, null, guestA);
  assert.strictEqual(patchGuestARes.statusCode, 200, 'Owner guest can PATCH own exam');
  assert.strictEqual(patchGuestARes.body.title, 'عنوان جدید مهمان الف');

  const docxGuestARes = await httpGet(`/api/exams/${examA.id}/export/docx`, null, guestA);
  assert.strictEqual(docxGuestARes.statusCode, 200, 'Owner guest can export DOCX');

  const delExamOwnerRes = await httpDelete(`/api/exams/${examA.id}`, null, guestA);
  assert.strictEqual(delExamOwnerRes.statusCode, 204, 'Owner guest can DELETE own exam');

  const delDocOwnerRes = await httpDelete(`/api/documents/${docAId}`, null, guestA);
  assert.strictEqual(delDocOwnerRes.statusCode, 204, 'Owner guest can DELETE own document');
  console.log('  ✓ Guest A can legitimately manage and delete own records (200 / 204)');

  // =========================================================================
  // 3. Question-to-Exam Ownership Verification
  // =========================================================================
  console.log('\n[3] Testing Question-to-Exam Ownership Verification...');

  // Teacher 1 creates Exam 2
  const genRes2 = await httpPostJson(
    '/api/exams/generate',
    {
      title: 'امتحان حقوق اساسی دوم استاد یک',
      subject: 'حقوق',
      document_id: doc1Id,
      groups_count: 2,
      question_types_config: { mcq: 1, true_false: 1 },
    },
    token1
  );
  assert.strictEqual(genRes2.statusCode, 201, 'Exam 2 generation must succeed');
  const exam2 = genRes2.body;
  const exam2Q = exam2.groups[0].questions[0];

  // Attack 13: Attempt to edit Question 2 using Exam 1's route URL
  // (/api/exams/Exam1/questions/Exam2Question)
  const crossExamPut = await httpPutJson(
    `/api/exams/${exam1.id}/questions/${exam2Q.id}`,
    { marks: 10 },
    token1
  );
  assert.strictEqual(crossExamPut.statusCode, 404, 'Question belonging to Exam 2 cannot be edited via Exam 1 route (404)');
  assert(crossExamPut.body.detail.includes('Question not found in this examination'));
  console.log('  ✓ Question from Exam 2 rejected when targeted under Exam 1 URL (404)');

  // Attack 14: Attempt to delete Question 2 using Exam 1's route URL
  const crossExamDel = await httpDelete(`/api/exams/${exam1.id}/questions/${exam2Q.id}`, token1);
  assert.strictEqual(crossExamDel.statusCode, 404, 'Question belonging to Exam 2 cannot be deleted via Exam 1 route (404)');
  console.log('  ✓ Question from Exam 2 cannot be deleted via Exam 1 route (404)');

  // Attack 15: Attempt to regenerate Question 2 using Exam 1's route URL
  const crossExamRegen = await httpPostJson(
    `/api/exams/${exam1.id}/questions/${exam2Q.id}/regenerate`,
    { instructions: 'test' },
    token1
  );
  assert.strictEqual(crossExamRegen.statusCode, 404, 'Question belonging to Exam 2 cannot be regenerated via Exam 1 route (404)');
  console.log('  ✓ Question from Exam 2 cannot be regenerated via Exam 1 route (404)');

  // =========================================================================
  // 4. Seed Tutorial Exam and Document Protection
  // =========================================================================
  console.log('\n[4] Testing Seed Tutorial Exam & Document Protection...');

  const delSeedExam = await httpDelete('/api/exams/exam-cell-bio-midterm', token1);
  assert.strictEqual(delSeedExam.statusCode, 403, 'Seed exam deletion must be forbidden (403)');
  assert(delSeedExam.body && delSeedExam.body.detail.includes('Cannot delete default seed examination'));
  console.log('  ✓ Seed exam cannot be deleted (403 Forbidden)');

  // Attempt to patch seed exam
  const patchSeedExam = await httpPatchJson('/api/exams/exam-cell-bio-midterm', { title: 'Overwritten' }, token1);
  assert.strictEqual(patchSeedExam.statusCode, 403, 'Seed exam modification must be forbidden (403)');
  console.log('  ✓ Seed exam metadata cannot be modified (403 Forbidden)');

  // Attempt to edit seed exam questions
  const putSeedQ = await httpPutJson('/api/exams/exam-cell-bio-midterm/questions/q-a-1', { marks: 50 }, token1);
  assert.strictEqual(putSeedQ.statusCode, 403, 'Seed question edit must be forbidden (403)');
  console.log('  ✓ Seed exam question cannot be edited (403 Forbidden)');

  // Attempt to delete seed exam questions
  const delSeedQ = await httpDelete('/api/exams/exam-cell-bio-midterm/questions/q-a-1', token1);
  assert.strictEqual(delSeedQ.statusCode, 403, 'Seed question delete must be forbidden (403)');
  console.log('  ✓ Seed exam question cannot be deleted (403 Forbidden)');

  // Attempt to delete seed document
  const delSeedDoc = await httpDelete('/api/documents/doc-cell-biology-101', token1);
  assert.strictEqual(delSeedDoc.statusCode, 403, 'Seed document delete must be forbidden (403)');
  console.log('  ✓ Seed document cannot be deleted (403 Forbidden)');

  // Clean up created test exams for Teacher 1
  await httpDelete(`/api/exams/${exam1.id}`, token1);
  await httpDelete(`/api/exams/${exam2.id}`, token1);
  await httpDelete(`/api/documents/${doc1Id}`, token1);

  console.log('\n======================================================');
  console.log('  ALL PHASE 1 SECURITY HARDENING TESTS PASSED OK!     ');
  console.log('======================================================\n');
}

runSecurityTests().catch((err) => {
  console.error('\n❌ Security tests failed:', err);
  process.exit(1);
});
