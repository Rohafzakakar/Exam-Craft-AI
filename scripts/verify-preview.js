import pkg from '/usr/local/share/bun-global/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import fs from 'node:fs';

const ARTIFACT_SCREENSHOT_DIR = '/.aistudio/artifacts/brain/794b0660-b814-4638-b039-735bf3619fb0/screenshots';
fs.mkdirSync(ARTIFACT_SCREENSHOT_DIR, { recursive: true });

async function verifyPreviewAndRTL() {
  const browser = await chromium.launch({
    executablePath: '/ms-playwright/chromium-1254/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const viewports = [
    { name: 'mobile_375x812', width: 375, height: 812 },
    { name: 'tablet_portrait_768x1024', width: 768, height: 1024 },
    { name: 'desktop_1440x900', width: 1440, height: 900 }
  ];

  for (const vp of viewports) {
    console.log(`Checking Paper Preview and Answer Key on ${vp.name}...`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    // Login and open active exam
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const testEmail = 'test.preview.verify@example.edu';
      const testPass = 'TestPreviewPass#2026';
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPass, full_name: 'Dr. Preview', institution: 'Test University' })
      }).catch(() => {});
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPass })
      });
      const data = await res.json();
      localStorage.setItem('examcraft_token', data.token);
      localStorage.setItem('examcraft_user', JSON.stringify(data.user));
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    // Open Exam in Workspace
    const examCard = await page.$('div:has-text("Cell Biology Midterm Examination")');
    if (examCard) {
      await examCard.click();
      await page.waitForTimeout(800);
    }

    // Click "Preview" / "Paper Preview & Print"
    const previewBtn = await page.$('button:has-text("Preview"), button:has-text("Paper Preview & Print")');
    if (previewBtn) {
      await previewBtn.click();
      await page.waitForTimeout(600);

      // Verify Direction and Typography
      const dirInfo = await page.evaluate(() => {
        const paperEl = document.querySelector('.bg-white.text-stone-900.border, [dir]');
        return {
          dir: paperEl ? paperEl.getAttribute('dir') || 'ltr' : 'ltr',
          title: document.querySelector('h1, h2, h3')?.textContent || ''
        };
      });
      console.log(`[${vp.name}] Paper preview direction:`, dirInfo);

      // Capture Paper Preview Screenshot
      await page.screenshot({ path: `${ARTIFACT_SCREENSHOT_DIR}/${vp.name}_paper_preview.png`, fullPage: false });

      // Click "Teacher Answer Key" / "Answer Keys"
      const ansKeyBtn = await page.$('button:has-text("Teacher Answer Key"), button:has-text("Answer Keys")');
      if (ansKeyBtn) {
        await ansKeyBtn.click();
        await page.waitForTimeout(500);

        // Verify table scrolling
        const tableCheck = await page.evaluate(() => {
          const tableContainer = document.querySelector('.overflow-x-auto');
          const table = tableContainer ? tableContainer.querySelector('table') : null;
          return {
            hasTable: Boolean(table),
            containerScrollWidth: tableContainer?.scrollWidth,
            containerClientWidth: tableContainer?.clientWidth,
            isTableBounded: tableContainer ? tableContainer.scrollWidth >= tableContainer.clientWidth : false
          };
        });
        console.log(`[${vp.name}] Teacher Answer Key table status:`, tableCheck);

        // Capture Teacher Answer Key Screenshot
        await page.screenshot({ path: `${ARTIFACT_SCREENSHOT_DIR}/${vp.name}_teacher_answer_key.png`, fullPage: false });
      }
    }

    await page.close();
  }

  await browser.close();
  console.log('Preview & RTL verification complete!');
}

verifyPreviewAndRTL().catch(console.error);
