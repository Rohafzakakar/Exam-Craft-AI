import assert from 'node:assert';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log(`\n======================================================`);
  console.log(`  EXAMCRAFT AI: VERIFICATION OF AUTH & DASHBOARD FIXES`);
  console.log(`======================================================\n`);

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Dev server should be healthy');
  console.log('✓ 1. Dev server healthy');

  // 2. Legitimate guest access without token
  const guestRes = await fetch(`${BASE_URL}/api/documents`);
  assert.strictEqual(guestRes.status, 200, 'Guest should get HTTP 200 on /api/documents');
  const guestDocs = await guestRes.json();
  assert(Array.isArray(guestDocs), 'Guest docs must be an array');
  console.log(`✓ 2. Legitimate guest access works (returned ${guestDocs.length} shared document(s))`);

  // 3. Legitimate guest access with guest_ session token
  const guestSessionRes = await fetch(`${BASE_URL}/api/documents`, {
    headers: {
      'Authorization': 'Bearer guest_test_session_12345',
      'X-Guest-Session-Id': 'guest_test_session_12345',
    },
  });
  assert.strictEqual(guestSessionRes.status, 200, 'Guest session bearer should get HTTP 200');
  console.log('✓ 3. Legitimate guest_ token access works');

  // 4. Register a new teacher account
  const teacherEmail = `test_prof_${Date.now()}@academic.edu`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
      full_name: 'Professor Test',
      institution: 'Science Faculty',
    }),
  });
  assert(regRes.status === 200 || regRes.status === 201, `Teacher registration should succeed (got ${regRes.status})`);
  const regData = await regRes.json();
  const validToken = regData.token;
  const teacherId = regData.user.id;
  assert(validToken, 'Teacher token must be returned');
  console.log('✓ 4. Teacher registration succeeded with valid token');

  // 5. Valid teacher token access
  const teacherMeRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${validToken}` },
  });
  assert.strictEqual(teacherMeRes.status, 200, 'Valid teacher token should get HTTP 200');
  const teacherMe = await teacherMeRes.json();
  assert.strictEqual(teacherMe.authenticated, true, 'Teacher should be authenticated');
  assert.strictEqual(teacherMe.user.id, teacherId, 'Teacher ID should match');
  console.log('✓ 5. Valid teacher token authenticated successfully');

  // 6. Invalid teacher Bearer token MUST receive HTTP 401 (not silently downgrade to guest)
  const invalidBearerRes = await fetch(`${BASE_URL}/api/documents`, {
    headers: { 'Authorization': 'Bearer totally_invalid_gibberish_token_value' },
  });
  assert.strictEqual(
    invalidBearerRes.status,
    401,
    `Invalid Bearer token MUST receive HTTP 401, got ${invalidBearerRes.status}`
  );
  const invalidBody = await invalidBearerRes.json();
  assert(invalidBody.detail, '401 response should provide error detail');
  console.log(`✓ 6. Invalid Bearer token rejected with HTTP 401: "${invalidBody.detail}"`);

  // 7. Malformed signature on teacher token MUST receive HTTP 401
  const [payloadPart] = validToken.split('.');
  const forgedToken = `${payloadPart}.tampered_signature_bytes_12345`;
  const forgedRes = await fetch(`${BASE_URL}/api/documents`, {
    headers: { 'Authorization': `Bearer ${forgedToken}` },
  });
  assert.strictEqual(
    forgedRes.status,
    401,
    `Forged/tampered signature MUST receive HTTP 401, got ${forgedRes.status}`
  );
  console.log('✓ 7. Tampered signature rejected with HTTP 401');

  // 8. Stale token_version (e.g. after logout / password change / token bump)
  // Let's call /api/auth/logout with the valid token to bump token_version in SQLite
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${validToken}` },
  });
  assert.strictEqual(logoutRes.status, 200, 'Logout should succeed');
  console.log('✓ 8. Teacher logged out (token_version bumped in SQLite)');

  // Now, the previous validToken is STALE because token_version has been bumped
  const staleRes = await fetch(`${BASE_URL}/api/documents`, {
    headers: { 'Authorization': `Bearer ${validToken}` },
  });
  assert.strictEqual(
    staleRes.status,
    401,
    `Stale token with older token_version MUST receive HTTP 401 (not guest downgrade), got ${staleRes.status}`
  );
  const staleBody = await staleRes.json();
  assert(staleBody.detail, 'Stale token 401 response must have detail');
  console.log(`✓ 9. Stale token_version rejected with HTTP 401: "${staleBody.detail}"`);

  // 10. Re-login generates fresh valid token with updated token_version
  const reLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: teacherEmail,
      password: 'SecurePassword123!',
    }),
  });
  assert.strictEqual(reLoginRes.status, 200, 'Re-login should return HTTP 200');
  const reLoginData = await reLoginRes.json();
  const freshToken = reLoginData.token;
  assert(freshToken && freshToken !== validToken, 'Fresh token must be generated');

  const freshRes = await fetch(`${BASE_URL}/api/documents`, {
    headers: { 'Authorization': `Bearer ${freshToken}` },
  });
  assert.strictEqual(freshRes.status, 200, 'Fresh token should return HTTP 200');
  console.log('✓ 10. Fresh token after re-login works with HTTP 200');

  // 11. Verify TeacherDashboard.tsx structural constraints
  const fs = await import('node:fs');
  const dashboardCode = fs.readFileSync('src/components/TeacherDashboard.tsx', 'utf8');

  // Verify useCallback is used for fetchData
  assert(
    dashboardCode.includes('useCallback('),
    'TeacherDashboard must use useCallback for fetchData'
  );
  // Verify dependency on currentUser?.id
  assert(
    dashboardCode.includes('[currentUser?.id]'),
    'fetchData must depend on [currentUser?.id]'
  );
  // Verify useEffect depends on fetchData
  assert(
    dashboardCode.includes('[fetchData]'),
    'useEffect must depend on [fetchData]'
  );
  // Verify fallback to getSavedUser()
  assert(
    dashboardCode.includes('currentUser || getSavedUser()'),
    'fetchData must fallback to getSavedUser() to prevent race conditions'
  );
  // Verify removeEventListener cleanup in useEffect
  assert(
    dashboardCode.includes("removeEventListener('examcraft_auth_changed'"),
    'useEffect must properly clean up event listeners to avoid duplicates'
  );
  console.log('✓ 11. TeacherDashboard.tsx structural checks passed:');
  console.log('    - useCallback with [currentUser?.id]');
  console.log('    - useEffect with [fetchData]');
  console.log('    - getSavedUser() hydration fallback');
  console.log('    - Event listener cleanup on dependency update');

  console.log(`\n======================================================`);
  console.log(`  ALL AUTH & DASHBOARD VERIFICATION CHECKS PASSED!`);
  console.log(`======================================================\n`);
}

run().catch((err) => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
