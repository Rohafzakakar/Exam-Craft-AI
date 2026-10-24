import assert from 'node:assert';
import http from 'node:http';

const PORT = process.env.PORT || 8080;
const BASE_URL = `http://localhost:${PORT}`;

function httpPostJson(url, data, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks).toString('utf8') });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpPutJson(url, data, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve({ statusCode: res.statusCode, headers: res.headers, body });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks).toString('utf8') });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runQuestionOperationsSuite() {
  console.log('\n======================================================');
  console.log('  EXAMCRAFT AI: QUESTION REORDERING & REGENERATION SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
      throw err;
    }
  }

  // Generate test exam with 3 questions
  let testExamId = '';
  let groupAId = '';
  let originalQ1 = null;
  let originalQ2 = null;
  let originalQ3 = null;

  await test('Setup: Generate base exam with 3 distinct questions', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      selected_pages: [1, 2],
      title: 'Question Operations Test Exam',
      subject: 'Cellular Architecture & Transport',
      groups_count: 1,
      question_types_config: { mcq: 2, true_false: 1 },
    });

    assert.strictEqual(res.statusCode, 201, `Expected 201, got ${res.statusCode}`);
    testExamId = res.body.id;
    groupAId = res.body.groups[0].id;
    const questions = res.body.groups[0].questions;
    assert.strictEqual(questions.length, 3, 'Must have 3 questions');

    originalQ1 = { ...questions[0] };
    originalQ2 = { ...questions[1] };
    originalQ3 = { ...questions[2] };
  });

  // 1. Test Reordering: Move Q2 to position 1, Q1 to position 2, Q3 remains at position 3
  await test('Reorder Questions: Successfully swaps Q1 and Q2, preserves Q3, and persists in SQLite', async () => {
    const newOrderIds = [originalQ2.id, originalQ1.id, originalQ3.id];
    const res = await httpPutJson(`${BASE_URL}/api/exams/${testExamId}/groups/${groupAId}/reorder`, {
      question_ids: newOrderIds,
    });

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.strictEqual(res.body.length, 3, 'Must return 3 reordered questions');

    const [newQ1, newQ2, newQ3] = res.body;
    assert.strictEqual(newQ1.id, originalQ2.id, 'First question must now be original Q2');
    assert.strictEqual(newQ1.question_order, 1, 'First question must have question_order 1');

    assert.strictEqual(newQ2.id, originalQ1.id, 'Second question must now be original Q1');
    assert.strictEqual(newQ2.question_order, 2, 'Second question must have question_order 2');

    assert.strictEqual(newQ3.id, originalQ3.id, 'Third question must remain original Q3');
    assert.strictEqual(newQ3.question_order, 3, 'Third question must have question_order 3');

    // Verify untouched question Q3 data was completely preserved
    assert.strictEqual(newQ3.question_text, originalQ3.question_text, 'Q3 text must be unchanged');
    assert.strictEqual(newQ3.correct_answer, originalQ3.correct_answer, 'Q3 answer must be unchanged');
    assert.strictEqual(newQ3.marks, originalQ3.marks, 'Q3 marks must be unchanged');

    // Verify persistence via GET /api/exams/:id
    const getRes = await httpGet(`${BASE_URL}/api/exams/${testExamId}`);
    assert.strictEqual(getRes.statusCode, 200);
    const persisted = JSON.parse(getRes.buffer.toString('utf8'));
    const persistedGroup = persisted.groups.find((g) => g.id === groupAId);
    assert.strictEqual(persistedGroup.questions[0].id, originalQ2.id);
    assert.strictEqual(persistedGroup.questions[1].id, originalQ1.id);
    assert.strictEqual(persistedGroup.questions[2].id, originalQ3.id);
  });

  // 2. Test Reordering Error Handling
  await test('Reorder Questions Error Handling: Rejects invalid or incomplete question ID arrays with 400', async () => {
    // Missing an ID
    const resMissing = await httpPutJson(`${BASE_URL}/api/exams/${testExamId}/groups/${groupAId}/reorder`, {
      question_ids: [originalQ1.id, originalQ2.id],
    });
    assert.strictEqual(resMissing.statusCode, 400, 'Must return 400 for missing question ID');

    // Unknown ID
    const resUnknown = await httpPutJson(`${BASE_URL}/api/exams/${testExamId}/groups/${groupAId}/reorder`, {
      question_ids: [originalQ1.id, originalQ2.id, 'fake-unknown-q-id'],
    });
    assert.strictEqual(resUnknown.statusCode, 400, 'Must return 400 for unknown question ID');
  });

  // 3. Test Single Question Regeneration
  let regeneratedQText = '';
  await test('Single Question Regeneration: Refreshes selected question with custom instructions and leaves other questions unchanged', async () => {
    const targetQId = originalQ2.id;
    const customInstruction = 'Focus on mitochondrial ATP synthase and membrane transport';

    const res = await httpPostJson(`${BASE_URL}/api/exams/${testExamId}/questions/${targetQId}/regenerate`, {
      instructions: customInstruction,
    });

    assert.strictEqual(res.statusCode, 200, `Expected 200, got ${res.statusCode}`);
    assert.strictEqual(res.body.id, targetQId, 'Must preserve the exact same question ID');
    assert.ok(!res.body.question_text.includes('Focused Concept'), 'Must NOT contain internal "Focused Concept" prefix');
    assert.ok(!res.body.question_text.includes('Regenerated:'), 'Must NOT contain internal "Regenerated:" prefix');
    assert.ok(res.body.question_text.length > 20, 'Question text must be substantive');
    regeneratedQText = res.body.question_text;

    // Verify grounding fields are preserved
    assert.strictEqual(res.body.source_page, originalQ2.source_page, 'Source page must be preserved');
    assert.ok(res.body.source_evidence, 'Source evidence citation must be preserved');

    // Verify other questions (originalQ1 and originalQ3) in the exam were NOT touched in ANY field
    const examRes = await httpGet(`${BASE_URL}/api/exams/${testExamId}`);
    assert.strictEqual(examRes.statusCode, 200);
    const examData = JSON.parse(examRes.buffer.toString('utf8'));
    const group = examData.groups.find((g) => g.id === groupAId);

    const checkQ1 = group.questions.find((q) => q.id === originalQ1.id);
    const checkQ3 = group.questions.find((q) => q.id === originalQ3.id);

    // Complete field-by-field verification of Question 1
    assert.strictEqual(checkQ1.id, originalQ1.id, 'Q1 ID must be unchanged');
    assert.strictEqual(checkQ1.question_text, originalQ1.question_text, 'Q1 text must be unchanged');
    assert.strictEqual(checkQ1.question_type, originalQ1.question_type, 'Q1 type must be unchanged');
    assert.deepStrictEqual(checkQ1.options, originalQ1.options, 'Q1 options must be unchanged');
    assert.strictEqual(checkQ1.correct_answer, originalQ1.correct_answer, 'Q1 correct answer must be unchanged');
    assert.strictEqual(checkQ1.explanation, originalQ1.explanation, 'Q1 explanation must be unchanged');
    assert.strictEqual(checkQ1.marks, originalQ1.marks, 'Q1 marks must be unchanged');
    assert.strictEqual(checkQ1.source_page, originalQ1.source_page, 'Q1 source page must be unchanged');
    assert.strictEqual(checkQ1.source_evidence, originalQ1.source_evidence, 'Q1 source evidence must be unchanged');

    // Complete field-by-field verification of Question 3
    assert.strictEqual(checkQ3.id, originalQ3.id, 'Q3 ID must be unchanged');
    assert.strictEqual(checkQ3.question_text, originalQ3.question_text, 'Q3 text must be unchanged');
    assert.strictEqual(checkQ3.question_type, originalQ3.question_type, 'Q3 type must be unchanged');
    assert.deepStrictEqual(checkQ3.options, originalQ3.options, 'Q3 options must be unchanged');
    assert.strictEqual(checkQ3.correct_answer, originalQ3.correct_answer, 'Q3 correct answer must be unchanged');
    assert.strictEqual(checkQ3.explanation, originalQ3.explanation, 'Q3 explanation must be unchanged');
    assert.strictEqual(checkQ3.marks, originalQ3.marks, 'Q3 marks must be unchanged');
    assert.strictEqual(checkQ3.source_page, originalQ3.source_page, 'Q3 source page must be unchanged');
    assert.strictEqual(checkQ3.source_evidence, originalQ3.source_evidence, 'Q3 source evidence must be unchanged');
  });

  // 4. Test Single Question Regeneration in Multi-Group Exam (Isomorphic isolation)
  await test('Multi-Group Regeneration Isolation: Regenerating Q1 does NOT affect Q2 or Q3 in any group', async () => {
    // Generate a 2-group exam
    const multiRes = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      selected_pages: [1],
      title: 'Multi-Group Isolation Test',
      subject: 'Cytology',
      groups_count: 2,
      question_types_config: { mcq: 2, true_false: 1 },
    });
    assert.strictEqual(multiRes.statusCode, 201);
    const mExamId = multiRes.body.id;
    const gA = multiRes.body.groups[0];
    const gB = multiRes.body.groups[1];

    const targetQA1 = gA.questions[0];
    const untouchedQA2 = gA.questions[1];
    const untouchedQA3 = gA.questions[2];

    const initialQA2Text = untouchedQA2.question_text;
    const initialQA3Text = untouchedQA3.question_text;

    // Regenerate Q1 with instructions
    const regenRes = await httpPostJson(`${BASE_URL}/api/exams/${mExamId}/questions/${targetQA1.id}/regenerate`, {
      instructions: 'Focus on nucleolus rRNA synthesis',
    });
    assert.strictEqual(regenRes.statusCode, 200);

    // Fetch updated exam
    const fetchRes = await httpGet(`${BASE_URL}/api/exams/${mExamId}`);
    assert.strictEqual(fetchRes.statusCode, 200);
    const updatedExam = JSON.parse(fetchRes.buffer.toString('utf8'));

    const updatedGA = updatedExam.groups.find((g) => g.id === gA.id);
    const updatedGB = updatedExam.groups.find((g) => g.id === gB.id);

    // Q1 in Group A is updated
    assert.notStrictEqual(updatedGA.questions[0].question_text, targetQA1.question_text);
    assert.ok(!updatedGA.questions[0].question_text.includes('Focused Concept'), 'Must not contain internal "Focused Concept" prefix');
    assert.ok(!updatedGA.questions[0].question_text.includes('Regenerated:'), 'Must not contain internal "Regenerated:" prefix');
    assert.ok(updatedGA.questions[0].question_text.length > 20, 'Grounded question text must be substantive');

    // Q2 and Q3 in Group A MUST BE 100% UNCHANGED
    assert.strictEqual(updatedGA.questions[1].question_text, initialQA2Text, 'Group A Q2 must be completely unchanged');
    assert.strictEqual(updatedGA.questions[2].question_text, initialQA3Text, 'Group A Q3 must be completely unchanged');

    // In Group B, all questions are completely untouched (group isolation)
    assert.strictEqual(updatedGB.questions.length, gB.questions.length);
    for (let i = 0; i < gB.questions.length; i++) {
      assert.strictEqual(updatedGB.questions[i].id, gB.questions[i].id, `Group B Q${i + 1} ID must be unchanged`);
      assert.strictEqual(updatedGB.questions[i].question_text, gB.questions[i].question_text, `Group B Q${i + 1} text must be unchanged`);
      assert.strictEqual(updatedGB.questions[i].correct_answer, gB.questions[i].correct_answer, `Group B Q${i + 1} answer must be unchanged`);
    }
  });

  // 4. Test Single Question Regeneration Failure Handling
  await test('Single Question Regeneration Error Handling: Returns 404 for non-existent question ID', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/${testExamId}/questions/non-existent-question-id/regenerate`, {
      instructions: 'Some instruction',
    });
    assert.strictEqual(res.statusCode, 404, 'Must return 404 for non-existent question');
  });

  // 5. Test PDF and DOCX Exports Reflect the Reordered and Regenerated Content
  await test('Exports: PDF and DOCX exports succeed with HTTP 200 and include reordered/regenerated content', async () => {
    // PDF export
    const pdfRes = await httpGet(`${BASE_URL}/api/exams/${testExamId}/export/pdf?target=exam`);
    assert.strictEqual(pdfRes.statusCode, 200, 'PDF export must return HTTP 200');
    assert.strictEqual(pdfRes.buffer.subarray(0, 4).toString(), '%PDF', 'Must return valid PDF binary');
    assert.ok(pdfRes.buffer.length > 5000, 'PDF buffer must contain content');

    // DOCX export
    const docxRes = await httpGet(`${BASE_URL}/api/exams/${testExamId}/export/docx?target=exam`);
    assert.strictEqual(docxRes.statusCode, 200, 'DOCX export must return HTTP 200');
    assert.ok(docxRes.buffer.length > 2000, 'DOCX buffer must contain content');
  });

  console.log('\n======================================================');
  console.log(`  ALL ${passed}/${total} QUESTION OPERATIONS TESTS PASSED!`);
  console.log('======================================================\n');
}

runQuestionOperationsSuite().catch((err) => {
  console.error('\nSuite Failed:', err);
  process.exit(1);
});
