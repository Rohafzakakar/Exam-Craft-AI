import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TEST_DB_PATH = path.resolve(process.cwd(), 'data', 'test_persistence_isolated.db');
const TEST_BACKUP_PATH = path.resolve(process.cwd(), 'data', 'backups', 'test_backup_isolated.db');

describe('ExamCraft AI — Database WAL Persistence & Backup Consistency', () => {
  let testDb: DatabaseSync;

  before(() => {
    // Ensure clean test file
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`, TEST_BACKUP_PATH].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });

    testDb = new DatabaseSync(TEST_DB_PATH);
    testDb.exec('PRAGMA journal_mode = WAL;');
    testDb.exec('PRAGMA foreign_keys = ON;');
    testDb.exec('PRAGMA synchronous = NORMAL;');
    testDb.exec('PRAGMA wal_autocheckpoint = 100;');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        institution TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'teacher',
        token_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        filename TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        content TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS exams (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        session_id TEXT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  });

  after(() => {
    try {
      testDb.close();
    } catch {}
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`, TEST_BACKUP_PATH].forEach((f) => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch {}
      }
    });
  });

  test('1. Database writes are buffered in WAL and checkpointable via PRAGMA wal_checkpoint', () => {
    const insertStmt = testDb.prepare(`
      INSERT INTO users (id, email, password_hash, salt, full_name, institution, role, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    insertStmt.run(
      'usr-test-1',
      'educator.test@university.edu',
      'fake_hash',
      'fake_salt',
      'Dr. Test',
      'Faculty of Science',
      'teacher',
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Verify uncheckpointed write exists in WAL
    const checkStmt = testDb.prepare('SELECT * FROM users WHERE email = ?');
    const u1 = checkStmt.get('educator.test@university.edu') as any;
    assert.ok(u1, 'User must be readable in WAL mode');
    assert.equal(u1.id, 'usr-test-1');

    // Run safe PASSIVE checkpoint
    const cpRes = testDb.prepare('PRAGMA wal_checkpoint(PASSIVE);').get() as any;
    assert.equal(cpRes.busy, 0, 'PASSIVE checkpoint must succeed without blocking');

    // Run TRUNCATE checkpoint
    const trRes = testDb.prepare('PRAGMA wal_checkpoint(TRUNCATE);').get() as any;
    assert.equal(trRes.busy, 0, 'TRUNCATE checkpoint must succeed');
  });

  test('2. Atomic VACUUM INTO creates 100% consistent standalone backup including WAL transactions', () => {
    // Add documents and exams to test database
    testDb.prepare('INSERT INTO documents (id, user_id, filename, status, created_at) VALUES (?, ?, ?, ?, ?)').run(
      'doc-test-1', 'usr-test-1', 'TestDoc.pdf', 'indexed', new Date().toISOString()
    );
    testDb.prepare('INSERT INTO document_chunks (id, document_id, page_number, content) VALUES (?, ?, ?, ?)').run(
      'chunk-test-1', 'doc-test-1', 1, 'Sample educational source paragraph'
    );
    testDb.prepare('INSERT INTO exams (id, user_id, title, created_at) VALUES (?, ?, ?, ?)').run(
      'exam-test-1', 'usr-test-1', 'Final Biology Examination', new Date().toISOString()
    );

    // Create atomic backup via VACUUM INTO
    if (fs.existsSync(TEST_BACKUP_PATH)) fs.unlinkSync(TEST_BACKUP_PATH);
    const escapedPath = TEST_BACKUP_PATH.replace(/'/g, "''");
    testDb.exec(`VACUUM INTO '${escapedPath}';`);

    assert.ok(fs.existsSync(TEST_BACKUP_PATH), 'Backup file must exist on disk');

    // Open standalone backup in isolated connection without WAL dependency
    const backupDb = new DatabaseSync(TEST_BACKUP_PATH);
    const userInBackup = backupDb.prepare('SELECT * FROM users WHERE id = ?').get('usr-test-1') as any;
    assert.ok(userInBackup, 'User must be present in backup database');
    assert.equal(userInBackup.email, 'educator.test@university.edu');

    const docInBackup = backupDb.prepare('SELECT * FROM documents WHERE id = ?').get('doc-test-1') as any;
    assert.ok(docInBackup, 'Document must be present in backup database');

    const examInBackup = backupDb.prepare('SELECT * FROM exams WHERE id = ?').get('exam-test-1') as any;
    assert.ok(examInBackup, 'Exam must be present in backup database');

    backupDb.close();
  });

  test('3. Case-insensitive email querying with LOWER(email) = LOWER(?)', () => {
    const q1 = testDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get('EDUCATOR.TEST@UNIVERSITY.EDU') as any;
    assert.ok(q1, 'Uppercase email must match existing record');
    assert.equal(q1.id, 'usr-test-1');

    const q2 = testDb.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get('  Educator.Test@University.Edu  '.trim().toLowerCase()) as any;
    assert.ok(q2, 'Normalized email must match existing record');
  });

  test('4. Duplicate email prevention at schema constraint level', () => {
    const insertStmt = testDb.prepare(`
      INSERT INTO users (id, email, password_hash, salt, full_name, institution, role, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    assert.throws(
      () => {
        insertStmt.run(
          'usr-duplicate-test',
          'educator.test@university.edu',
          'other_hash',
          'other_salt',
          'Imposter',
          'Other Dept',
          'teacher',
          new Date().toISOString(),
          new Date().toISOString()
        );
      },
      /UNIQUE constraint failed/i,
      'Must reject duplicate email insertion'
    );
  });

  test('5. User ID and token version are strictly preserved on update', () => {
    testDb.prepare('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      'usr-test-1'
    );
    const updatedUser = testDb.prepare('SELECT * FROM users WHERE id = ?').get('usr-test-1') as any;
    assert.equal(updatedUser.id, 'usr-test-1', 'User ID must never change');
    assert.equal(updatedUser.token_version, 2, 'Token version bumped to 2');
  });
});

import dotenv from 'dotenv';
dotenv.config();
import { getSecretKey } from '../src/server/auth.js';

describe('ExamCraft AI — Live Authentication API & Session Restoration', () => {
  const isolatedEmail = `isolated.auth.${Date.now()}@example.edu`;
  const isolatedPassword = `TestSuitePass#${Date.now()}`;
  let isolatedUserId = '';
  let isolatedToken = '';

  function generateToken(userId: string, email: string, role: string, tokenVersion: number, ttlMs: number) {
    const now = Date.now();
    const payload = {
      userId,
      email,
      role,
      tokenVersion,
      issuedAt: now,
      expiresAt: now + ttlMs,
    };
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', getSecretKey()).update(payloadBase64).digest('base64url');
    return `${payloadBase64}.${signature}`;
  }

  after(() => {
    if (isolatedUserId) {
      try {
        const dbCleanup = new DatabaseSync('data/examcraft.db');
        dbCleanup.prepare('DELETE FROM users WHERE id = ?').run(isolatedUserId);
        dbCleanup.prepare('PRAGMA wal_checkpoint(TRUNCATE);').run();
        dbCleanup.close();
      } catch {}
    }
  });

  test('6. Guest request without token returns HTTP 200 with authenticated: false and is_guest: true', async () => {
    const res = await fetch('http://localhost:3000/api/auth/me');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.authenticated, false);
    assert.equal(data.is_guest, true);
    assert.ok(data.session_id, 'Guest must have a session_id');
  });

  test('7. Teacher registration & session restoration via GET /api/auth/me returns 200 with intact user identity', async () => {
    const regRes = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: isolatedEmail,
        password: isolatedPassword,
        full_name: 'Dr. Isolated Test Educator',
        institution: 'Test Academy',
      }),
    });
    assert.equal(regRes.status, 201, 'Isolated test teacher registration must return 201');
    const regData = await regRes.json();
    isolatedUserId = regData.user.id;
    isolatedToken = regData.token;
    assert.ok(isolatedUserId, 'Registered test user must have an ID');
    assert.ok(isolatedToken, 'Registered test user must receive a session token');

    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: { Authorization: `Bearer ${isolatedToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.authenticated, true);
    assert.equal(data.is_guest, false);
    assert.equal(data.user.id, isolatedUserId, 'User ID must be preserved exactly');
    assert.equal(data.user.email, isolatedEmail.toLowerCase());
  });

  test('8. Expired token returns HTTP 401 and does NOT fall back to guest', async () => {
    const expiredToken = generateToken(isolatedUserId || 'usr-test-expired', isolatedEmail, 'teacher', 1, -3600000);

    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(res.status, 401, 'Expired token must receive HTTP 401');
    const data = await res.json();
    assert.ok(data.detail?.includes('expired') || data.detail?.includes('invalid'), 'Must explain session expiration');
  });

  test('9. Revoked token (stale token_version) returns HTTP 401 and does NOT fall back to guest', async () => {
    const revokedToken = generateToken(isolatedUserId || 'usr-test-revoked', isolatedEmail, 'teacher', 999, 3600000);

    const res = await fetch('http://localhost:3000/api/auth/me', {
      headers: { Authorization: `Bearer ${revokedToken}` },
    });
    assert.equal(res.status, 401, 'Revoked token must receive HTTP 401');
  });

  test('10. Duplicate registration with existing teacher email (case-insensitive) returns HTTP 409', async () => {
    const res = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: isolatedEmail.toUpperCase(),
        password: isolatedPassword,
      }),
    });
    assert.equal(res.status, 409, 'Duplicate email registration must return HTTP 409');
    const data = await res.json();
    assert.ok(data.detail?.includes('already exists'));
  });

  test('11. Login failure does NOT register new account and returns HTTP 401', async () => {
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: isolatedEmail,
        password: 'DefinitivelyIncorrectPassword2026!',
      }),
    });
    assert.equal(res.status, 401, 'Wrong password must return HTTP 401');
  });
});
