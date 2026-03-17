/**
 * Database Layer — SQLite via better-sqlite3
 *
 * Schema simplificado: só precisa de Conversion ID + Label.
 * Sem OAuth, sem Developer Token, sem Customer ID.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// ── Tipos ────────────────────────────────────────────────

export interface Conversion {
  id: string;
  slug: string;
  name: string;
  conversion_id: string;     // TAG: AW-16738274628 (ou só o número)
  conversion_label: string;  // LABEL: AbCdEfGhIjK
  created_at: string;
}

export interface WebhookLog {
  id: string;
  conversion_id: string;     // FK → conversions.id
  conversion_name: string;
  transaction_id: string;
  status: string;
  value: number;
  currency: string;
  email: string | null;
  phone: string | null;
  hashed_email: string | null;
  hashed_phone: string | null;
  gclid: string | null;
  google_ads_success: boolean | null;
  google_ads_details: string | null;
  ga4_success: boolean | null;
  ga4_details: string | null;
  result: 'success' | 'error' | 'skipped';
  created_at: string;
}

// ── Inicialização ────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 's2s.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversions (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    conversion_id TEXT NOT NULL,
    conversion_label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS webhook_logs (
    id TEXT PRIMARY KEY,
    conversion_id TEXT,
    conversion_name TEXT DEFAULT '',
    transaction_id TEXT DEFAULT '',
    status TEXT DEFAULT '',
    value REAL DEFAULT 0,
    currency TEXT DEFAULT 'BRL',
    email TEXT,
    phone TEXT,
    hashed_email TEXT,
    hashed_phone TEXT,
    gclid TEXT,
    google_ads_success INTEGER,
    google_ads_details TEXT,
    ga4_success INTEGER,
    ga4_details TEXT,
    result TEXT DEFAULT 'skipped',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conversion_id) REFERENCES conversions(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_logs_created ON webhook_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_conversion ON webhook_logs(conversion_id);
  CREATE INDEX IF NOT EXISTS idx_conversions_slug ON conversions(slug);
`);

// ── Conversions CRUD ─────────────────────────────────────

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

export function createConversion(data: {
  name: string;
  conversion_id: string;
  conversion_label: string;
}): Conversion {
  const id = uuidv4();
  let slug = generateSlug(data.name);

  const existing = db.prepare('SELECT id FROM conversions WHERE slug = ?').get(slug);
  if (existing) {
    slug = `${slug}-${id.substring(0, 6)}`;
  }

  const stmt = db.prepare(`
    INSERT INTO conversions (id, slug, name, conversion_id, conversion_label)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, slug, data.name, data.conversion_id, data.conversion_label);

  return getConversionById(id)!;
}

export function getAllConversions(): Conversion[] {
  return db.prepare('SELECT * FROM conversions ORDER BY created_at DESC').all() as Conversion[];
}

export function getConversionById(id: string): Conversion | null {
  return (db.prepare('SELECT * FROM conversions WHERE id = ?').get(id) as Conversion) || null;
}

export function getConversionBySlug(slug: string): Conversion | null {
  return (db.prepare('SELECT * FROM conversions WHERE slug = ?').get(slug) as Conversion) || null;
}

export function deleteConversion(id: string): boolean {
  const result = db.prepare('DELETE FROM conversions WHERE id = ?').run(id);
  return result.changes > 0;
}

// ── Webhook Logs ─────────────────────────────────────────

export function createWebhookLog(data: Omit<WebhookLog, 'id' | 'created_at'>): WebhookLog {
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO webhook_logs (
      id, conversion_id, conversion_name, transaction_id, status, value, currency,
      email, phone, hashed_email, hashed_phone, gclid,
      google_ads_success, google_ads_details, ga4_success, ga4_details, result
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id, data.conversion_id, data.conversion_name, data.transaction_id,
    data.status, data.value, data.currency,
    data.email, data.phone, data.hashed_email, data.hashed_phone, data.gclid,
    data.google_ads_success !== null && data.google_ads_success !== undefined ? (data.google_ads_success ? 1 : 0) : null,
    data.google_ads_details,
    data.ga4_success !== null && data.ga4_success !== undefined ? (data.ga4_success ? 1 : 0) : null,
    data.ga4_details,
    data.result
  );

  return getWebhookLogById(id)!;
}

export function getWebhookLogById(id: string): WebhookLog | null {
  const row = db.prepare('SELECT * FROM webhook_logs WHERE id = ?').get(id) as any;
  return row ? normalizeLog(row) : null;
}

export function getRecentLogs(limit: number = 50): WebhookLog[] {
  const rows = db.prepare('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(normalizeLog);
}

export function getLogStats(): { total: number; success: number; skipped: number; errors: number; revenue: number } {
  const row = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN result = 'skipped' THEN 1 ELSE 0 END) as skipped,
      SUM(CASE WHEN result = 'error' THEN 1 ELSE 0 END) as errors,
      COALESCE(SUM(CASE WHEN result = 'success' THEN value ELSE 0 END), 0) as revenue
    FROM webhook_logs
  `).get() as any;

  return {
    total: row.total || 0,
    success: row.success || 0,
    skipped: row.skipped || 0,
    errors: row.errors || 0,
    revenue: row.revenue || 0,
  };
}

function normalizeLog(row: any): WebhookLog {
  return {
    ...row,
    google_ads_success: row.google_ads_success === 1 ? true : row.google_ads_success === 0 ? false : null,
    ga4_success: row.ga4_success === 1 ? true : row.ga4_success === 0 ? false : null,
  };
}

export default db;
