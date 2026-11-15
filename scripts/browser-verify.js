import pkg from '/usr/local/share/bun-global/node_modules/playwright-core/index.js';
const { chromium } = pkg;
import fs from 'node:fs';

const SCREENSHOT_DIR = '/app/applet/tests/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const ARTIFACT_SCREENSHOT_DIR = '/.aistudio/artifacts/brain/794b0660-b814-4638-b039-735bf3619fb0/screenshots';
fs.mkdirSync(ARTIFACT_SCREENSHOT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile_375x812', width: 375, height: 812, type: 'mobile' },
  { name: 'mobile_390x844', width: 390, height: 844, type: 'mobile' },
  { name: 'tablet_portrait_768x1024', width: 768, height: 1024, type: 'tablet_p' },
  { name: 'tablet_landscape_1024x768', width: 1024, height: 768, type: 'tablet_l' },
  { name: 'desktop_1440x900', width: 1440, height: 900, type: 'desktop' }
];

async function checkHorizontalOverflow(page, viewName) {
  return await page.evaluate((viewName) => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const bodyWidth = document.body.scrollWidth;

    const overflowingElements = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      // An element overflows the page if its right edge exceeds the window width and it's not inside a scroll container
      if (rect.right > winWidth + 1 && el.offsetParent !== null && !el.closest('.overflow-x-auto')) {
        overflowingElements.push({
          tag: el.tagName.toLowerCase(),
          className: (el.className || '').toString().slice(0, 60),
          right: Math.round(rect.right),
          windowWidth: winWidth
        });
      }
    });

    const hasOverflow = docWidth > winWidth + 1 || bodyWidth > winWidth + 1;

    return {
      viewName,
      hasOverflow,
      docWidth,
      winWidth,
      bodyWidth,
      overflowingElements: overflowingElements.slice(0, 3)
    };
  }, viewName);
}

async function saveScreenshot(page, filename) {
  const localPath = `${SCREENSHOT_DIR}/${filename}`;
  const artifactPath = `${ARTIFACT_SCREENSHOT_DIR}/${filename}`;
  await page.screenshot({ path: localPath, fullPage: false });
  fs.copyFileSync(localPath, artifactPath);
}

async function runFullVerification() {
  console.log('=== ExamCraft AI — Comprehensive Browser Verification ===\n');

  const browser = await chromium.launch({
    executablePath: '/ms-playwright/chromium-1254/chrome-linux64/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const report = {
    timestamp: new Date().toISOString(),
    viewportsTested: [],
    overflowAudits: [],
    authModalAudits: [],
    dashboardAudits: [],
    paperPreviewAudits: [],
    tableAudits: [],
    modalAudits: [],
    screenshotsCaptured: []
  };

  for (const vp of VIEWPORTS) {
    console.log(`\n=========================================================`);
    console.log(`TESTING VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`=========================================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: vp.type === 'mobile' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' : undefined
    });

    const page = await context.newPage();

    // ----------------------------------------------------
    // Phase 1: Guest Mode & Workspace Step 1
    // ----------------------------------------------------
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const wsOverflow = await checkHorizontalOverflow(page, 'Guest Workspace');
    console.log(`[1. Workspace Overflow] width=${wsOverflow.docWidth}/${wsOverflow.winWidth}, hasOverflow=${wsOverflow.hasOverflow}`);
    report.overflowAudits.push({ viewport: vp.name, ...wsOverflow });

    const wsScreenshot = `${vp.name}_01_workspace.png`;
    await saveScreenshot(page, wsScreenshot);
    report.screenshotsCaptured.push(wsScreenshot);

    // ----------------------------------------------------
    // Phase 2: Auth Modal (Open, check responsive layout, Close)
    // ----------------------------------------------------
    const signInBtn = await page.$('header button:has-text("Sign In"), header button:has-text("Teacher Login")');
    if (signInBtn) {
      await signInBtn.click();
      await page.waitForTimeout(400);

      const authOverflow = await checkHorizontalOverflow(page, 'Auth Modal');
      console.log(`[2. Auth Modal Overflow] width=${authOverflow.docWidth}/${authOverflow.winWidth}, hasOverflow=${authOverflow.hasOverflow}`);
      report.overflowAudits.push({ viewport: vp.name, ...authOverflow });

      const promoColHidden = await page.evaluate(() => {
        const promo = document.querySelector('.hidden.md\\:flex');
        if (!promo) return true;
        return window.getComputedStyle(promo).display === 'none';
      });

      console.log(`[2. Auth Modal] Promo col hidden on mobile: ${promoColHidden} (Expected on <768px: ${vp.width < 768})`);
      report.authModalAudits.push({
        viewport: vp.name,
        promoColHidden,
        hasOverflow: authOverflow.hasOverflow
      });

      const authScreenshot = `${vp.name}_02_auth_modal.png`;
      await saveScreenshot(page, authScreenshot);
      report.screenshotsCaptured.push(authScreenshot);

      // Close Auth Modal cleanly via button[aria-label="Close"]
      const closeAuth = await page.$('button[aria-label="Close"]');
      if (closeAuth) {
        await closeAuth.click();
        await page.waitForTimeout(300);
      }
    }

    // ----------------------------------------------------
    // Phase 3: Teacher Authentication & Dashboard
    // ----------------------------------------------------
    console.log(`[3. Authentication] Injecting authenticated teacher credentials...`);
    await page.evaluate(async () => {
      const testEmail = 'test.educator.verify@example.edu';
      const testPass = 'TestVerifyPass#2026';
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPass, full_name: 'Dr. Verify', institution: 'Test University' })
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

    // Reload page to initialize educator session cleanly
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // Should now be on Teacher Dashboard
    const dashOverflow = await checkHorizontalOverflow(page, 'Teacher Dashboard');
    console.log(`[3. Dashboard Overflow] width=${dashOverflow.docWidth}/${dashOverflow.winWidth}, hasOverflow=${dashOverflow.hasOverflow}`);
    report.overflowAudits.push({ viewport: vp.name, ...dashOverflow });

    // Verify stats cards columns
    const statsCols = await page.evaluate(() => {
      const el = document.querySelector('.grid.grid-cols-2');
      if (!el) return 0;
      return window.getComputedStyle(el).gridTemplateColumns.split(' ').length;
    });
    console.log(`[3. Dashboard] Stats cards columns: ${statsCols} (Mobile: 2, Desktop: 4)`);

    // Verify filter pills on mobile
    const langPills = await page.$$('button:has-text("All"), button:has-text("English"), button:has-text("Dari / Persian"), button:has-text("Pashto")');
    console.log(`[3. Dashboard] Language filter pills rendered: ${langPills.length}`);

    const dashScreenshot = `${vp.name}_03_dashboard.png`;
    await saveScreenshot(page, dashScreenshot);
    report.screenshotsCaptured.push(dashScreenshot);

    report.dashboardAudits.push({
      viewport: vp.name,
      statsCols,
      hasOverflow: dashOverflow.hasOverflow
    });

    // ----------------------------------------------------
    // Phase 4: Exam Workspace Step 3 (Open active exam)
    // ----------------------------------------------------
    console.log(`[4. Workspace Step 3] Opening exam-cell-bio-midterm...`);
    const examCard = await page.$('div:has-text("Cell Biology Midterm Examination")');
    if (examCard) {
      await examCard.click();
      await page.waitForTimeout(700);
    } else {
      // Direct navigate via Workspace button
      const wsBtn = await page.$('header button:has-text("Workspace"), header button:has-text("Exam Workspace")');
      if (wsBtn) {
        await wsBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // Verify Step 3 action buttons wrap nicely
    const step3Overflow = await checkHorizontalOverflow(page, 'Workspace Step 3');
    console.log(`[4. Workspace Step 3 Overflow] width=${step3Overflow.docWidth}/${step3Overflow.winWidth}, hasOverflow=${step3Overflow.hasOverflow}`);
    report.overflowAudits.push({ viewport: vp.name, ...step3Overflow });

    // ----------------------------------------------------
    // Phase 5: Academic Paper Preview
    // ----------------------------------------------------
    console.log(`[5. Paper Preview] Testing preview on ${vp.name}...`);
    const previewBtn = await page.$('button:has-text("Preview"), button:has-text("Paper Preview & Print")');
    if (previewBtn) {
      await previewBtn.click();
      await page.waitForTimeout(600);

      const paperOverflow = await checkHorizontalOverflow(page, 'Paper Preview');
      console.log(`[5. Paper Preview Overflow] width=${paperOverflow.docWidth}/${paperOverflow.winWidth}, hasOverflow=${paperOverflow.hasOverflow}`);
      report.overflowAudits.push({ viewport: vp.name, ...paperOverflow });

      const previewScreenshot = `${vp.name}_04_paper_preview.png`;
      await saveScreenshot(page, previewScreenshot);
      report.screenshotsCaptured.push(previewScreenshot);

      report.paperPreviewAudits.push({
        viewport: vp.name,
        hasOverflow: paperOverflow.hasOverflow
      });

      // ----------------------------------------------------
      // Phase 6: Teacher Answer Key Table
      // ----------------------------------------------------
      console.log(`[6. Answer Key] Testing Teacher Answer Key on ${vp.name}...`);
      const ansKeyBtn = await page.$('button:has-text("Answer Keys"), button:has-text("Teacher Answer Key")');
      if (ansKeyBtn) {
        await ansKeyBtn.click();
        await page.waitForTimeout(500);

        const tableOverflow = await checkHorizontalOverflow(page, 'Teacher Answer Key');
        console.log(`[6. Answer Key Overflow] width=${tableOverflow.docWidth}/${tableOverflow.winWidth}, hasOverflow=${tableOverflow.hasOverflow}`);
        report.overflowAudits.push({ viewport: vp.name, ...tableOverflow });

        // Verify table scroll container
        const tableScrollMetrics = await page.evaluate(() => {
          const container = document.querySelector('.overflow-x-auto');
          if (!container) return null;
          return {
            scrollWidth: container.scrollWidth,
            clientWidth: container.clientWidth,
            isHorizontallyScrollable: container.scrollWidth > container.clientWidth
          };
        });
        console.log(`[6. Answer Key Table Metrics]`, tableScrollMetrics);

        const ansKeyScreenshot = `${vp.name}_05_answer_key.png`;
        await saveScreenshot(page, ansKeyScreenshot);
        report.screenshotsCaptured.push(ansKeyScreenshot);

        report.tableAudits.push({
          viewport: vp.name,
          tableScrollMetrics,
          hasOverflow: tableOverflow.hasOverflow
        });
      }

      // Return to Questions View
      const qViewBtn = await page.$('button:has-text("Questions"), button:has-text("Questions View")');
      if (qViewBtn) {
        await qViewBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // ----------------------------------------------------
    // Phase 7: Export Modal
    // ----------------------------------------------------
    console.log(`[7. Export Modal] Testing Export Modal on ${vp.name}...`);
    const exportBtn = await page.$('button:has-text("Export"), button:has-text("Export Options")');
    if (exportBtn) {
      await exportBtn.click();
      await page.waitForTimeout(400);

      const exportOverflow = await checkHorizontalOverflow(page, 'Export Modal');
      console.log(`[7. Export Modal Overflow] width=${exportOverflow.docWidth}/${exportOverflow.winWidth}, hasOverflow=${exportOverflow.hasOverflow}`);
      report.overflowAudits.push({ viewport: vp.name, ...exportOverflow });

      const exportScreenshot = `${vp.name}_06_export_modal.png`;
      await saveScreenshot(page, exportScreenshot);
      report.screenshotsCaptured.push(exportScreenshot);

      report.modalAudits.push({
        viewport: vp.name,
        modal: 'export',
        hasOverflow: exportOverflow.hasOverflow
      });

      // Close Export Modal
      const closeExport = await page.$('button:has-text("Cancel")');
      if (closeExport) {
        await closeExport.click();
        await page.waitForTimeout(300);
      }
    }

    // ----------------------------------------------------
    // Phase 8: AI-Resistant Review Modal
    // ----------------------------------------------------
    console.log(`[8. AI-Resistant Modal] Testing AI-Resistant Review Modal on ${vp.name}...`);
    const aiBtn = await page.$('button:has-text("AI-Resistant Qs"), button:has-text("Generate AI-Resistant Questions")');
    if (aiBtn) {
      await aiBtn.click();
      await page.waitForTimeout(400);

      const aiOverflow = await checkHorizontalOverflow(page, 'AI-Resistant Modal');
      console.log(`[8. AI-Resistant Modal Overflow] width=${aiOverflow.docWidth}/${aiOverflow.winWidth}, hasOverflow=${aiOverflow.hasOverflow}`);
      report.overflowAudits.push({ viewport: vp.name, ...aiOverflow });

      const aiScreenshot = `${vp.name}_07_ai_resistant_modal.png`;
      await saveScreenshot(page, aiScreenshot);
      report.screenshotsCaptured.push(aiScreenshot);

      report.modalAudits.push({
        viewport: vp.name,
        modal: 'ai_resistant',
        hasOverflow: aiOverflow.hasOverflow
      });

      // Close modal
      const closeAi = await page.$('button:has-text("Cancel")');
      if (closeAi) {
        await closeAi.click();
        await page.waitForTimeout(300);
      }
    }

    report.viewportsTested.push(vp.name);
    await context.close();
  }

  await browser.close();

  const reportFile = '/app/applet/tests/final_browser_verification_report.json';
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n=========================================================`);
  console.log(`VERIFICATION COMPLETE! Report saved to: ${reportFile}`);
  console.log(`Total Screenshots Captured: ${report.screenshotsCaptured.length}`);
  console.log(`=========================================================`);
}

runFullVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
