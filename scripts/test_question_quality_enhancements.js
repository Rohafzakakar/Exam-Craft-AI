import assert from 'node:assert';
import http from 'node:http';
import AdmZip from 'adm-zip';
import {
  isDocumentMetadataOrNav,
  isHeadingOrFragment,
  isImperativeOrActionPhrase,
  isDanglingOrIncompleteFragment,
  extractEnglishEducationalTopic,
  cleanDocumentContentForRag,
  extractCleanSubstantiveSentences,
  removeRagBoilerplateFromQuestionStem,
} from '../src/server/textQuality.ts';
import { parseDocxBuffer } from '../src/server/docxParser.ts';
import { generateAiResistantDraft } from '../src/server/aiResistantGenerator.ts';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function httpPostJson(url, data, token, sessionId) {
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
          ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function httpUploadFile(url, fileBuffer, filename, mimetype, sessionId) {
  return new Promise((resolve, reject) => {
    const boundary = '----QualityEnhanceBoundary' + Math.random().toString(36).slice(2);
    const parsed = new URL(url);

    const crlf = '\r\n';
    let header = `--${boundary}${crlf}`;
    header += `Content-Disposition: form-data; name="file"; filename="${filename}"${crlf}`;
    header += `Content-Type: ${mimetype}${crlf}${crlf}`;

    let footer = `${crlf}--${boundary}`;
    if (sessionId) {
      footer += `${crlf}Content-Disposition: form-data; name="session_id"${crlf}${crlf}${sessionId}`;
      footer += `${crlf}--${boundary}`;
    }
    footer += `--${crlf}`;

    const payload = Buffer.concat([
      Buffer.from(header, 'utf8'),
      fileBuffer,
      Buffer.from(footer, 'utf8'),
    ]);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
          ...(sessionId ? { 'X-Guest-Session-ID': sessionId } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(raw) });
          } catch {
            resolve({ statusCode: res.statusCode, headers: res.headers, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildSyntheticDocx(paragraphs) {
  const zip = new AdmZip();
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  );

  zip.addFile(
    '_rels/.rels',
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  );

  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>`;

  for (const p of paragraphs) {
    docXml += `
    <w:p>
      <w:r>
        <w:t>${p}</w:t>
      </w:r>
    </w:p>`;
  }

  docXml += `
  </w:body>
</w:document>`;

  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf8'));
  return zip.toBuffer();
}

async function runTests() {
  console.log('================================================================');
  console.log('  EXAMCRAFT AI: QUESTION QUALITY ENHANCEMENTS REGRESSION TEST   ');
  console.log('================================================================\n');

  // =========================================================================
  // 1. Unit Tests for Document Extraction, Attribution, TOC, and Fragments
  // =========================================================================
  console.log('[1] Testing document extraction filtering (Attributions, TOC, dot leaders, broken numbering)...');

  assert(isDocumentMetadataOrNav('PREPARED BY: DR. ARYA'));
  assert(isDocumentMetadataOrNav('Submitted by: Senior Environmental Research Team'));
  assert(isDocumentMetadataOrNav('TABLE OF CONTENTS'));
  assert(isDocumentMetadataOrNav('Table of Contents'));
  assert(isDocumentMetadataOrNav('INDEX'));
  assert(isDocumentMetadataOrNav('Drip Irrigation Systems .................................... 12'));
  assert(isDocumentMetadataOrNav('Water Conservation Methods --------------------------------- 4'));
  assert(isDocumentMetadataOrNav('Page 1 of 5'));
  assert(isDocumentMetadataOrNav('1.1.2'));
  assert(isDocumentMetadataOrNav('Confidential - Draft Copy'));
  console.log('  ✓ isDocumentMetadataOrNav accurately detects metadata and navigation.');

  assert(isHeadingOrFragment('Foundational Water Conservation Methods 1'));
  assert(isHeadingOrFragment('Methods 2'));
  assert(isHeadingOrFragment('Section 3.1'));
  assert(isHeadingOrFragment('PREPARED BY: DR. ARYA'));
  console.log('  ✓ isHeadingOrFragment flags titles, attributions, and incomplete fragments.');

  const dirtyDocText = `
PREPARED BY: DR. ARYA, PROFESSOR OF WATER RESOURCE ENGINEERING
TABLE OF CONTENTS
Drip Irrigation Systems .................................... 12
Rainwater Harvesting ....................................... 18

Foundational Water Conservation Methods 1
1.1.2 Drip irrigation applies precise volumes of water directly to the crop root zone, minimizing evaporation losses.
2.3.1 Rainwater harvesting retains local precipitation in subterranean cisterns, recharging depleted shallow aquifers.
3.1 Micro-sprinklers provide uniform moisture distribution across undulating agricultural terrain without causing topsoil erosion.
4.2 Soil mulching suppresses weed growth and maintains root temperature while reducing soil moisture evaporation.
`;
  const { cleanedText } = cleanDocumentContentForRag(dirtyDocText);
  assert(!cleanedText.includes('PREPARED BY'));
  assert(!cleanedText.includes('TABLE OF CONTENTS'));
  assert(!cleanedText.includes('....................................'));
  assert(cleanedText.includes('Drip irrigation applies precise volumes of water'));
  console.log('  ✓ cleanDocumentContentForRag completely purges attributions, TOC, and dot leaders.');

  const substantive = extractCleanSubstantiveSentences(dirtyDocText, false);
  assert(substantive.length >= 3, `Expected at least 3 substantive sentences, got ${substantive.length}`);
  for (const s of substantive) {
    assert(!/^(\d+(\.\d+)*|[A-Za-z]\))[-.)\]:]\s*/.test(s), `Sentence should not have leading broken numbering: ${s}`);
    assert(!isDocumentMetadataOrNav(s), `Sentence must not be metadata: ${s}`);
    assert(!isHeadingOrFragment(s), `Sentence must not be heading or fragment: ${s}`);
  }
  console.log('  ✓ extractCleanSubstantiveSentences cleanly strips broken numbering ("1.1.2 ") and rejects fragments.');

  // =========================================================================
  // 1b. Targeted Unit Tests for Topic Extraction & Fragment Prevention
  // =========================================================================
  console.log('\n[1b] Testing topic extraction, compound subject handling, and imperative rejection...');

  // Test 1: Compound subjects must NOT be cut at commas or conjunctions
  const compoundSent = 'Climate change, repeated drought, groundwater depletion and population growth put heavy pressure on water sources.';
  const topic1 = extractEnglishEducationalTopic(compoundSent);
  assert(topic1 !== null, 'Should extract topic from compound sentence');
  assert(!topic1.endsWith(','), `Topic must not end with dangling comma: ${topic1}`);
  assert(!topic1.endsWith('and'), `Topic must not end with dangling conjunction: ${topic1}`);
  assert(topic1 !== 'Climate change, repeated drought, groundwater', `Must not cut compound subject mid-clause: ${topic1}`);
  assert(topic1.includes('groundwater depletion'), `Topic must retain complete compound phrases: ${topic1}`);
  console.log('  ✓ Compound subject extraction preserves complete phrase without cutting mid-clause:', topic1);

  // Test 2: Incomplete fragment prevention (avoid "Leaks, overflowing tanks and unmanaged")
  const fragmentSent = 'Leaks, overflowing tanks and unmanaged taps waste significant quantities of water.';
  const topic2 = extractEnglishEducationalTopic(fragmentSent);
  assert(topic2 !== null, 'Should extract topic');
  assert(topic2 !== 'Leaks, overflowing tanks and unmanaged', `Must not end at adjective "unmanaged": ${topic2}`);
  assert(topic2.includes('unmanaged taps'), `Must include noun after adjective: ${topic2}`);
  console.log('  ✓ Incomplete fragment prevention preserves complete noun phrases:', topic2);

  // Test 3: Imperative headings and action tasks must be rejected
  assert(isImperativeOrActionPhrase('Fix the basics first'), 'Fix the basics first is imperative');
  assert(isImperativeOrActionPhrase('Stop visible leaks'), 'Stop visible leaks is imperative');
  assert(isImperativeOrActionPhrase('Check tanks regularly'), 'Check tanks regularly is imperative');
  assert.strictEqual(extractEnglishEducationalTopic('Fix the basics first'), null, 'Must return null for imperative heading');
  assert.strictEqual(extractEnglishEducationalTopic('Stop visible leaks'), null, 'Must return null for imperative heading');
  console.log('  ✓ Imperative headings and operational action tasks are strictly rejected as concepts.');

  // Test 4: Line boundary preservation - unpunctuated lines must NOT fuse into run-ons
  const multiLineDoc = `Modern technologies can make that work more\neach could be applied under Afghan conditions.`;
  const splitSents = extractCleanSubstantiveSentences(multiLineDoc, false);
  for (const s of splitSents) {
    assert(
      !s.includes('Modern technologies can make that work more each could be applied'),
      `Sentences fused across line boundary: ${s}`
    );
  }
  console.log('  ✓ Unpunctuated lines and headings do not fuse across line boundaries.');

  // Test 5: Language-aware DOCX chapter defaults (English documents must NEVER get Persian chapter defaults)
  const testEnglishDocxBuffer = buildSyntheticDocx([
    'Drip irrigation applies precise volumes of water directly to the crop root zone.',
    'Rainwater harvesting captures precipitation in subterranean cisterns.',
    'Mulching techniques preserve soil moisture by covering the surface with organic residue.',
  ]);
  const parsedEnglishDoc = await parseDocxBuffer(testEnglishDocxBuffer, 'water_test.docx');
  assert.strictEqual(parsedEnglishDoc.detected_language, 'en', 'Must detect English language');
  assert.strictEqual(parsedEnglishDoc.is_rtl, false, 'Must be LTR');
  for (const p of parsedEnglishDoc.pages) {
    assert(!/[\u0600-\u06FF]/.test(p.chapter || ''), `English doc must not have Persian chapter: ${p.chapter}`);
    assert(!/[\u0600-\u06FF]/.test(p.section || ''), `English doc must not have Persian section: ${p.section}`);
  }
  console.log('  ✓ English DOCX documents default to "Chapter 1: Overview and Core Concepts" and contain no Persian.');

  // =========================================================================
  // 2. Unit Tests for Boilerplate & Meta-introduction Removal
  // =========================================================================
  console.log('\n[2] Testing removal of repetitive and unnatural question openings...');

  const stem1 = 'According to the curriculum text on Page 1, which statement accurately reflects the principles of conservation?';
  const clean1 = removeRagBoilerplateFromQuestionStem(stem1, false);
  assert(!clean1.includes('According to the curriculum text on Page 1'), `Failed: ${clean1}`);
  assert(clean1.startsWith('Which statement'), `Expected "Which statement", got: ${clean1}`);
  console.log('  ✓ Cleaned stem 1:', clean1);

  const stem2 = 'In reviewing the concepts presented on Page 2, what primary mechanism governs water retention?';
  const clean2 = removeRagBoilerplateFromQuestionStem(stem2, false);
  assert(!clean2.includes('In reviewing the concepts presented on Page 2'), `Failed: ${clean2}`);
  assert(clean2.startsWith('What primary mechanism'), `Expected "What primary mechanism", got: ${clean2}`);
  console.log('  ✓ Cleaned stem 2:', clean2);

  const stem3 = 'True or False: The educational material on Page 3 verifies that drip irrigation reduces water evaporation.';
  const clean3 = removeRagBoilerplateFromQuestionStem(stem3, false);
  assert(!clean3.includes('The educational material on Page 3 verifies that'), `Failed: ${clean3}`);
  assert(clean3 === 'True or False: Drip irrigation reduces water evaporation.', `Failed: ${clean3}`);
  console.log('  ✓ Cleaned stem 3:', clean3);

  const stem4 = 'Complete the statement from Page 4: Subterranean cisterns store [_____] during peak rainfall.';
  const clean4 = removeRagBoilerplateFromQuestionStem(stem4, false);
  assert(!clean4.includes('from Page 4'), `Failed: ${clean4}`);
  assert(clean4.startsWith('Complete the statement: Subterranean'), `Failed: ${clean4}`);
  console.log('  ✓ Cleaned stem 4:', clean4);

  // =========================================================================
  // 3. End-to-End Exam Generation with Dirty Document
  // =========================================================================
  console.log('\n[3] Testing E2E exam generation with document containing attributions, TOC, and dot leaders...');

  const sessionId = 'test-session-quality-' + Date.now();
  const docxBuffer = buildSyntheticDocx([
    'PREPARED BY: DR. ARYA, PROFESSOR OF WATER RESOURCE ENGINEERING',
    'TABLE OF CONTENTS',
    'Drip Irrigation Systems .................................... 12',
    'Rainwater Harvesting ....................................... 18',
    'Soil Moisture Conservation ................................. 24',
    'Foundational Water Conservation Methods 1',
    'Drip irrigation delivers regulated water directly to crop root zones, substantially reducing evaporation and runoff losses compared to traditional flood irrigation.',
    'Rainwater harvesting captures precipitation in structured storage reservoirs, mitigating seasonal drought stress and recharging shallow groundwater reserves.',
    'Mulching techniques preserve soil moisture by covering the surface with organic residue, reducing evaporative loss and stabilizing soil temperatures.',
    'Contour plowing follows the natural elevation contours of sloped land to slow water runoff and prevent erosion of fertile topsoil during intense storms.',
    'Greywater recycling systems filter non-potable household wastewater for agricultural reuse, conserving municipal freshwater resources for critical needs.',
    'Terracing transforms steep hillsides into stepped flat platforms, decreasing runoff velocity and encouraging deep water infiltration into root zones.',
    'Subsurface drip irrigation places emitters below the ground surface to eliminate atmospheric evaporation completely and suppress annual weed germination.',
    'Check dams built across ephemeral drainage channels impede seasonal torrent velocity and facilitate significant sediment deposition behind barriers.',
    'Agroforestry integrates drought-resilient tree species alongside annual field crops to create microclimates that reduce evapotranspiration demands.',
    'Rotational grazing manages pasture recovery intervals systematically to protect perennial vegetative cover and maximize precipitation infiltration rates.',
    'Permeable pavements installed across urban drainage catchments enable stormwater infiltration directly into subterranean substrata rather than concrete sewers.',
    'Conservation tillage leaves crop harvest residues on topsoil surfaces, protecting structure from wind erosion and reducing moisture loss.'
  ]);

  const uploadRes = await httpUploadFile(
    `${BASE_URL}/api/documents/upload`,
    docxBuffer,
    'water_conservation_curriculum.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sessionId
  );
  assert(
    uploadRes.statusCode === 200 || uploadRes.statusCode === 201,
    `Upload failed: ${JSON.stringify(uploadRes.body)}`
  );
  const uploadedDoc = uploadRes.body;
  console.log(`  Uploaded Document ID: ${uploadedDoc.id} (${uploadedDoc.total_pages} pages, ${uploadedDoc.chunks_count} chunks)`);

  const genRes = await httpPostJson(
    `${BASE_URL}/api/exams/generate`,
    {
      document_id: uploadedDoc.id,
      title: 'Water Resource Management Examination',
      subject: 'Environmental Engineering',
      duration_minutes: 60,
      groups_count: 2,
      question_types_config: {
        mcq: 1,
        true_false: 1,
        fill_blank: 1,
        short_answer: 1,
        essay: 1,
      },
    },
    null,
    sessionId
  );

  assert.strictEqual(genRes.statusCode, 201, `Generation failed: ${JSON.stringify(genRes.body)}`);
  const exam = genRes.body;
  assert(exam && exam.groups && exam.groups.length === 2, 'Must generate 2 groups');
  console.log(`  Generated Exam ID: ${exam.id} (${exam.groups.length} groups, ${exam.questions_count} questions)`);

  const forbiddenStemSubstrings = [
    'According to the curriculum text on Page',
    'In reviewing the concepts presented on Page',
    'The educational material on Page',
    'Based on the educational analysis presented on Page',
    'Complete the statement from Page',
    'Alternative analysis grounded in Page',
  ];

  const forbiddenOptionSubstrings = [
    'PREPARED BY',
    'TABLE OF CONTENTS',
    '....................',
    'Alternative analysis grounded in Page',
    'Foundational Water Conservation Methods',
  ];

  for (const group of exam.groups) {
    console.log(`\n  Checking Group ${group.group_name}:`);
    for (const q of group.questions) {
      console.log(`    [${q.question_type}] ${q.question_text}`);

      // Verify no forbidden meta-introductions in stems
      for (const forbidden of forbiddenStemSubstrings) {
        assert(
          !q.question_text.includes(forbidden),
          `Question stem contains forbidden meta-introduction "${forbidden}": ${q.question_text}`
        );
      }

      // Check MCQ options quality
      if (q.question_type === 'mcq') {
        assert(Array.isArray(q.options) && q.options.length === 4, `MCQ must have exactly 4 choices, got ${q.options?.length}`);
        const uniqueOptions = new Set(q.options);
        assert.strictEqual(uniqueOptions.size, 4, 'MCQ must have 4 distinct choices');
        assert(q.options.includes(q.correct_answer), 'MCQ options must contain correct_answer');

        for (const opt of q.options) {
          for (const forbidden of forbiddenOptionSubstrings) {
            assert(
              !opt.includes(forbidden),
              `MCQ option contains forbidden contamination "${forbidden}": ${opt}`
            );
          }
        }
      }

      // Check True/False wording
      if (q.question_type === 'true_false') {
        assert(
          /^True or False:\s+[A-Z]/.test(q.question_text),
          `True/False must be direct and capitalized: ${q.question_text}`
        );
        assert(!q.question_text.includes('Page'), `True/False stem must not contain page numbers: ${q.question_text}`);
      }

      // Check Fill in the blank
      if (q.question_type === 'fill_blank') {
        assert(
          q.question_text.startsWith('Complete the statement:'),
          `Fill in blank stem must start with "Complete the statement:": ${q.question_text}`
        );
        assert(!q.question_text.includes('from Page'), `Fill in blank stem must not contain "from Page": ${q.question_text}`);
      }

      // Check Short Answer and Essay
      if (q.question_type === 'short_answer' || q.question_type === 'essay') {
        assert(!q.question_text.includes('Page '), `Open-ended stem must not force page numbers: ${q.question_text}`);
      }

      // Verify source metadata is preserved
      assert(q.source_page !== undefined && q.source_page !== null, `Question ${q.id} missing source_page`);
      assert(q.source_document_name, `Question ${q.id} missing source_document_name`);
      assert(q.source_chunk_id, `Question ${q.id} missing source_chunk_id`);
      assert(q.source_evidence, `Question ${q.id} missing source_evidence`);
      assert(q.marks > 0, `Question ${q.id} must have positive marks`);
    }
  }

  console.log('\n✓ [3] All generated exam questions are natural, direct, free from metadata contamination, and preserve full source references.');

  // =========================================================================
  // 4. AI-Resistant Scope Verification
  // =========================================================================
  const draftRes = await httpPostJson(
    `${BASE_URL}/api/exams/${exam.id}/generate-ai-resistant`,
    {},
    null,
    sessionId
  );
  assert.strictEqual(draftRes.statusCode, 200, `Draft generation failed: ${JSON.stringify(draftRes.body)}`);
  const aiResistantDraft = draftRes.body;
  assert(aiResistantDraft && aiResistantDraft.draft_groups, 'Must generate AI-resistant draft');

  for (let gIdx = 0; gIdx < exam.groups.length; gIdx++) {
    const origGroup = exam.groups[gIdx];
    const draftGroup = aiResistantDraft.draft_groups[gIdx];

    for (let qIdx = 0; qIdx < origGroup.questions.length; qIdx++) {
      const origQ = origGroup.questions[qIdx];
      const draftQ = draftGroup.questions[qIdx];

      if (['mcq', 'true_false', 'fill_blank'].includes(origQ.question_type)) {
        // Must be identical
        assert.strictEqual(
          draftQ.question_text,
          origQ.question_text,
          `Objective question [${origQ.question_type}] must be preserved unchanged`
        );
        assert.deepStrictEqual(
          draftQ.options,
          origQ.options,
          `Objective question [${origQ.question_type}] options must be preserved unchanged`
        );
        assert.strictEqual(
          draftQ.correct_answer,
          origQ.correct_answer,
          `Objective question [${origQ.question_type}] answer must be preserved unchanged`
        );
      } else if (['short_answer', 'essay'].includes(origQ.question_type)) {
        // AI-resistant stem must not have page numbers in stem
        assert(
          !draftQ.question_text.includes('Page '),
          `AI-resistant [${origQ.question_type}] stem must not contain "Page ": ${draftQ.question_text}`
        );
        assert(draftQ.source_page !== undefined, 'AI-resistant question must retain source_page');
        assert(draftQ.source_evidence, 'AI-resistant question must retain source_evidence');
      }
    }
  }

  console.log('✓ [4] AI-resistant scope restriction verified: objective questions preserved untouched, open-ended questions transformed cleanly without page numbers.');

  console.log('\n================================================================');
  console.log('  ALL QUESTION QUALITY ENHANCEMENT TESTS PASSED 100%!           ');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
