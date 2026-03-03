import Database from 'better-sqlite3';
import { getDatabase } from '../../src/db/schema.js';
import path from 'path';
import fs from 'fs';

const TEST_DB_DIR = path.join(process.cwd(), 'test', 'data');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-memory.db');

export function setupTestDB(): Database.Database {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  return getDatabase(TEST_DB_PATH);
}

export function cleanupTestDB(): void {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
}
