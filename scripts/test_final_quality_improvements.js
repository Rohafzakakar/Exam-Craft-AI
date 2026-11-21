import assert from 'node:assert';
import {
  cleanDocumentContentForRag,
  isNonSubstantiveOrAckSentence,
  hasUnresolvedLeadingPronoun,
  isVagueGenericPlatitude,
} from '../src/server/textQuality.ts';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runFinalQualityTests() {
  console.log('\n======================================================');
  console.log('  EXAMCRAFT AI: FINAL QUALITY IMPROVEMENTS TEST SUITE');
  console.log('======================================================\n');

  // 1. Unit checks for filtering acknowledgements, unresolved pronouns, and generic platitudes
  assert.strictEqual(
    isNonSubstantiveOrAckSentence('I would like to express my heartfelt thanks to my supervisor for his constant support.'),
    true,
    'Must flag supervisor acknowledgement sentence'
  );
  assert.strictEqual(
    isNonSubstantiveOrAckSentence('This report presents the design and implementation of an examination system.'),
    true,
    'Must flag self-referential report meta-prose'
  );
  assert.strictEqual(
    hasUnresolvedLeadingPronoun('His insights and continuous encouragement helped me complete this project.'),
    true,
    'Must flag unresolved leading pronoun sentence ("His insights...")'
  );
  assert.strictEqual(
    isVagueGenericPlatitude('Technology plays a very important role in modern society.'),
    true,
    'Must flag generic non-testable platitude'
  );
  assert.strictEqual(
    isVagueGenericPlatitude('Role-based access control restricts administrative actions because permission tokens are verified on every API request.'),
    false,
    'Must preserve genuine causal technical sentence'
  );
  console.log('✓ Unit filters reject acknowledgements, meta-prose, unresolved pronouns, and generic platitudes');

  // 2. Unit check: cleanDocumentContentForRag strips front-matter Acknowledgements & Dedication sections
  const rawFrontMatter = `
Acknowledgements
I would like to express my sincere gratitude to my supervisor Dr. Ahmad for his guidance throughout this project.
His insights and continuous encouragement helped me complete this project on time.

Declaration
I hereby declare that this project report is my original work submitted in partial fulfillment of the degree.

Chapter 1: System Architecture
JWT authentication verifies stateless user sessions using cryptographically signed tokens validated by middleware before accessing protected endpoints.
`;
  const cleanedRag = cleanDocumentContentForRag(rawFrontMatter);
  assert(!cleanedRag.cleanedText.includes('His insights'), 'Cleaned RAG text must strip acknowledgement sentences');
  assert(!cleanedRag.cleanedText.includes('hereby declare'), 'Cleaned RAG text must strip declaration boilerplate');
  assert(cleanedRag.cleanedText.includes('JWT authentication verifies stateless user sessions'), 'Cleaned RAG text must preserve technical educational content');
  console.log('✓ RAG cleaner strips Acknowledgements/Declaration boilerplate while preserving technical prose');

  // 3. Live HTTP API smoke test on port 3000 (both mixed projectreport-style and ack-only rejection)
  const teacherEmail = `final_qa_${Date.now()}@edu.af`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Professor Final QA',
      institution: 'Kabul Polytechnic University',
    }),
  });
  assert(regRes.status === 200 || regRes.status === 201, `Teacher registration failed (${regRes.status})`);
  const { token } = await regRes.json();

  const reportText = [
    'Acknowledgements',
    'I would like to express my heartfelt thanks to my supervisor for his constant support.',
    'His insights and continuous encouragement helped me complete this project.',
    'Technology plays a very important role in modern society.',
    '',
    'Chapter 1: Architecture',
    'Role-based authentication verifies cryptographic session tokens before permitting access to protected teacher examination endpoints.',
    'Parameterized database queries prevent SQL injection vulnerabilities by separating user-supplied input from executable SQL command syntax.',
    'Password hashing utilizes salted cryptographic digests so plaintext teacher credentials are never stored inside relational database tables.',
    'Document segmentation partitions uploaded educational PDFs into page-indexed chunks to preserve exact citation metadata during retrieval.',
    'Semantic deduplication compares normalized token overlap across generated items so distinct exam groups evaluate non-overlapping curriculum facts.',
    'Unicode bidirectional shaping preserves right-to-left script connectivity when rendering multilingual assessment papers into PDF documents.',
  ].join('\n');

  const form = new FormData();
  form.append('file', new Blob([reportText], { type: 'text/plain' }), 'projectreport_test.txt');

  const upRes = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert(upRes.status === 200 || upRes.status === 201, `Upload failed (${upRes.status})`);
  const uploadedDoc = await upRes.json();

  const quotas = {
    mcq: 1,
    true_false: 1,
    fill_blank: 1,
    short_answer: 1,
    essay: 1,
  };

  const genRes = await fetch(`${BASE_URL}/api/exams/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      document_id: uploadedDoc.id,
      title: 'Final Quality Check Exam',
      subject: 'Software Engineering',
      groups_count: 1,
      bloom_enabled: true,
      question_types_config: quotas,
    }),
  });
  assert.strictEqual(genRes.status, 201, `HTTP /api/exams/generate failed: ${await genRes.clone().text()}`);
  const exam = await genRes.json();
  assert.strictEqual(exam.groups[0].questions.length, 5, 'HTTP API must return exact 5 questions');

  const bannedSubstrings = [
    'His insights',
    'his insights',
    'heartfelt thanks',
    'supervisor',
    'encouragement',
    'Dedicated to',
    'important role in modern society',
    'passive static structural elements',
    'dynamic real-time modulation',
    'localized offline parameters',
    'without automated continuous execution',
    'outlines its objectives',
  ];

  for (const q of exam.groups[0].questions) {
    for (const banned of bannedSubstrings) {
      assert(!q.question_text.includes(banned), `HTTP API stem contains banned phrase "${banned}": ${q.question_text}`);
    }
  }

  // Cleanup test exam and document via API if available
  await fetch(`${BASE_URL}/api/exams/${exam.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
  await fetch(`${BASE_URL}/api/documents/${uploadedDoc.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
  console.log('✓ Live HTTP /api/exams/generate verified cleanly across all 5 question types');

  // 4. Synchronous direct generation checks via server.ts
  process.env.PORT = '0';
  const { generateGroundedQuestionsForGroups } = await import('../server.ts');

  const mixedDoc = {
    id: 'doc-project-report-quality-test',
    session_id: 'default',
    filename: 'projectreport.pdf',
    file_type: 'application/pdf',
    file_size_bytes: 4096,
    total_pages: 4,
    detected_language: 'en',
    is_rtl: false,
    status: 'indexed',
    metadata: { chapters: ['Front Matter', 'System Architecture', 'Database Design'], total_characters: 2200, pages_info: [] },
    created_at: new Date().toISOString(),
    chunks: [
      {
        id: 'pr-chunk-1',
        document_id: 'doc-project-report-quality-test',
        page_number: 1,
        chapter: 'Front Matter',
        section: 'Acknowledgements',
        content: `
          Acknowledgements
          I would like to express my heartfelt thanks to my supervisor for his valuable guidance.
          His insights and continuous encouragement helped me complete this project successfully.
          Dedicated to my parents and teachers for their constant support.
          This chapter introduces the project report and outlines its objectives.
          Technology plays a very important role in modern society.
        `,
        token_count: 60,
        chunk_index: 0,
      },
      {
        id: 'pr-chunk-2',
        document_id: 'doc-project-report-quality-test',
        page_number: 2,
        chapter: 'Chapter 2: System Architecture',
        section: 'Authentication and Security',
        content: `
          Role-based authentication verifies cryptographic session tokens before permitting access to protected teacher examination endpoints.
          Parameterized database queries prevent SQL injection vulnerabilities by separating user-supplied input from executable SQL command syntax.
          Password hashing utilizes salted cryptographic digests so plaintext teacher credentials are never stored inside relational database tables.
        `,
        token_count: 60,
        chunk_index: 1,
      },
      {
        id: 'pr-chunk-3',
        document_id: 'doc-project-report-quality-test',
        page_number: 3,
        chapter: 'Chapter 3: Retrieval Pipeline',
        section: 'Document Indexing and Validation',
        content: `
          Document segmentation partitions uploaded educational PDFs into page-indexed chunks to preserve exact citation metadata during retrieval.
          Semantic deduplication compares normalized token overlap across generated items so distinct exam groups evaluate non-overlapping curriculum facts.
          Automated schema validation verifies that every multiple-choice item contains four distinct options and a grounded source excerpt.
        `,
        token_count: 60,
        chunk_index: 2,
      },
      {
        id: 'pr-chunk-4',
        document_id: 'doc-project-report-quality-test',
        page_number: 4,
        chapter: 'Chapter 4: Export Rendering',
        section: 'PDF and DOCX Generation',
        content: `
          Unicode bidirectional shaping preserves right-to-left script connectivity when rendering multilingual assessment papers into PDF documents.
          Automated database backups snapshot SQLite state periodically to protect stored examinations against unexpected filesystem corruption.
        `,
        token_count: 45,
        chunk_index: 3,
      },
    ],
  };

  const groups = generateGroundedQuestionsForGroups(
    mixedDoc,
    mixedDoc.chunks,
    quotas,
    { easy: 33, medium: 34, hard: 33 },
    true,
    1,
    'en'
  );

  assert.strictEqual(groups.length, 1, 'Expected 1 group');
  assert.strictEqual(groups[0].length, 5, `Expected exactly 5 questions, got ${groups[0].length}`);

  const typeCounts = { mcq: 0, true_false: 0, fill_blank: 0, short_answer: 0, essay: 0 };

  for (const q of groups[0]) {
    typeCounts[q.question_type] = (typeCounts[q.question_type] || 0) + 1;
    console.log(`  [${q.question_type}] ${q.question_text}`);

    for (const banned of bannedSubstrings) {
      assert(!q.question_text.includes(banned), `Question stem contains banned phrase "${banned}": ${q.question_text}`);
      assert(!q.source_evidence.includes(banned), `Source evidence contains banned phrase "${banned}": ${q.source_evidence}`);
      assert(!q.correct_answer.includes(banned), `Correct answer contains banned phrase "${banned}": ${q.correct_answer}`);
      if (Array.isArray(q.options)) {
        for (const opt of q.options) {
          assert(!opt.includes(banned), `Option contains banned phrase "${banned}": ${opt}`);
        }
      }
    }

    assert(q.source_page >= 2, `Question must draw from substantive pages 2-4, not acknowledgement page 1 (got page ${q.source_page})`);

    if (q.question_type === 'mcq') {
      assert.strictEqual(q.options.length, 4, 'MCQ must have 4 options');
      assert.strictEqual(new Set(q.options.map((o) => o.trim().toLowerCase())).size, 4, 'MCQ options must be 4 distinct strings');
      assert(q.options.includes(q.correct_answer), 'MCQ options must include correct_answer');
      for (const opt of q.options) {
        assert(/[.!?]$/.test(opt.trim()) && opt.trim().length >= 20, `MCQ option must be a full grammatical sentence: "${opt}"`);
      }
    }

    if (q.question_type === 'true_false') {
      assert(/^True or False:\s+[A-Z]/.test(q.question_text), `T/F must start with "True or False:": ${q.question_text}`);
      assert(!/^True or False:\s*(He|She|It|They|His|Her|Their|Its)\b/i.test(q.question_text), `T/F must not start with unresolved pronoun: ${q.question_text}`);
    }

    if (q.question_type === 'fill_blank') {
      assert.strictEqual((q.question_text.match(/\[_____\]/g) || []).length, 1, 'Fill-in-the-blank must have exactly one blank');
      assert(!/-\[_____\]|\[_____\]-|\[_____\]['’]s/i.test(q.question_text), `Blank must not split hyphenated/possessive word: ${q.question_text}`);
      assert(!/ly$/i.test(q.correct_answer), `Fill-in-the-blank target should not be an -ly adverb: "${q.correct_answer}"`);
      assert(!/\ban\s+\[_____\]/i.test(q.question_text), `Blank must not follow "an " awkwardly: ${q.question_text}`);
    }

    if (q.question_type === 'short_answer') {
      assert(!/\bof\s+(His|Her|Their|Its)\s+/i.test(q.question_text), `Short answer must not have ambiguous possessive pronoun: ${q.question_text}`);
      assert(!q.question_text.includes('Page '), `Short answer stem must not force page numbers: ${q.question_text}`);
      assert(q.correct_answer.startsWith('According to the source text'), 'Short answer model answer must cite source text');
    }

    if (q.question_type === 'essay') {
      assert(q.question_text.includes('Learning Objective:'), `Essay prompt must explicitly define Learning Objective: ${q.question_text}`);
      assert(!q.question_text.includes('Page '), `Essay stem must not embed page numbers: ${q.question_text}`);
      assert(q.correct_answer.includes('Comprehensive analytical response grounded in Page'), 'Essay answer must remain structured and grounded');
    }
  }

  assert.deepStrictEqual(typeCounts, quotas, 'Exact 5-type quotas must match 1:1');
  console.log('\n✓ Generated 5-question exam strictly avoids front-matter/platitudes and enforces all per-type quality guarantees');

  // 5. Ack-only document must be rejected cleanly with INSUFFICIENT_EVIDENCE
  const ackOnlyDoc = {
    ...mixedDoc,
    id: 'doc-ack-only-test',
    chunks: [mixedDoc.chunks[0]],
  };
  let ackRejected = false;
  try {
    generateGroundedQuestionsForGroups(ackOnlyDoc, ackOnlyDoc.chunks, { mcq: 1 }, { easy: 33, medium: 34, hard: 33 }, true, 1, 'en');
  } catch (err) {
    assert(err.message.includes('INSUFFICIENT_EVIDENCE'), `Expected INSUFFICIENT_EVIDENCE for ack-only doc, got: ${err.message}`);
    ackRejected = true;
  }
  assert(ackRejected, 'Document containing only acknowledgements/platitudes must be rejected');
  console.log('✓ Acknowledgements-only document cleanly rejected with INSUFFICIENT_EVIDENCE');
  console.log('\nALL FINAL QUALITY IMPROVEMENT TESTS PASSED!\n');
  process.exit(0);
}

runFinalQualityTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
