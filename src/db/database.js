// Node 22+ 내장 sqlite 모듈 사용 (node:sqlite)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { DB_PATH } from '../config.js';

let _db = null;

function db() {
  if (!_db) {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
  }
  return _db;
}

export function initDb() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT NOT NULL,
      case_number      TEXT UNIQUE,
      application_date TEXT,
      court            TEXT,
      industry         TEXT,
      source_url       TEXT,
      collected_at     TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id   INTEGER NOT NULL,
      title        TEXT,
      description  TEXT,
      url          TEXT UNIQUE,
      published_at TEXT,
      collected_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
  `);
}

export function upsertCompany(data) {
  const now = new Date().toISOString();
  const existing = db()
    .prepare('SELECT id FROM companies WHERE case_number = ?')
    .get(data.case_number);
  if (existing) return { id: existing.id, isNew: false };

  const { lastInsertRowid } = db()
    .prepare(`
      INSERT INTO companies (name, case_number, application_date, court, industry, source_url, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      data.name,
      data.case_number ?? null,
      data.application_date ?? null,
      data.court ?? null,
      data.industry ?? null,
      data.source_url ?? null,
      now,
    );
  return { id: Number(lastInsertRowid), isNew: true };
}

export function updateIndustry(id, industry) {
  db().prepare('UPDATE companies SET industry = ? WHERE id = ?').run(industry, id);
}

export function insertNews(companyId, article) {
  const now = new Date().toISOString();
  db()
    .prepare(`
      INSERT OR IGNORE INTO news (company_id, title, description, url, published_at, collected_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      companyId,
      article.title   ?? null,
      article.description ?? null,
      article.link    ?? null,
      article.pubDate ?? null,
      now,
    );
}

export function getAllCompanies() {
  return db().prepare('SELECT * FROM companies ORDER BY collected_at DESC').all();
}

export function getCompaniesWithoutNews() {
  return db().prepare(`
    SELECT c.* FROM companies c
    LEFT JOIN news n ON n.company_id = c.id
    WHERE n.id IS NULL
  `).all();
}

export function getCompaniesWithoutIndustry() {
  return db().prepare(
    "SELECT id, name FROM companies WHERE industry IS NULL OR industry = ''"
  ).all();
}
