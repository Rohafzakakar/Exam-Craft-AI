import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, pathUrl, { body = null, token = null, sessionId = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${BASE_URL}${pathUrl}`);
    const reqHeaders = { ...headers };
    if (token) reqHeaders['Authorization'] = `Bearer ${token}`;
    if (sessionId) reqHeaders['X-Guest-Session-ID'] = sessionId;

    let payload = null;
    if (body !== null && body !== undefined) {
      if (Buffer.isBuffer(body)) {
        payload = body;
      } else {
        payload = Buffer.from(JSON.stringify(body), 'utf8');
        if (!reqHeaders['Content-Type']) {
          reqHeaders['Content-Type'] = 'application/json';
        }
      }
      reqHeaders['Content-Length'] = payload.length;
    }

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const raw = buffer.toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            json = null;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            buffer,
            raw,
            body: json,
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function uploadTextDocument(filename, textContent, { token = null, sessionId = null } = {}) {
  const boundary = '----ExamCraftRepairTest' + Math.random().toString(36).slice(2);
  const crlf = '\r\n';
  const header =
    `--${boundary}${crlf}` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}` +
    `Content-Type: text/plain${crlf}${crlf}`;
  const footer =
    (sessionId && !token
      ? `${crlf}--${boundary}${crlf}Content-Disposition: form-data; name="session_id"${crlf}${crlf}${sessionId}`
      : '') +
    `${crlf}--${boundary}--${crlf}`;

  const bodyBuf = Buffer.concat([
    Buffer.from(header, 'utf8'),
    Buffer.from(textContent, 'utf8'),
    Buffer.from(footer, 'utf8'),
  ]);

  return request('POST', '/api/documents/upload', {
    body: bodyBuf,
    token,
    sessionId,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  });
}

const SAMPLE_DOC_CONTENT = [
  'Photosynthesis is the biochemical process by which chloroplasts in plant cells convert solar light energy into chemical energy stored in glucose molecules.',
  'Chlorophyll pigments embedded in thylakoid membranes absorb red and blue wavelengths while reflecting green light across leaf tissues.',
  'During light-dependent reactions, photolysis splits water molecules to release oxygen gas and supply electrons to Photosystem II and Photosystem I.',
  'Plastoquinone transfers excited electrons along the cytochrome b6f complex to build a proton gradient across the thylakoid membrane.',
  'ATP synthase utilizes the proton electrochemical gradient across the thylakoid lumen to phosphorylate ADP into adenosine triphosphate.',
  'The Calvin cycle operates inside the chloroplast stroma, where the enzyme RuBisCO fixes atmospheric carbon dioxide onto ribulose bisphosphate.',
  'Three turns of the Calvin cycle generate net glyceraldehyde-3-phosphate molecules that plants assemble into sucrose and insoluble starch polymers.',
  '--- PAGE 2 ---',
  'Cellular respiration breaks down glucose in mitochondria through glycolysis, the pyruvate dehydrogenase complex, the citric acid cycle, and oxidative phosphorylation.',
  'Glycolysis occurs in the cytoplasm, converting one six-carbon glucose molecule into two three-carbon pyruvate molecules with a net yield of two ATP and two NADH.',
  'Pyruvate enters the mitochondrial matrix through specific carrier proteins and undergoes oxidative decarboxylation into acetyl-CoA.',
  'Within the mitochondrial matrix, the citric acid cycle oxidizes acetyl-CoA, releasing carbon dioxide while reducing NAD+ and FAD to high-energy electron carriers.',
  'The inner mitochondrial membrane houses protein complexes I through IV that pump protons into the intermembrane space as electrons flow toward molecular oxygen.',
  'Chemiosmosis couples proton diffusion back through complex V ATP synthase with the synthesis of roughly thirty-two molecules of ATP per glucose.',
  'Fermentation regenerates NAD+ under anaerobic conditions by reducing pyruvate into lactate in animal muscles or ethanol in yeast cells.',
  '--- PAGE 3 ---',
  'Deoxyribonucleic acid stores hereditary genetic instructions inside double-stranded antiparallel polynucleotide helices held together by complementary hydrogen bonds.',
  'Adenine pairs specifically with thymine via two hydrogen bonds, whereas guanine pairs with cytosine through three hydrogen bonds along the sugar-phosphate backbone.',
  'DNA helicase unwinds the replication fork by disrupting hydrogen bonds between complementary nitrogenous bases prior to nucleotide synthesis.',
  'DNA polymerase III extends nascent polynucleotide chains exclusively in the five-prime to three-prime direction using free three-prime hydroxyl groups.',
  'Okazaki fragments form discontinuously on the lagging strand and are subsequently sealed into a continuous strand by DNA ligase.',
  'Telomerase preserves linear chromosome ends in rapidly dividing germline cells by appending repetitive nucleotide sequences.',
  '--- PAGE 4 ---',
  'Transcription synthesizes messenger ribonucleic acid transcripts from template DNA strands through RNA polymerase binding at core promoter regions.',
  'In eukaryotic nuclei, pre-mRNA splicing removes non-coding introns via the spliceosome while joining coding exons into mature transcripts.',
  'A seven-methylguanosine five-prime cap and polyadenylate tail protect mature messenger RNA from cytoplasmic exonuclease degradation.',
  'Ribosomes translate codon triplets on messenger RNA into polypeptide chains with transfer RNA anticodon base pairing inside the peptidyl transferase center.',
  'Chaperone proteins fold newly synthesized polypeptides into functional three-dimensional tertiary conformations inside the endoplasmic reticulum.',
  'Ubiquitin tagging targets misfolded or damaged intracellular proteins to the proteasome complex for regulated proteolytic recycling.',
].join('\n\n');

async function runSuite() {
  console.log('\n================================================================');
  console.log('  EXAMCRAFT AI: QUESTION MUTATION & EXPORT REPAIR REGRESSION');
  console.log(`  Target: ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;
  const createdExamIds = [];
  const createdDocIds = [];

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}: ${err.message}`);
      throw err;
    }
  }

  const runId = Date.now();
  const teacherEmail = `repair-teacher-${runId}@example.edu`;
  const otherEmail = `repair-other-${runId}@example.edu`;
  const password = 'TestPassword123!';
  let teacherToken = '';
  let otherToken = '';
  let teacherDocId = '';
  let teacherExamId = '';
  let rtlExamId = '';
  const guestSessionId = `guest-repair-${runId}`;
  let guestDocId = '';
  let guestExamId = '';

  try {
    // 1. Register Teacher A and Teacher B
    await test('Auth setup: register two isolated teacher accounts', async () => {
      const reg1 = await request('POST', '/api/auth/register', {
        body: {
          email: teacherEmail,
          password,
          full_name: 'Dr. Repair Tester',
          institution: 'Science Faculty',
        },
      });
      assert.strictEqual(reg1.statusCode, 201, `Register teacher 1 failed: ${reg1.statusCode} ${reg1.raw}`);
      teacherToken = reg1.body.token;
      assert.ok(teacherToken);

      const reg2 = await request('POST', '/api/auth/register', {
        body: {
          email: otherEmail,
          password,
          full_name: 'Dr. Other User',
          institution: 'Other Dept',
        },
      });
      assert.strictEqual(reg2.statusCode, 201);
      otherToken = reg2.body.token;
    });

    await test('Document isolation: new teachers, guest sessions, and default requests do NOT receive Cell_Biology_101.pdf', async () => {
      const tDocs = await request('GET', '/api/documents', { token: teacherToken });
      assert.strictEqual(tDocs.statusCode, 200);
      assert.deepStrictEqual(tDocs.body, [], 'New registered teacher must start with 0 documents');

      const gDocs = await request('GET', '/api/documents', { sessionId: guestSessionId });
      assert.strictEqual(gDocs.statusCode, 200);
      assert.deepStrictEqual(gDocs.body, [], 'New guest session must start with 0 documents');

      const defaultDocs = await request('GET', '/api/documents');
      assert.strictEqual(defaultDocs.statusCode, 200);
      assert.deepStrictEqual(defaultDocs.body, [], 'Unauthenticated request without session must return 0 documents');
    });

    // 2. Upload ground-truth document & generate 2-group exam across all 5 question types
    let groupAId = '';
    let groupBId = '';
    let groupAQuestions = [];
    let groupBQuestionsSnapshot = [];

    await test('Setup: upload source document and generate 2-group exam with all 5 supported types', async () => {
      const uploadRes = await uploadTextDocument('plant_cellular_bioenergetics.txt', SAMPLE_DOC_CONTENT, {
        token: teacherToken,
      });
      assert.strictEqual(uploadRes.statusCode, 201, `Upload failed: ${uploadRes.statusCode} ${uploadRes.raw}`);
      teacherDocId = uploadRes.body.id;
      createdDocIds.push({ id: teacherDocId, token: teacherToken });

      // Confirm Teacher A sees ONLY their uploaded document (no sample seed doc), and Teacher B still sees 0
      const listTeacherA = await request('GET', '/api/documents', { token: teacherToken });
      assert.strictEqual(listTeacherA.statusCode, 200);
      assert.strictEqual(listTeacherA.body.length, 1);
      assert.strictEqual(listTeacherA.body[0].id, teacherDocId);

      const listTeacherB = await request('GET', '/api/documents', { token: otherToken });
      assert.strictEqual(listTeacherB.statusCode, 200);
      assert.deepStrictEqual(listTeacherB.body, []);

      // Confirm Teacher B cannot generate an exam using Teacher A's private document
      const crossGen = await request('POST', '/api/exams/generate', {
        token: otherToken,
        body: {
          document_id: teacherDocId,
          selected_pages: [1],
          title: 'Unauthorized Gen',
          subject: 'Bio',
          groups_count: 1,
          question_types_config: { mcq: 1 },
        },
      });
      assert.strictEqual(crossGen.statusCode, 403);

      const genRes = await request('POST', '/api/exams/generate', {
        token: teacherToken,
        body: {
          document_id: teacherDocId,
          selected_pages: [1, 2, 3, 4],
          title: 'Bioenergetics Midterm Exam',
          subject: 'Plant & Cellular Bioenergetics',
          groups_count: 2,
          question_types_config: {
            mcq: 1,
            true_false: 1,
            fill_blank: 1,
            short_answer: 1,
            essay: 1,
          },
        },
      });
      assert.strictEqual(genRes.statusCode, 201, `Generate failed: ${genRes.statusCode} ${genRes.raw}`);
      teacherExamId = genRes.body.id;
      createdExamIds.push({ id: teacherExamId, token: teacherToken });

      assert.strictEqual(genRes.body.groups.length, 2);
      groupAId = genRes.body.groups[0].id;
      groupBId = genRes.body.groups[1].id;
      groupAQuestions = genRes.body.groups[0].questions;
      groupBQuestionsSnapshot = JSON.parse(JSON.stringify(genRes.body.groups[1].questions));
      assert.strictEqual(groupAQuestions.length, 5);
      assert.strictEqual(groupBQuestionsSnapshot.length, 5);
    });

    // 3. Edit all 5 question types + MCQ validation + persistence
    await test('PUT /questions/:id: edits all 5 question types cleanly and persists changes', async () => {
      const mcq = groupAQuestions.find((q) => q.question_type === 'mcq');
      const tf = groupAQuestions.find((q) => q.question_type === 'true_false');
      const fb = groupAQuestions.find((q) => q.question_type === 'fill_blank');
      const sa = groupAQuestions.find((q) => q.question_type === 'short_answer');
      const es = groupAQuestions.find((q) => q.question_type === 'essay');
      assert.ok(mcq && tf && fb && sa && es, 'All 5 question types must exist in Group A');

      // Invalid MCQ validations
      const bad3Opts = await request('PUT', `/api/exams/${teacherExamId}/questions/${mcq.id}`, {
        token: teacherToken,
        body: { options: ['One', 'Two', 'Three'], correct_answer: 'One' },
      });
      assert.strictEqual(bad3Opts.statusCode, 422);

      const badPlaceholder = await request('PUT', `/api/exams/${teacherExamId}/questions/${mcq.id}`, {
        token: teacherToken,
        body: { options: ['Alpha', 'Beta', 'Gamma', 'New Option D'], correct_answer: 'Alpha' },
      });
      assert.strictEqual(badPlaceholder.statusCode, 422);

      // Valid MCQ edit with surrounding whitespace on correct_answer
      const newOpts = [
        'Chloroplast thylakoid membrane',
        'Smooth endoplasmic reticulum',
        'Golgi trans cisternae',
        'Peroxisomal matrix',
      ];
      const mcqRes = await request('PUT', `/api/exams/${teacherExamId}/questions/${mcq.id}`, {
        token: teacherToken,
        body: {
          question_text: 'Which chloroplast structure directly embeds chlorophyll pigments?',
          marks: 2.5,
          options: newOpts,
          correct_answer: '  Chloroplast thylakoid membrane  ',
          explanation: 'Verified edit explanation.',
        },
      });
      assert.strictEqual(mcqRes.statusCode, 200, `MCQ edit failed: ${mcqRes.statusCode} ${mcqRes.raw}`);
      assert.strictEqual(mcqRes.body.correct_answer, 'Chloroplast thylakoid membrane');
      assert.strictEqual(mcqRes.body.marks, 2.5);

      const tfRes = await request('PUT', `/api/exams/${teacherExamId}/questions/${tf.id}`, {
        token: teacherToken,
        body: {
          question_text: 'True or False: Glycolysis occurs inside the cytoplasm.',
          correct_answer: 'True',
          marks: 1,
        },
      });
      assert.strictEqual(tfRes.statusCode, 200);

      const fbRes = await request('PUT', `/api/exams/${teacherExamId}/questions/${fb.id}`, {
        token: teacherToken,
        body: {
          question_text: 'The enzyme ______ fixes carbon dioxide during the Calvin cycle.',
          correct_answer: 'RuBisCO',
          marks: 2,
        },
      });
      assert.strictEqual(fbRes.statusCode, 200);

      const saRes = await request('PUT', `/api/exams/${teacherExamId}/questions/${sa.id}`, {
        token: teacherToken,
        body: {
          question_text: 'Explain how ATP synthase generates ATP in the thylakoid membrane.',
          correct_answer: 'It harnesses the proton electrochemical gradient across the thylakoid lumen.',
          marks: 3,
        },
      });
      assert.strictEqual(saRes.statusCode, 200);

      const esRes = await request('PUT', `/api/exams/${teacherExamId}/questions/${es.id}`, {
        token: teacherToken,
        body: {
          question_text: 'Compare the Calvin cycle and the citric acid cycle in energy metabolism.',
          correct_answer: 'Discuss carbon fixation in stroma versus acetyl-CoA oxidation in mitochondrial matrix.',
          marks: 5,
        },
      });
      assert.strictEqual(esRes.statusCode, 200);

      // Verify persistence via GET
      const getExam = await request('GET', `/api/exams/${teacherExamId}`, { token: teacherToken });
      assert.strictEqual(getExam.statusCode, 200);
      const updatedGA = getExam.body.groups.find((g) => g.id === groupAId);
      const persistedMcq = updatedGA.questions.find((q) => q.id === mcq.id);
      assert.strictEqual(persistedMcq.question_text, 'Which chloroplast structure directly embeds chlorophyll pigments?');
      assert.deepStrictEqual(persistedMcq.options, newOpts);
      assert.strictEqual(persistedMcq.marks, 2.5);
    });

    // 4. Reorder Questions + atomic validation
    await test('PUT /groups/:gid/reorder: reorders atomically, rejects duplicates, and leaves Group B untouched', async () => {
      const reversedIds = [...groupAQuestions].reverse().map((q) => q.id);

      // Duplicate ID rejection
      const dupRes = await request('PUT', `/api/exams/${teacherExamId}/groups/${groupAId}/reorder`, {
        token: teacherToken,
        body: {
          question_ids: [reversedIds[0], reversedIds[0], reversedIds[2], reversedIds[3], reversedIds[4]],
        },
      });
      assert.strictEqual(dupRes.statusCode, 400, 'Duplicate question_ids must return 400');

      // Unknown ID rejection
      const unknownRes = await request('PUT', `/api/exams/${teacherExamId}/groups/${groupAId}/reorder`, {
        token: teacherToken,
        body: {
          question_ids: [...reversedIds.slice(0, 4), 'unknown-qid'],
        },
      });
      assert.strictEqual(unknownRes.statusCode, 400, 'Unknown question_id must return 400');

      // Valid reorder
      const reorderRes = await request('PUT', `/api/exams/${teacherExamId}/groups/${groupAId}/reorder`, {
        token: teacherToken,
        body: { question_ids: reversedIds },
      });
      assert.strictEqual(reorderRes.statusCode, 200, `Reorder failed: ${reorderRes.statusCode} ${reorderRes.raw}`);
      assert.deepStrictEqual(
        reorderRes.body.map((q) => q.id),
        reversedIds
      );
      assert.deepStrictEqual(
        reorderRes.body.map((q) => q.question_order),
        [1, 2, 3, 4, 5]
      );

      // Verify persistence and Group B isolation
      const getExam = await request('GET', `/api/exams/${teacherExamId}`, { token: teacherToken });
      assert.strictEqual(getExam.statusCode, 200);
      const updatedGA = getExam.body.groups.find((g) => g.id === groupAId);
      const updatedGB = getExam.body.groups.find((g) => g.id === groupBId);
      assert.deepStrictEqual(
        updatedGA.questions.map((q) => q.id),
        reversedIds
      );
      assert.deepStrictEqual(updatedGB.questions, groupBQuestionsSnapshot);
      groupAQuestions = updatedGA.questions;
    });

    // 5. Regenerate Question
    await test('POST /questions/:qid/regenerate: regenerates target question with & without instructions cleanly', async () => {
      const targetMcq = groupAQuestions.find((q) => q.question_type === 'mcq');
      const targetSa = groupAQuestions.find((q) => q.question_type === 'short_answer');

      const regenMcqRes = await request(
        'POST',
        `/api/exams/${teacherExamId}/questions/${targetMcq.id}/regenerate`,
        {
          token: teacherToken,
          body: { instructions: 'Focus on photolysis and Photosystem II oxygen release' },
        }
      );
      assert.strictEqual(regenMcqRes.statusCode, 200, `Regen MCQ failed: ${regenMcqRes.statusCode} ${regenMcqRes.raw}`);
      assert.strictEqual(regenMcqRes.body.id, targetMcq.id);
      assert.strictEqual(regenMcqRes.body.options.length, 4);
      assert.ok(regenMcqRes.body.options.includes(regenMcqRes.body.correct_answer));

      const regenSaRes = await request(
        'POST',
        `/api/exams/${teacherExamId}/questions/${targetSa.id}/regenerate`,
        {
          token: teacherToken,
          body: {},
        }
      );
      assert.strictEqual(regenSaRes.statusCode, 200, `Regen SA failed: ${regenSaRes.statusCode} ${regenSaRes.raw}`);
      assert.ok(regenSaRes.body.question_text.length > 15);
      assert.ok(regenSaRes.body.source_evidence);

      // Non-existent question returns 404 JSON
      const missingRes = await request(
        'POST',
        `/api/exams/${teacherExamId}/questions/nonexistent-q-id/regenerate`,
        {
          token: teacherToken,
          body: {},
        }
      );
      assert.strictEqual(missingRes.statusCode, 404);
      assert.ok(missingRes.body?.detail);
    });

    // 6. Export PDF & DOCX (authenticated, group_id edge values, non-ASCII RTL filename)
    await test('GET /export/pdf & /export/docx: handle single group, all, undefined, and RTL filenames cleanly', async () => {
      const cases = [
        `/api/exams/${teacherExamId}/export/pdf?target=both&group_id=${encodeURIComponent(groupAId)}`,
        `/api/exams/${teacherExamId}/export/pdf?target=exam&group_id=all`,
        `/api/exams/${teacherExamId}/export/pdf?target=answer_key&group_id=undefined`,
        `/api/exams/${teacherExamId}/export/docx?target=both&group_id=${encodeURIComponent(groupAId)}`,
        `/api/exams/${teacherExamId}/export/docx?target=exam&group_id=all`,
        `/api/exams/${teacherExamId}/export/docx?target=answer_key&group_id=null`,
      ];

      for (const url of cases) {
        const res = await request('GET', url, { token: teacherToken });
        assert.strictEqual(res.statusCode, 200, `Export failed for ${url}: ${res.statusCode} ${res.raw?.slice(0, 200)}`);
        if (url.includes('/export/pdf')) {
          assert.ok((res.headers['content-type'] || '').includes('application/pdf'));
          assert.strictEqual(res.buffer.subarray(0, 4).toString('utf8'), '%PDF');
        } else {
          assert.ok((res.headers['content-type'] || '').includes('wordprocessingml.document'));
          assert.strictEqual(res.buffer.subarray(0, 2).toString('utf8'), 'PK');
        }
      }

      // Invalid group_id still properly returns 404 JSON
      const badGroupRes = await request(
        'GET',
        `/api/exams/${teacherExamId}/export/pdf?target=both&group_id=missing-group-xyz`,
        { token: teacherToken }
      );
      assert.strictEqual(badGroupRes.statusCode, 404);
      assert.ok(badGroupRes.body?.detail);

      // Verify non-ASCII RTL title generates clean fallback filename (not ____.pdf)
      const rtlGenRes = await request('POST', '/api/exams/generate', {
        token: teacherToken,
        body: {
          document_id: teacherDocId,
          selected_pages: [1],
          title: 'آزمون آزمایشی زیست',
          subject: 'بیولوژی',
          groups_count: 1,
          question_types_config: { mcq: 1 },
        },
      });
      assert.strictEqual(rtlGenRes.statusCode, 201);
      rtlExamId = rtlGenRes.body.id;
      createdExamIds.push({ id: rtlExamId, token: teacherToken });

      const rtlPdf = await request('GET', `/api/exams/${rtlExamId}/export/pdf?target=both`, {
        token: teacherToken,
      });
      assert.strictEqual(rtlPdf.statusCode, 200);
      const disp = rtlPdf.headers['content-disposition'] || '';
      assert.ok(disp.includes('.pdf'), `Missing .pdf in Content-Disposition: ${disp}`);
      assert.ok(!disp.includes('____'), `Unsafe underscore-only filename in Content-Disposition: ${disp}`);
    });

    // 7. Delete Question + re-sequencing + minimum-1 guard
    await test('DELETE /questions/:id: deletes target question, re-sequences Group A, blocks deleting final question', async () => {
      const toDelete = groupAQuestions[1];
      const delRes = await request('DELETE', `/api/exams/${teacherExamId}/questions/${toDelete.id}`, {
        token: teacherToken,
      });
      assert.strictEqual(delRes.statusCode, 200, `Delete failed: ${delRes.statusCode} ${delRes.raw}`);
      assert.strictEqual(delRes.body.remaining_questions_in_group, 4);

      const getAfterFirstDel = await request('GET', `/api/exams/${teacherExamId}`, { token: teacherToken });
      const ga = getAfterFirstDel.body.groups.find((g) => g.id === groupAId);
      const gb = getAfterFirstDel.body.groups.find((g) => g.id === groupBId);
      assert.strictEqual(ga.questions.length, 4);
      assert.deepStrictEqual(
        ga.questions.map((q) => q.question_order),
        [1, 2, 3, 4]
      );
      assert.strictEqual(gb.questions.length, 5, 'Group B must be untouched by Group A deletion');

      // Delete remaining down to 1
      for (const q of ga.questions.slice(1)) {
        const res = await request('DELETE', `/api/exams/${teacherExamId}/questions/${q.id}`, {
          token: teacherToken,
        });
        assert.strictEqual(res.statusCode, 200);
      }

      const lastQId = ga.questions[0].id;
      const blockedDel = await request('DELETE', `/api/exams/${teacherExamId}/questions/${lastQId}`, {
        token: teacherToken,
      });
      assert.strictEqual(blockedDel.statusCode, 400, 'Deleting final question must return 400');
      assert.ok(blockedDel.body?.detail);
    });

    // 8. Cross-user authorization boundary + unmatched /api/* JSON 404 guard + guest session flow
    await test('Security & Routing: enforces cross-user 403, guest session flow, and JSON 404 on unmatched /api/*', async () => {
      // Teacher B cannot mutate or export Teacher A's exam
      const crossPut = await request('PUT', `/api/exams/${teacherExamId}/questions/any`, {
        token: otherToken,
        body: { question_text: 'Tamper' },
      });
      assert.strictEqual(crossPut.statusCode, 403);

      const crossPdf = await request('GET', `/api/exams/${teacherExamId}/export/pdf`, {
        token: otherToken,
      });
      assert.strictEqual(crossPdf.statusCode, 403);

      // Guest flow works cleanly with X-Guest-Session-ID
      const gUpload = await uploadTextDocument('guest_bio.txt', SAMPLE_DOC_CONTENT, {
        sessionId: guestSessionId,
      });
      assert.strictEqual(gUpload.statusCode, 201);
      guestDocId = gUpload.body.id;
      createdDocIds.push({ id: guestDocId, sessionId: guestSessionId });

      const gExam = await request('POST', '/api/exams/generate', {
        sessionId: guestSessionId,
        body: {
          document_id: guestDocId,
          selected_pages: [1, 2],
          title: 'Guest Midterm',
          subject: 'Biology',
          groups_count: 1,
          question_types_config: { mcq: 1, true_false: 1 },
        },
      });
      assert.strictEqual(gExam.statusCode, 201);
      guestExamId = gExam.body.id;
      createdExamIds.push({ id: guestExamId, sessionId: guestSessionId });

      const gPdf = await request('GET', `/api/exams/${guestExamId}/export/pdf?target=both`, {
        sessionId: guestSessionId,
      });
      assert.strictEqual(gPdf.statusCode, 200);
      assert.strictEqual(gPdf.buffer.subarray(0, 4).toString('utf8'), '%PDF');

      // Unmatched /api/* routes return JSON 404, not HTML
      const unknownApiGet = await request('GET', '/api/nonexistent-endpoint-check');
      assert.strictEqual(unknownApiGet.statusCode, 404);
      assert.ok((unknownApiGet.headers['content-type'] || '').includes('application/json'));
      assert.ok(unknownApiGet.body?.detail);

      const unknownApiPut = await request('PUT', '/api/exams/missing/unknown-subroute', { body: {} });
      assert.strictEqual(unknownApiPut.statusCode, 404);
      assert.ok((unknownApiPut.headers['content-type'] || '').includes('application/json'));
      assert.ok(unknownApiPut.body?.detail);
    });

    await test('UI cleanup: Print Sheet entry points removed and document empty state rendered', async () => {
      const previewSrc = fs.readFileSync(path.resolve('src/components/AcademicPaperPreview.tsx'), 'utf8');
      assert.ok(!previewSrc.includes('print-sheet-btn'), 'Print Sheet button must be removed');
      assert.ok(!previewSrc.includes('Print Sheet'), 'Print Sheet label must be removed');
      assert.ok(!previewSrc.includes('window.print'), 'window.print must be removed');
      assert.ok(previewSrc.includes('DOCX') && previewSrc.includes('PDF'), 'DOCX & PDF exports must remain');

      const workspaceSrc = fs.readFileSync(path.resolve('src/components/ExamWorkspace.tsx'), 'utf8');
      assert.ok(!workspaceSrc.includes('Paper Preview & Print'), 'Preview toggle must not mention Print');
      assert.ok(workspaceSrc.includes('No Source Documents Yet'), 'Clean empty state must be present');
    });
  } finally {
    // Clean up temporary exams & documents via API
    for (const item of createdExamIds) {
      await request('DELETE', `/api/exams/${item.id}`, {
        token: item.token || null,
        sessionId: item.sessionId || null,
      }).catch(() => {});
    }
    for (const item of createdDocIds) {
      await request('DELETE', `/api/documents/${item.id}`, {
        token: item.token || null,
        sessionId: item.sessionId || null,
      }).catch(() => {});
    }
  }

  console.log('\n================================================================');
  console.log(`  ALL ${passed}/${total} QUESTION & EXPORT REPAIR TESTS PASSED!`);
  console.log('================================================================\n');
}

runSuite().catch((err) => {
  console.error('\nRepair suite failed:', err);
  process.exit(1);
});
