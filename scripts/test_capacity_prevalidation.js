import { generateGroundedQuestionsForGroups } from '../server.ts';

async function runTest() {
  console.log('Running focused capacity pre-validation test...');
  
  // Mock document and chunks
  const mockDoc = {
    id: 'doc-test',
    filename: 'Test_Document.pdf',
    total_pages: 55,
    detected_language: 'en',
    is_rtl: false,
    chunks: Array.from({ length: 10 }, (_, i) => ({
      id: `chunk-${i + 1}`,
      document_id: 'doc-test',
      page_number: i + 1,
      chapter: 'Chapter 1',
      section: 'Section 1',
      content: `Cellular biology and molecular genetics detail the essential functioning of eukaryotic cells, including nuclear envelope structure and mitochondrial ATP synthesis on page ${i + 1}.`,
      embedding: null,
      created_at: new Date().toISOString(),
    })),
  };

  const chunks = mockDoc.chunks;

  // Test requesting 5 questions vs 4 questions vs 3 questions
  // We can test calling generateGroundedQuestionsForGroups or verifying capacity logic.
  // Since generateGroundedQuestionsForGroups throws INSUFFICIENT_DISTINCT_CONTENT with the capacity when requested > capacity,
  // let's test requesting more than capacity (e.g. 15 questions) and verify the reported capacity number is identical across requests of 15, 16, and 17.

  let capacity15 = null;
  let capacity16 = null;

  try {
    generateGroundedQuestionsForGroups(
      mockDoc,
      chunks,
      { mcq: 15, true_false: 0, fill_blank: 0, short_answer: 0, essay: 0 },
      { easy: 1, medium: 0, hard: 0 },
      false,
      1,
      'en'
    );
  } catch (err) {
    const match = err.message.match(/only (\d+) distinct grounded question/);
    if (match) {
      capacity15 = parseInt(match[1], 10);
    } else {
      console.error('Unexpected error format:', err.message);
    }
  }

  try {
    generateGroundedQuestionsForGroups(
      mockDoc,
      chunks,
      { mcq: 16, true_false: 0, fill_blank: 0, short_answer: 0, essay: 0 },
      { easy: 1, medium: 0, hard: 0 },
      false,
      1,
      'en'
    );
  } catch (err) {
    const match = err.message.match(/only (\d+) distinct grounded question/);
    if (match) {
      capacity16 = parseInt(match[1], 10);
    } else {
      console.error('Unexpected error format:', err.message);
    }
  }

  console.log(`Capacity reported for quota 15: ${capacity15}`);
  console.log(`Capacity reported for quota 16: ${capacity16}`);

  if (capacity15 !== null && capacity16 !== null && capacity15 === capacity16) {
    console.log('SUCCESS: Calculated source capacity remains constant regardless of the requested quota!');
    process.exit(0);
  } else {
    console.error('FAILURE: Calculated source capacity varied based on requested quota.');
    process.exit(1);
  }
}

runTest();
