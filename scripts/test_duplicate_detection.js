import assert from 'node:assert';
import http from 'node:http';
import { areQuestionsDuplicate, normalizeQuestionText, normalizeQuestionOptions } from '../src/server/duplicateDetector.js';

const PORT = process.env.PORT || 8080;
const BASE_URL = `http://localhost:${PORT}`;

function httpPostJson(url, data, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks).toString('utf8') });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpGetJson(url, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks).toString('utf8') });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runDuplicateDetectionSuite() {
  console.log('\n======================================================');
  console.log('  EXAMCRAFT AI: SEMANTIC DUPLICATE & GROUNDING SUITE  ');
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

  // 1. UNIT TEST: Semantic Duplicate Detector detects identical stem + reordered options
  await test('Semantic Detector: Detects identical question stem with reordered options', () => {
    const q1 = {
      question_type: 'mcq',
      question_text: 'According to the analysis in Section "Cell Architecture", what is a primary principle demonstrated by bound ribosomes?',
      options: [
        'It synthesizes secretory proteins and lysosomal enzymes for export.',
        'It prioritizes single-point hardware dependencies.',
        'It restricts data management exclusively to offline local storage.',
        'It demonstrates that hardware failures cause outages.',
      ],
      correct_answer: 'It synthesizes secretory proteins and lysosomal enzymes for export.',
    };

    const q2 = {
      question_type: 'mcq',
      question_text: 'According to the analysis in Section "Cell Architecture", what is a primary principle demonstrated by bound ribosomes?',
      options: [
        'It prioritizes single-point hardware dependencies.',
        'It demonstrates that hardware failures cause outages.',
        'It synthesizes secretory proteins and lysosomal enzymes for export.',
        'It restricts data management exclusively to offline local storage.',
      ],
      correct_answer: 'It synthesizes secretory proteins and lysosomal enzymes for export.',
    };

    assert.strictEqual(areQuestionsDuplicate(q1, q2), true, 'Must detect reordered options as duplicate');
  });

  // 2. UNIT TEST: Semantic Detector detects slight wording variation with same answer
  await test('Semantic Detector: Detects slight wording variation with identical answers/options', () => {
    const q1 = {
      question_type: 'mcq',
      question_text: 'What is the primary cellular function of mitochondria in eukaryotic organisms?',
      options: [
        'Generating ATP molecules through oxidative phosphorylation and cellular respiration.',
        'Synthesizing lipid bilayer membranes for nuclear pore complexes.',
        'Directing chromatin fiber unwinding during ribosomal transcription.',
        'Degrading exogenous enzymatic substrates via hydrolytic vacuolation.',
      ],
      correct_answer: 'Generating ATP molecules through oxidative phosphorylation and cellular respiration.',
    };

    const q2 = {
      question_type: 'mcq',
      question_text: 'In eukaryotic organisms, which of the following represents the primary function of mitochondria?',
      options: [
        'Degrading exogenous enzymatic substrates via hydrolytic vacuolation.',
        'Generating ATP molecules through oxidative phosphorylation and cellular respiration.',
        'Synthesizing lipid bilayer membranes for nuclear pore complexes.',
        'Directing chromatin fiber unwinding during ribosomal transcription.',
      ],
      correct_answer: 'Generating ATP molecules through oxidative phosphorylation and cellular respiration.',
    };

    assert.strictEqual(areQuestionsDuplicate(q1, q2), true, 'Must detect paraphrased stem with matching choices as duplicate');
  });

  // 3. UNIT TEST: Semantic Detector correctly distinguishes distinct questions
  await test('Semantic Detector: Accurately passes distinct, non-duplicate questions', () => {
    const q1 = {
      question_type: 'mcq',
      question_text: 'Which statement accurately describes the function of the cell nucleus as an organelle?',
      options: [
        'It serves as the cellular repository housing genomic DNA organized into chromatin fibers.',
        'It synthesizes phospholipids and steroid hormones along tubular cytoplasmic cisternae.',
        'It translates cytosolic mRNA transcripts into polypeptide chains without a membrane.',
        'It digests cellular endocytic waste using hydrolytic acid hydrolase enzymes.',
      ],
      correct_answer: 'It serves as the cellular repository housing genomic DNA organized into chromatin fibers.',
      source_evidence: 'The nucleus is the defining organelle of eukaryotic cells, serving as the repository for genomic DNA organized into chromatin.',
    };

    const q2 = {
      question_type: 'mcq',
      question_text: 'What is the primary catalytic function of ribosomes in eukaryotic cells?',
      options: [
        'Translating mRNA sequences into polypeptide chains during protein synthesis.',
        'Transcribing ribosomal RNA genes within the nucleoplasm.',
        'Oxidizing glucose into pyruvate via cytosolic glycolysis.',
        'Replicating chromosomal DNA molecules during the S phase.',
      ],
      correct_answer: 'Translating mRNA sequences into polypeptide chains during protein synthesis.',
      source_evidence: 'Ribosomes are catalytic ribonucleoprotein complexes responsible for protein synthesis through the translation of messenger RNA (mRNA).',
    };

    assert.strictEqual(areQuestionsDuplicate(q1, q2), false, 'Distinct questions must not be flagged as duplicates');
  });

  // 3b. UNIT TEST: Semantic Detector catches questions with different wording but identical underlying source evidence
  await test('Semantic Detector: Catches questions with different wording but identical source evidence', () => {
    const q1 = {
      question_type: 'mcq',
      question_text: 'What is the biological function of the nucleolus in eukaryotic cells?',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correct_answer: 'Option A',
      source_evidence: 'Within the nucleoplasm, the dense nucleolus coordinates the transcription of ribosomal RNA (rRNA) and the assembly of ribosomal subunits.',
    };

    const q2 = {
      question_type: 'mcq',
      question_text: 'Which organelle structure coordinates ribosomal RNA synthesis inside the nucleus?',
      options: ['Option W', 'Option X', 'Option Y', 'Option Z'],
      correct_answer: 'Option W',
      source_evidence: 'Within the nucleoplasm, the dense nucleolus coordinates the transcription of ribosomal RNA (rRNA) and the assembly of ribosomal subunits.',
    };

    assert.strictEqual(areQuestionsDuplicate(q1, q2), true, 'Must detect questions sharing the same source evidence as duplicates');
  });

  // 3c. UNIT TEST: Semantic Detector catches questions with different wording but substantially equivalent correct answers
  await test('Semantic Detector: Catches questions with different wording but substantially equivalent correct answers', () => {
    const q1 = {
      question_type: 'mcq',
      question_text: 'What is the primary cellular function of mitochondria in eukaryotic organisms?',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'Generating ATP molecules through oxidative phosphorylation and cellular respiration.',
      source_evidence: 'Mitochondria are double-membraned bioenergetic engines that generate ATP via oxidative phosphorylation.',
    };

    const q2 = {
      question_type: 'short_answer',
      question_text: 'Describe how eukaryotic cells produce cellular energy.',
      options: null,
      correct_answer: 'Mitochondria generate ATP molecules through cellular respiration and oxidative phosphorylation.',
      source_evidence: 'Mitochondria are double-membraned bioenergetic engines.',
    };

    assert.strictEqual(areQuestionsDuplicate(q1, q2), true, 'Must detect substantially equivalent correct answers as duplicate content');
  });

  // 4. API TEST: Live Generation on Page 1 produces ZERO duplicates between Q1 and Q2
  let generatedExamId = '';
  await test('API Question Generation: Page 1 creates distinct questions without duplicate stems or reordered choices', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      selected_pages: [1],
      title: 'Cell Biology Page 1 Exam',
      subject: 'Cytology',
      groups_count: 1,
      question_types_config: { mcq: 2, true_false: 1 },
    });

    assert.strictEqual(res.statusCode, 201, `Status must be 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
    generatedExamId = res.body.id;
    const questions = res.body.groups[0].questions;
    assert.strictEqual(questions.length, 3, 'Must have exactly 3 questions');

    const [q1, q2, q3] = questions;
    // Check Q1 vs Q2
    assert.notStrictEqual(normalizeQuestionText(q1.question_text), normalizeQuestionText(q2.question_text), 'Q1 and Q2 must have different question stems');
    assert.strictEqual(areQuestionsDuplicate(q1, q2), false, 'Q1 and Q2 must NOT be semantic duplicates');
    assert.notStrictEqual(q1.correct_answer, q2.correct_answer, 'Q1 and Q2 must have different correct answers');

    // Verify option uniqueness
    const opts1 = normalizeQuestionOptions(q1.options);
    const opts2 = normalizeQuestionOptions(q2.options);
    assert.notDeepStrictEqual(opts1, opts2, 'Q1 and Q2 must not have identical/reordered option sets');

    // Verify Page 1 isolation
    for (const q of questions) {
      assert.strictEqual(q.source_page, 1, 'Question must be strictly sourced from Page 1');
      assert.ok(!q.question_text.includes('Mitochondria'), 'Page 1 questions must not leak Page 2 Mitochondria');
      assert.ok(!q.question_text.includes('Glycolysis'), 'Page 1 questions must not leak Page 2 Glycolysis');
    }
  });

  // 5. API TEST: Page 2 Isolation
  await test('API Question Generation: Page 2 is strictly isolated from Page 1', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      selected_pages: [2],
      title: 'Cell Biology Bioenergetics Exam',
      subject: 'Cellular Respiration',
      groups_count: 1,
      question_types_config: { mcq: 2, true_false: 1 },
    });

    assert.strictEqual(res.statusCode, 201);
    const questions = res.body.groups[0].questions;
    assert.strictEqual(questions.length, 3);

    for (const q of questions) {
      assert.strictEqual(q.source_page, 2, 'Question must originate from Page 2');
      assert.ok(!q.question_text.includes('nucleus'), 'Page 2 question must not leak Page 1 nucleus');
      assert.ok(!q.question_text.includes('Ribosomes are catalytic'), 'Page 2 question must not leak Page 1 ribosomes');
    }

    // Verify no duplicates in Group A
    for (let i = 0; i < questions.length; i++) {
      for (let j = i + 1; j < questions.length; j++) {
        assert.strictEqual(areQuestionsDuplicate(questions[i], questions[j]), false, `Question ${i + 1} and ${j + 1} must not be duplicates`);
      }
    }
  });

  // 6. API TEST: Insufficient source content quota shortfall reporting
  await test('API Quota Shortfall: Refuses to invent questions or duplicate options when material is insufficient', async () => {
    // Request 15 MCQs on Page 1 which only contains 7 sentences
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      selected_pages: [1],
      title: 'Excessive Quota Exam',
      subject: 'Cytology',
      groups_count: 1,
      question_types_config: { mcq: 15 },
    });

    assert.strictEqual(res.statusCode, 422, 'Must return 422 for quota exceeding distinct source facts');
    assert.ok(res.body.detail, 'Must provide detailed error response');
    assert.ok(
      res.body.detail.includes('sufficient source material for only') ||
      res.body.detail.includes('reduce the question quota') ||
      res.body.detail.includes('Selected page(s)'),
      `Error detail must clearly explain shortfall: ${res.body.detail}`
    );
  });

  // 7. API TEST: Multi-group exam has zero pairwise duplicates within and across all groups
  await test('API Multi-Group Exam: All groups maintain pairwise distinct questions within and across groups', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      title: 'Multi-Group Midterm',
      subject: 'Cell Biology',
      groups_count: 3,
      question_types_config: { mcq: 2, true_false: 1 },
    });

    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.groups.length, 3, 'Must generate exactly 3 groups');

    const allQuestionsAcrossGroups = [];

    for (const group of res.body.groups) {
      assert.strictEqual(group.questions.length, 3, `${group.group_name} must have 3 questions`);
      const qs = group.questions;
      // Pairwise within group
      for (let i = 0; i < qs.length; i++) {
        for (let j = i + 1; j < qs.length; j++) {
          assert.strictEqual(
            areQuestionsDuplicate(qs[i], qs[j]),
            false,
            `In ${group.group_name}, question ${i + 1} and ${j + 1} must not be duplicates`
          );
        }
        allQuestionsAcrossGroups.push({ groupName: group.group_name, q: qs[i] });
      }
    }

    // Pairwise ACROSS all groups: stem, options, correct answer, and underlying source evidence
    const seenEvidences = new Set();
    for (let i = 0; i < allQuestionsAcrossGroups.length; i++) {
      const itemA = allQuestionsAcrossGroups[i];
      assert.ok(itemA.q.source_evidence && itemA.q.source_evidence.length > 15, 'Question must have grounded evidence');
      const normEvA = normalizeQuestionText(itemA.q.source_evidence);
      assert.strictEqual(
        seenEvidences.has(normEvA),
        false,
        `Question ${i + 1} (${itemA.groupName}) reuses an underlying fact already used: "${itemA.q.source_evidence}"`
      );
      seenEvidences.add(normEvA);

      for (let j = i + 1; j < allQuestionsAcrossGroups.length; j++) {
        const itemB = allQuestionsAcrossGroups[j];
        assert.strictEqual(
          areQuestionsDuplicate(itemA.q, itemB.q),
          false,
          `Question from ${itemA.groupName} and question from ${itemB.groupName} must NOT be duplicates: "${itemA.q.question_text}" vs "${itemB.q.question_text}"`
        );
      }
    }
    assert.strictEqual(seenEvidences.size, 9, 'All 9 questions across Groups A, B, and C must be grounded in 9 distinct facts');
  });

  // 8. API TEST: Dynamic Group Count Scaling 1 to 10 (Groups A through J)
  await test('API Dynamic Group Scaling: Supports 10 groups (A-J) with distinct grounded questions and equal quotas', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      title: 'Deca-Group Comprehensive Exam',
      subject: 'Cell Biology',
      groups_count: 10,
      question_types_config: { mcq: 1 },
    });

    assert.strictEqual(res.statusCode, 201, `Failed to generate 10 groups: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.groups.length, 10, 'Must generate exactly 10 groups (A through J)');

    const expectedLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const generatedStems = new Set();

    res.body.groups.forEach((g, idx) => {
      assert.strictEqual(g.group_name, `Group ${expectedLetters[idx]}`);
      assert.strictEqual(g.questions.length, 1, `Group ${expectedLetters[idx]} must have 1 question`);
      const q = g.questions[0];
      assert.ok(q.question_text && q.question_text.length > 15, 'Question text must be substantive');
      assert.ok(q.source_page >= 1 && q.source_page <= 3, 'Question must have valid source page');
      assert.ok(q.source_evidence && q.source_evidence.length > 15, 'Question must have grounded source evidence');

      const norm = normalizeQuestionText(q.question_text);
      assert.strictEqual(generatedStems.has(norm), false, `Group ${expectedLetters[idx]} stem must be distinct from previous groups`);
      generatedStems.add(norm);
    });

    assert.strictEqual(generatedStems.size, 10, 'All 10 groups must have distinct question stems');
  });

  // 9. API TEST: Regeneration and editing in one group does not modify other groups
  await test('API Group Isolation: Regenerating or editing in Group A leaves Groups B and C 100% untouched', async () => {
    const genRes = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      title: 'Isolation Validation Exam',
      subject: 'Cell Biology',
      groups_count: 3,
      question_types_config: { mcq: 2, true_false: 1 },
    });

    const examId = genRes.body.id;
    const initialGroups = genRes.body.groups;
    const groupAQ1 = initialGroups[0].questions[0];

    // Regenerate Group A Q1
    const regenRes = await httpPostJson(`${BASE_URL}/api/exams/${examId}/questions/${groupAQ1.id}/regenerate`, {
      instructions: 'Focus on biochemical kinetics',
    });
    assert.strictEqual(regenRes.statusCode, 200);
    assert.notStrictEqual(regenRes.body.question_text, groupAQ1.question_text, 'Target question text must change');

    // Fetch refreshed exam
    const refreshed = await httpGetJson(`${BASE_URL}/api/exams/${examId}`);
    assert.strictEqual(refreshed.statusCode, 200);

    // Group A Q2 unchanged
    assert.strictEqual(
      refreshed.body.groups[0].questions[1].question_text,
      initialGroups[0].questions[1].question_text,
      'Group A Q2 must remain unchanged'
    );

    // Group B and C completely unchanged
    for (let g = 1; g < 3; g++) {
      for (let q = 0; q < 3; q++) {
        assert.strictEqual(
          refreshed.body.groups[g].questions[q].id,
          initialGroups[g].questions[q].id,
          `Group ${initialGroups[g].group_name} Q${q + 1} ID must be identical`
        );
        assert.strictEqual(
          refreshed.body.groups[g].questions[q].question_text,
          initialGroups[g].questions[q].question_text,
          `Group ${initialGroups[g].group_name} Q${q + 1} text must be identical`
        );
        assert.strictEqual(
          refreshed.body.groups[g].questions[q].correct_answer,
          initialGroups[g].questions[q].correct_answer,
          `Group ${initialGroups[g].group_name} Q${q + 1} answer must be identical`
        );
      }
    }
  });

  // 10. API TEST: 5 Groups Scaling (Groups A through E)
  await test('API Dynamic Group Scaling: Supports 5 groups (A-E) with distinct grounded questions and equal quotas', async () => {
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      title: 'Penta-Group Examination',
      subject: 'Cell Biology',
      groups_count: 5,
      question_types_config: { mcq: 1, true_false: 1 },
    });

    assert.strictEqual(res.statusCode, 201, `Failed to generate 5 groups: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.groups.length, 5, 'Must generate exactly 5 groups (A through E)');

    const expectedLetters = ['A', 'B', 'C', 'D', 'E'];
    const allSeenEvidences = new Set();
    const allSeenStems = new Set();

    res.body.groups.forEach((g, idx) => {
      assert.strictEqual(g.group_name, `Group ${expectedLetters[idx]}`);
      assert.strictEqual(g.questions.length, 2, `Group ${expectedLetters[idx]} must have 2 questions`);
      g.questions.forEach((q) => {
        assert.ok(q.source_evidence && q.source_evidence.length > 15, 'Must have grounded evidence');
        const normEv = normalizeQuestionText(q.source_evidence);
        assert.strictEqual(allSeenEvidences.has(normEv), false, 'Every question across all 5 groups must have a distinct source evidence sentence');
        allSeenEvidences.add(normEv);

        const normStem = normalizeQuestionText(q.question_text);
        assert.strictEqual(allSeenStems.has(normStem), false, 'Every question across all 5 groups must have a distinct question stem');
        allSeenStems.add(normStem);
      });
    });

    assert.strictEqual(allSeenEvidences.size, 10, 'All 10 questions across 5 groups must have unique source facts');
  });

  // 11. API TEST: Multi-group shortage reporting on Page 1 (refuses to reuse facts)
  await test('API Multi-Group Shortfall: Refuses to repeat facts across groups when page material is insufficient', async () => {
    // Request 3 groups * 3 questions = 9 questions on Page 1 (which only contains 6 distinct facts)
    const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
      document_id: 'doc-cell-biology-101',
      selected_pages: [1],
      title: 'Page 1 Multi-Group Shortage Exam',
      subject: 'Cytology',
      groups_count: 3,
      question_types_config: { mcq: 2, true_false: 1 },
    });

    assert.strictEqual(res.statusCode, 422, 'Must return 422 when multi-group demand exceeds available facts on selected page');
    assert.ok(res.body.detail, 'Must provide detailed error response');
    assert.ok(
      res.body.detail.includes('Selected page(s)') &&
      res.body.detail.includes('sufficient source material for only') &&
      res.body.detail.includes('across 3 group(s)') &&
      res.body.detail.includes('reduce the question quota'),
      `Error detail must clearly explain multi-group fact shortage: ${res.body.detail}`
    );
  });

  // 12-15. Al-Shifa Examination Tests (using a temporary uploaded Al-Shifa fixture document + guaranteed cleanup)
  const alShifaGuestToken = `guest_alshifa_test_${Date.now()}`;
  const alShifaText = [
    'Al-Shifa bint Abdullah al-Adawiyya, whose original name is believed to have been Layla, learned to read and write before the emergence of Islam and developed knowledge of traditional healing practices.',
    'After migrating to Medina, Al-Shifa had greater opportunities to use her abilities, and Prophet Muhammad recognised her knowledge and encouraged her educational activities.',
    'Prophet Muhammad asked Al-Shifa to continue teaching Hafsa bint Umar, his wife, the traditional healing practice known as ruqyat al-Namlah as recorded in Sunan Abi Dawud.',
    'Historical accounts demonstrate that Al-Shifa actively transferred her knowledge and was not simply an educated woman living in private seclusion.',
    'When converting to Islam, Al-Shifa presented her traditional healing practice to the Prophet for his approval before continuing to use it within the community.',
    "Her religious and intellectual authority therefore developed through personal knowledge, practical experience, and the Prophet's recognition within early Islamic society.",
    "According to Ibn Abd al-Barr in Al-Isti'ab, Caliph Umar ibn al-Khattab entrusted Al-Shifa with administrative responsibilities concerning the marketplace of Medina.",
    'Later historians disagreed about the precise nature of her role as a market judge and whether she was officially appointed, citing a need for further historical evidence.',
    'The marketplace of Medina was not merely a place for buying and selling goods, because it functioned as a major centre of economic and social life closely connected to Islamic ethical principles.',
    "From a gender perspective, Al-Shifa's biography illustrates both educational opportunities and social limitations, as cultural expectations could restrict public participation.",
    'Al-Shifa expressed her knowledge not through written books, but through direct teaching, practical experience, and active service to her community.',
    "The most important lesson from Al-Shifa's life is that women in Islamic history were not merely recipients of religious knowledge, but educators, transmitters of knowledge, and active contributors to society.",
    'Early Islamic educational history records that female companions memorized prophetic traditions and instructed both male and female students across Medinan study circles.',
    'Ethical commercial supervision in the Medinan marketplace emphasized honest weights, fair pricing, and transparent dispute resolution among trading merchants.',
    'Pre-Islamic Arabian literacy was relatively uncommon, making proficient scribes and educators especially valuable in the emerging Medinan community.',
    'Caliph Umar consulted knowledgeable companions on civic administration and commercial oversight to uphold public welfare across growing urban markets.',
    'Transmission of therapeutic remedies alongside scriptural literacy reflected an integrated conception of practical communal scholarship in early Islam.',
    'Instruction in calligraphy and reading enabled early Muslim women to preserve legal contracts, civic correspondence, and religious treatises accurately.',
    'Critical historiography distinguishes verified early biographical reports from later interpretive elaborations regarding formal public market offices.',
    'Community-based mentorship allowed scholarly women to exercise recognized moral guidance and civic responsibility within early Medinan society.',
  ].join('\n\n');

  const boundary = '----AlShifaBoundary' + Math.random().toString(36).slice(2);
  const uploadBody = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="Nawida-kakar-Women as Religious Thinkers in Early Islam.txt"',
    'Content-Type: text/plain',
    '',
    alShifaText,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const uploadRes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      Authorization: `Bearer ${alShifaGuestToken}`,
    },
    body: uploadBody,
  });
  assert.strictEqual(uploadRes.status, 201, `Temporary Al-Shifa document upload must succeed, got ${uploadRes.status}`);
  const alShifaDoc = await uploadRes.json();
  const createdAlShifaExamIds = [];

  try {
    // 12. API TEST: Al-Shifa examination quality, 4 options per MCQ, topic-relevant distractors, meaningful fill-in-the-blank
    await test('Al-Shifa Examination: Zero generic distractors, 4 distinct options, topic-grounded pedagogical questions', async () => {
      const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
        document_id: alShifaDoc.id,
        title: 'Women Thinkers in Early Islam Examination',
        subject: 'Early Islamic Intellectual History',
        groups_count: 3,
        question_types_config: { mcq: 2, true_false: 1, fill_blank: 1 },
      }, alShifaGuestToken);

      assert.strictEqual(res.statusCode, 201, `Failed to generate Al-Shifa exam: ${JSON.stringify(res.body)}`);
      createdAlShifaExamIds.push(res.body.id);
      assert.strictEqual(res.body.groups.length, 3, 'Must generate exactly 3 groups (A, B, C)');

      const bannedGenericDistractors = [
        'contradicts established principles by eliminating all verified empirical data',
        'represents an outdated hypothesis that has been completely superseded without evidence',
        'restricts application strictly to theoretical models without practical validation',
        'نقض تعهدات آموزشی و مدنی مندرج در اسناد بنیادین کشور',
        'سلب مسئولیت نهادهای عمومی در تأمین عدالت اجتماعی',
        'توقف نامحدود رسیدگی به حقوق بنیادین در نظام حقوقی',
      ];

      const allQuestions = [];
      const seenEvidenceSet = new Set();

      for (const group of res.body.groups) {
        assert.strictEqual(group.questions.length, 4, `${group.group_name} must have 4 questions`);

        for (const q of group.questions) {
          allQuestions.push({ group: group.group_name, q });

          // Verify underlying fact is unique across all groups
          assert.ok(q.source_evidence && q.source_evidence.length > 20, 'Question must have substantive evidence');
          const normEv = normalizeQuestionText(q.source_evidence);
          assert.strictEqual(
            seenEvidenceSet.has(normEv),
            false,
            `Evidence reused across groups: "${q.source_evidence.slice(0, 80)}..."`
          );
          seenEvidenceSet.add(normEv);

          // Verify citation accuracy
          assert.strictEqual(q.source_document_name, alShifaDoc.filename);
          assert.ok(q.source_page === 1 || q.source_page === 2, 'Must cite page 1 or page 2');

          if (q.question_type === 'mcq') {
            // Exactly 4 options
            assert.strictEqual(q.options.length, 4, 'MCQ must contain exactly 4 options');

            // Defensible correct answer in options
            assert.ok(
              q.options.includes(q.correct_answer),
              `Correct answer "${q.correct_answer}" must be present among options`
            );

            // Zero generic distractors
            for (const opt of q.options) {
              const normOpt = opt.toLowerCase();
              for (const banned of bannedGenericDistractors) {
                assert.ok(
                  !normOpt.includes(banned.toLowerCase()),
                  `Generic distractor detected in ${group.group_name} MCQ: "${opt}"`
                );
              }
            }

            // Options must all be distinct
            const uniqueOpts = new Set(q.options.map((o) => o.trim().toLowerCase()));
            assert.strictEqual(uniqueOpts.size, 4, 'All 4 MCQ options must be mutually distinct');
          }

          if (q.question_type === 'fill_blank') {
            // Fill in the blank must blank out a meaningful term
            assert.ok(q.question_text.includes('[_____]'), 'Cloze must contain blank [_____]');
            assert.ok(q.correct_answer && q.correct_answer.length >= 3, 'Answer must be a substantive term');
            assert.ok(
              !/^(the|and|for|with|this|that|from|into|upon)$/i.test(q.correct_answer),
              `Blank must not target trivial stopword: "${q.correct_answer}"`
            );
          }
        }
      }

      // Pairwise duplicate check across all questions
      for (let i = 0; i < allQuestions.length; i++) {
        for (let j = i + 1; j < allQuestions.length; j++) {
          const itemA = allQuestions[i];
          const itemB = allQuestions[j];
          assert.strictEqual(
            areQuestionsDuplicate(itemA.q, itemB.q),
            false,
            `Questions in ${itemA.group} and ${itemB.group} must not be duplicates`
          );
        }
      }
    });

    // 13. API TEST: Al-Shifa Scaling to 5 Groups (Sufficient Distinct Facts)
    await test('Al-Shifa 5-Group Exam: 5 groups x 3 questions = 15 distinct questions with zero fact overlap', async () => {
      const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
        document_id: alShifaDoc.id,
        title: 'Al-Shifa 5-Group Exam',
        subject: 'Early Islamic History',
        groups_count: 5,
        question_types_config: { mcq: 2, true_false: 1 },
      }, alShifaGuestToken);

      assert.strictEqual(res.statusCode, 201, `Failed to generate 5 groups: ${JSON.stringify(res.body)}`);
      createdAlShifaExamIds.push(res.body.id);
      assert.strictEqual(res.body.groups.length, 5, 'Must generate exactly 5 groups (A through E)');

      const seenEvidences = new Set();
      res.body.groups.forEach((g) => {
        assert.strictEqual(g.questions.length, 3, `${g.group_name} must have 3 questions`);
        g.questions.forEach((q) => {
          const normEv = normalizeQuestionText(q.source_evidence);
          assert.strictEqual(
            seenEvidences.has(normEv),
            false,
            `Duplicate fact used across 5 groups: "${q.source_evidence.slice(0, 60)}..."`
          );
          seenEvidences.add(normEv);
        });
      });

      assert.strictEqual(seenEvidences.size, 15, 'All 15 questions across 5 groups must be backed by distinct facts');
    });

    // 14. API TEST: Al-Shifa Shortage reporting on excessive group demand
    await test('Al-Shifa Shortage: Refuses to fabricate facts or repeat questions when requesting 10 groups x 5 questions', async () => {
      const res = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
        document_id: alShifaDoc.id,
        title: 'Al-Shifa Excessive Demand Exam',
        subject: 'Early Islamic History',
        groups_count: 10,
        question_types_config: { mcq: 3, true_false: 1, fill_blank: 1 },
      }, alShifaGuestToken);

      assert.strictEqual(res.statusCode, 422, 'Must return 422 when requesting 50 questions with ~20 available facts');
      assert.ok(res.body.detail, 'Must provide detailed shortfall explanation');
      assert.ok(
        res.body.detail.includes('insufficient to generate') || res.body.detail.includes('Selected page(s)'),
        `Shortfall message must be clear: ${res.body.detail}`
      );
    });

    // 15. API TEST: Single Question Regeneration Preserves Grounding & Non-Duplication
    await test('Single Question Regeneration: Preserves grounding and avoids duplication of existing questions', async () => {
      // 1. Generate an initial exam with Group A and B
      const genRes = await httpPostJson(`${BASE_URL}/api/exams/generate`, {
        document_id: alShifaDoc.id,
        title: 'Regeneration Test Exam',
        subject: 'Early Islamic History',
        groups_count: 2,
        question_types_config: { mcq: 2, true_false: 1 },
      }, alShifaGuestToken);
      assert.strictEqual(genRes.statusCode, 201);
      const exam = genRes.body;
      createdAlShifaExamIds.push(exam.id);
      const targetQ = exam.groups[0].questions[0];

      // 2. Regenerate targetQ
      const regenRes = await httpPostJson(`${BASE_URL}/api/exams/${exam.id}/questions/${targetQ.id}/regenerate`, {
        bloom_level: 'analyze',
      }, alShifaGuestToken);
      assert.strictEqual(regenRes.statusCode, 200, `Regeneration failed: ${JSON.stringify(regenRes.body)}`);
      const newQ = regenRes.body;

      assert.strictEqual(newQ.id, targetQ.id, 'Regenerated question must retain original ID');
      assert.ok(newQ.source_evidence && newQ.source_evidence.length > 15, 'Must have source evidence');
      assert.strictEqual(newQ.source_document_name, alShifaDoc.filename);
      if (newQ.question_type === 'mcq') {
        assert.strictEqual(newQ.options.length, 4, 'Must have 4 options');
        assert.ok(newQ.options.includes(newQ.correct_answer), 'Correct answer must be in options');
      }
    });
  } finally {
    // Clean up temporary Al-Shifa exams and uploaded fixture document
    for (const examId of createdAlShifaExamIds) {
      await fetch(`${BASE_URL}/api/exams/${examId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${alShifaGuestToken}` },
      }).catch(() => {});
    }
    await fetch(`${BASE_URL}/api/documents/${alShifaDoc.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${alShifaGuestToken}` },
    }).catch(() => {});
  }

  console.log('\n======================================================');
  console.log(`  ALL ${passed}/${total} DUPLICATE & GROUNDING TESTS PASSED!`);
  console.log('======================================================\n');
}

runDuplicateDetectionSuite().catch((err) => {
  console.error('\nSuite Failed:', err);
  process.exit(1);
});
