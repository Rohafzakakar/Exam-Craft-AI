import assert from 'node:assert';
import { generateGroundedQuestionsForGroups } from '../server.ts';

async function runTests() {
  console.log('Running 5-type exact quota enforcement & backward-compatibility regression tests...');

  const mockDoc = {
    id: 'doc-quota-5types-test',
    session_id: 'default',
    filename: 'Cell_Biology_Reference.pdf',
    file_type: 'application/pdf',
    file_size_bytes: 2048,
    total_pages: 10,
    detected_language: 'en',
    is_rtl: false,
    status: 'indexed',
    metadata: { chapters: ['Cell Architecture', 'Bioenergetics'], total_characters: 1500, pages_info: [] },
    created_at: new Date().toISOString(),
    chunks: [
      {
        id: 'c1',
        document_id: 'doc-quota-5types-test',
        page_number: 1,
        chapter: 'Cell Architecture',
        section: '1.1 Eukaryotic Organelles',
        content: 'Mitochondria generate adenosine triphosphate via oxidative phosphorylation across the folded inner mitochondrial membrane cristae in eukaryotic cells.',
        token_count: 25,
        chunk_index: 0,
      },
      {
        id: 'c2',
        document_id: 'doc-quota-5types-test',
        page_number: 2,
        chapter: 'Cell Architecture',
        section: '1.2 Endomembrane System',
        content: 'Smooth endoplasmic reticulum lacks surface ribosomes and specializes in cellular lipid synthesis, carbohydrate metabolism, and calcium ion storage.',
        token_count: 25,
        chunk_index: 1,
      },
      {
        id: 'c3',
        document_id: 'doc-quota-5types-test',
        page_number: 3,
        chapter: 'Cell Architecture',
        section: '1.3 Nuclear Transport',
        content: 'Nuclear pore complexes selectively regulate macromolecular transport of proteins and ribonucleic acid between the nucleoplasm and surrounding cytoplasm.',
        token_count: 25,
        chunk_index: 2,
      },
      {
        id: 'c4',
        document_id: 'doc-quota-5types-test',
        page_number: 4,
        chapter: 'Bioenergetics',
        section: '2.1 Glycolysis Pathway',
        content: 'Cytosolic glycolysis converts one six-carbon glucose molecule into two three-carbon pyruvate molecules with a net energetic yield of adenosine triphosphate.',
        token_count: 25,
        chunk_index: 3,
      },
      {
        id: 'c5',
        document_id: 'doc-quota-5types-test',
        page_number: 5,
        chapter: 'Bioenergetics',
        section: '2.2 Chloroplast Photolysis',
        content: 'Chloroplast thylakoid membranes absorb solar photons during photosynthetic light reactions to split water molecules and release molecular oxygen.',
        token_count: 25,
        chunk_index: 4,
      },
      {
        id: 'c6',
        document_id: 'doc-quota-5types-test',
        page_number: 6,
        chapter: 'Bioenergetics',
        section: '2.3 Active Membrane Transport',
        content: 'Sodium-potassium adenosine triphosphatase pumps maintain electrochemical gradients across biological membranes through continuous hydrolysis of cellular energy reserves.',
        token_count: 25,
        chunk_index: 5,
      },
    ],
  };

  // Test 1: Zero-quota fill_blank must never be generated (4 questions requested across 4 active types)
  const quotasNoFill = {
    mcq: 1,
    true_false: 1,
    fill_blank: 0,
    short_answer: 1,
    essay: 1,
  };

  const groups1 = generateGroundedQuestionsForGroups(
    mockDoc,
    mockDoc.chunks,
    quotasNoFill,
    { easy: 33, medium: 34, hard: 33 },
    true,
    1,
    'en'
  );

  assert.strictEqual(groups1.length, 1, 'Expected 1 group');
  assert.strictEqual(groups1[0].length, 4, `Expected exact total 4 questions, got ${groups1[0].length}`);

  const counts1 = { mcq: 0, true_false: 0, fill_blank: 0, short_answer: 0, essay: 0 };
  for (const q of groups1[0]) {
    counts1[q.question_type] = (counts1[q.question_type] || 0) + 1;
  }
  assert.deepStrictEqual(counts1, quotasNoFill, 'Exact per-type counts must match requested quotas with fill_blank=0');
  console.log('[PASS] Test 1: Exact 4-question configuration with fill_blank=0 enforced.');

  // Test 2: All 5 supported question types requested once each across 1 group (total = 5)
  const quotasAll5 = {
    mcq: 1,
    true_false: 1,
    fill_blank: 1,
    short_answer: 1,
    essay: 1,
  };

  const groups2 = generateGroundedQuestionsForGroups(
    mockDoc,
    mockDoc.chunks,
    quotasAll5,
    { easy: 33, medium: 34, hard: 33 },
    true,
    1,
    'en'
  );

  assert.strictEqual(groups2.length, 1, 'Expected 1 group');
  assert.strictEqual(groups2[0].length, 5, `Expected exact total 5 questions, got ${groups2[0].length}`);

  const counts2 = { mcq: 0, true_false: 0, fill_blank: 0, short_answer: 0, essay: 0 };
  for (const q of groups2[0]) {
    counts2[q.question_type] = (counts2[q.question_type] || 0) + 1;
    assert(q.source_document_name === mockDoc.filename, 'Source document preserved');
    assert(q.source_page >= 1, 'Source page preserved');
    assert(q.source_evidence && q.source_evidence.length >= 15, 'Source evidence preserved');
  }
  assert.deepStrictEqual(counts2, quotasAll5, 'Exact per-type counts must match all 5 types');
  console.log('[PASS] Test 2: All 5 supported question types generated accurately (total = 5).');

  // Test 3: Reject matching quota on new generation
  let matchingRejected = false;
  try {
    generateGroundedQuestionsForGroups(
      mockDoc,
      mockDoc.chunks,
      { mcq: 1, true_false: 0, fill_blank: 0, short_answer: 0, essay: 0, matching: 1 },
      { easy: 33, medium: 34, hard: 33 },
      true,
      1,
      'en'
    );
  } catch (err) {
    assert(err.message.includes('UNSUPPORTED_QUESTION_TYPE'), `Expected UNSUPPORTED_QUESTION_TYPE, got: ${err.message}`);
    matchingRejected = true;
  }
  assert(matchingRejected, 'Matching Pairs must be rejected for new generation');
  console.log('[PASS] Test 3: Matching Pairs rejected cleanly on new exam generation.');

  // Test 4: Explicit error naming the failing type when a requested type cannot be synthesized
  const shortOnlyDoc = {
    ...mockDoc,
    chunks: [
      {
        id: 'c-short',
        document_id: 'doc-quota-5types-test',
        page_number: 1,
        chapter: 'Summary',
        section: 'Intro',
        content: 'These structures regulate cellular processes continuously across every biological tissue layer.',
        token_count: 11,
        chunk_index: 0,
      },
    ],
  };
  let quotaErrorThrown = false;
  try {
    generateGroundedQuestionsForGroups(
      shortOnlyDoc,
      shortOnlyDoc.chunks,
      { mcq: 0, true_false: 0, fill_blank: 1, short_answer: 0, essay: 0 },
      { easy: 33, medium: 34, hard: 33 },
      false,
      1,
      'en'
    );
  } catch (err) {
    assert(
      err.message.includes('GENERATION_QUOTA_ERROR') && err.message.includes('fill_blank'),
      `Expected GENERATION_QUOTA_ERROR naming fill_blank, got: ${err.message}`
    );
    quotaErrorThrown = true;
  }
  assert(quotaErrorThrown, 'Must throw explicit error naming the failing question type rather than substituting');
  console.log('[PASS] Test 4: Explicit error naming unfulfilled question type thrown without silent substitution.');

  console.log('\nALL 5-TYPE QUOTA ENFORCEMENT TESTS PASSED!');
  process.exit(0);
}

runTests();
