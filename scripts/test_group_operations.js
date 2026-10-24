import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 3000;
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

function httpDelete(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'DELETE',
        headers: {
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

async function runGroupOperationsSuite() {
  console.log('\n======================================================');
  console.log('  EXAMCRAFT AI: GROUP A-J OPERATIONS REGRESSION SUITE');
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

  let multiExamId = '';
  let groupA = null;
  let groupB = null;
  let groupC = null;

  // Test 1: Generate a 3-Group Exam
  await test('1. Generation: Generates 3 groups (A, B, C) with distinct questions per group', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      selected_pages: [1, 2, 3],
      title: 'Groups A-J Verification Exam',
      subject: 'Cytology & Transport',
      groups_count: 3,
      question_types_config: { mcq: 2, true_false: 1 },
    });

    assert.ok(res.statusCode === 200 || res.statusCode === 201, `Expected 200 or 201, got ${res.statusCode}`);
    multiExamId = res.body.id;
    assert.strictEqual(res.body.groups.length, 3, 'Must have 3 groups');
    groupA = res.body.groups[0];
    groupB = res.body.groups[1];
    groupC = res.body.groups[2];

    assert.strictEqual(groupA.group_name, 'Group A');
    assert.strictEqual(groupB.group_name, 'Group B');
    assert.strictEqual(groupC.group_name, 'Group C');

    assert.strictEqual(groupA.questions.length, 3);
    assert.strictEqual(groupB.questions.length, 3);
    assert.strictEqual(groupC.questions.length, 3);

    // Verify distinct question text across groups
    const allTexts = res.body.groups.flatMap((g) => g.questions.map((q) => q.question_text));
    const uniqueTexts = new Set(allTexts);
    assert.strictEqual(uniqueTexts.size, allTexts.length, 'All questions across Groups A, B, C must have distinct stems');
  });

  // Test 2: Cross-Group Regeneration Deduplication
  await test('2. Cross-Group Deduplication: Regenerated question in Group A does not reuse evidence from Group B or C', async () => {
    const targetQ = groupA.questions[0];

    // Collect all existing evidence and answers from sibling groups B and C
    const siblingEvidence = new Set(
      [...groupB.questions, ...groupC.questions].map((q) => q.source_evidence?.trim()).filter(Boolean)
    );
    const siblingTexts = new Set(
      [...groupB.questions, ...groupC.questions].map((q) => q.question_text?.trim()).filter(Boolean)
    );

    const regenRes = await httpPostJson(`${BASE_URL}/api/exams/${multiExamId}/questions/${targetQ.id}/regenerate`, {
      instructions: 'Focus on mitochondria and cellular energy',
    });

    assert.strictEqual(regenRes.statusCode, 200, `Expected 200, got ${regenRes.statusCode}`);
    const regenerated = regenRes.body;

    assert.strictEqual(regenerated.id, targetQ.id, 'Question ID must be preserved');
    assert.ok(regenerated.question_text.length > 20, 'Question text must be substantive');
    assert.ok(!siblingTexts.has(regenerated.question_text.trim()), 'Regenerated question text must not duplicate any sibling group question');
    assert.ok(!siblingEvidence.has(regenerated.source_evidence?.trim()), 'Regenerated evidence must not reuse sibling group evidence');
  });

  // Test 3: Accurate Marks Update in Groups B and C
  await test('3. Accurate Total Marks: Editing marks in Group B updates Group B marks and persisted exam total marks', async () => {
    const qInGroupB = groupB.questions[0];
    const newMarksValue = 4.5;

    const editRes = await httpPutJson(`${BASE_URL}/api/exams/${multiExamId}/questions/${qInGroupB.id}`, {
      marks: newMarksValue,
      question_text: qInGroupB.question_text,
      options: qInGroupB.options,
      correct_answer: qInGroupB.correct_answer,
    });

    assert.strictEqual(editRes.statusCode, 200, `Expected 200, got ${editRes.statusCode}`);
    assert.strictEqual(editRes.body.marks, newMarksValue, 'Question marks must be updated to 4.5');

    // Fetch updated exam to verify persistence and group marks
    const getRes = await httpGet(`${BASE_URL}/api/exams/${multiExamId}`);
    assert.strictEqual(getRes.statusCode, 200);
    const updatedExam = JSON.parse(getRes.buffer.toString('utf8'));

    const updatedGB = updatedExam.groups.find((g) => g.id === groupB.id);
    const gbTotal = updatedGB.questions.reduce((sum, q) => sum + q.marks, 0);
    assert.strictEqual(updatedGB.questions[0].marks, newMarksValue);
    assert.ok(gbTotal > 6.0, `Group B total must reflect the 4.5 marks (total is ${gbTotal})`);

    // Verify exam.total_marks does NOT default blindly to Group A when Group B is edited
    assert.strictEqual(updatedExam.total_marks, gbTotal, 'Exam total marks must reflect updated group total');
  });

  // Test 4: Correct Deletion Behavior - Deletes ONLY intended question from target group
  await test('4. Correct Deletion: Deleting a question from Group B preserves ALL questions in Groups A and C', async () => {
    // Record current state of Group A and Group C questions
    const beforeGet = await httpGet(`${BASE_URL}/api/exams/${multiExamId}`);
    const beforeExam = JSON.parse(beforeGet.buffer.toString('utf8'));
    const beforeGA = beforeExam.groups.find((g) => g.id === groupA.id);
    const beforeGC = beforeExam.groups.find((g) => g.id === groupC.id);
    const beforeGB = beforeExam.groups.find((g) => g.id === groupB.id);

    const questionToDelete = beforeGB.questions[1]; // Delete second question of Group B
    assert.ok(questionToDelete, 'Target question in Group B must exist');

    const deleteRes = await httpDelete(`${BASE_URL}/api/exams/${multiExamId}/questions/${questionToDelete.id}`);
    assert.strictEqual(deleteRes.statusCode, 200, `Expected 200, got ${deleteRes.statusCode}`);
    assert.strictEqual(deleteRes.body.deleted_question_id, questionToDelete.id);
    assert.strictEqual(deleteRes.body.deleted_from_group_name, 'Group B');
    assert.strictEqual(deleteRes.body.remaining_questions_in_group, 2);

    // Fetch updated exam
    const afterGet = await httpGet(`${BASE_URL}/api/exams/${multiExamId}`);
    const afterExam = JSON.parse(afterGet.buffer.toString('utf8'));
    const afterGA = afterExam.groups.find((g) => g.id === groupA.id);
    const afterGB = afterExam.groups.find((g) => g.id === groupB.id);
    const afterGC = afterExam.groups.find((g) => g.id === groupC.id);

    // Group B must have 2 questions, re-sequenced
    assert.strictEqual(afterGB.questions.length, 2, 'Group B must now have 2 questions');
    assert.strictEqual(afterGB.questions[0].question_order, 1);
    assert.strictEqual(afterGB.questions[1].question_order, 2);
    assert.ok(!afterGB.questions.some((q) => q.id === questionToDelete.id), 'Deleted question must not be in Group B');

    // CRITICAL: Groups A and C must be 100% untouched! Unrelated questions must NOT be deleted!
    assert.strictEqual(afterGA.questions.length, beforeGA.questions.length, 'Group A question count must NOT change');
    assert.strictEqual(afterGC.questions.length, beforeGC.questions.length, 'Group C question count must NOT change');

    for (let i = 0; i < beforeGA.questions.length; i++) {
      assert.strictEqual(afterGA.questions[i].id, beforeGA.questions[i].id, `Group A Q${i + 1} ID must remain identical`);
      assert.strictEqual(afterGA.questions[i].question_text, beforeGA.questions[i].question_text, `Group A Q${i + 1} text must remain identical`);
    }
    for (let i = 0; i < beforeGC.questions.length; i++) {
      assert.strictEqual(afterGC.questions[i].id, beforeGC.questions[i].id, `Group C Q${i + 1} ID must remain identical`);
      assert.strictEqual(afterGC.questions[i].question_text, beforeGC.questions[i].question_text, `Group C Q${i + 1} text must remain identical`);
    }
  });

  // Test 5: UI Descriptions Inspection
  await test('5. UI Content: ExamWorkspace.tsx describes distinct source-grounded questions across groups', () => {
    const wsPath = path.resolve(process.cwd(), 'src/components/ExamWorkspace.tsx');
    const content = fs.readFileSync(wsPath, 'utf8');

    assert.ok(
      !content.includes('Generates isomorphic parallel exam variants ({getGroupLabelText(groupsCount)}) with\n                  permuted MCQ options and reordered questions'),
      'Must NOT contain outdated permuted options description'
    );
    assert.ok(
      content.includes('Generates distinct, source-grounded parallel exam variants'),
      'Must contain distinct source-grounded parallel exam variants description'
    );
    assert.ok(
      content.includes('Distinct grounded exam variant with synchronized answer key'),
      'Must contain updated group view label'
    );
    assert.ok(
      content.includes('Sibling groups remain intact'),
      'Delete confirmation modal must explicitly state sibling groups remain intact'
    );
  });

  console.log('\n======================================================');
  console.log(`  ALL ${passed}/${total} GROUP A-J OPERATIONS TESTS PASSED!`);
  console.log('======================================================\n');
}

runGroupOperationsSuite().catch((err) => {
  console.error('\nSuite Failed:', err);
  process.exit(1);
});
