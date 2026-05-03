import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const IS_READONLY = !!process.env.VERCEL || process.env.READONLY_DB === "1";

const DATA_DIR = path.join(process.cwd(), "data");
const SOURCE_DB = path.join(DATA_DIR, "species.db");
// Vercel 은 /tmp 만 쓰기 가능. /tmp 로 복사해서 쓰면 캐시 등 일부 write 가능.
const RUNTIME_DB =
  process.env.VERCEL && fs.existsSync(SOURCE_DB)
    ? "/tmp/species.db"
    : SOURCE_DB;

if (!IS_READONLY && !fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let _db: Database.Database | null = null;

function ensureRuntimeDb() {
  // Vercel 환경에서 cold start 시 species.db 를 /tmp 로 복사 (한 번만)
  if (process.env.VERCEL && !fs.existsSync(RUNTIME_DB) && fs.existsSync(SOURCE_DB)) {
    fs.copyFileSync(SOURCE_DB, RUNTIME_DB);
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;
  ensureRuntimeDb();
  _db = new Database(RUNTIME_DB);
  // /tmp 는 휘발성이라 WAL 보다 그냥 default 가 안전
  if (!process.env.VERCEL) _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS species (
      id TEXT PRIMARY KEY,
      scientific_name TEXT NOT NULL,
      common_name_en TEXT,
      common_name_ko TEXT,
      category TEXT NOT NULL CHECK (category IN ('CR','EN','VU','NT','LC','EX','EW','DD','NE')),
      class_name TEXT,
      family TEXT,
      region TEXT,
      population_trend TEXT,
      mature_individuals INTEGER,
      summary_ko TEXT,
      photo_url TEXT,
      wikipedia_title TEXT,
      extinction_year INTEGER,
      extinction_cause TEXT,
      year_published INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_species_category ON species(category);
    CREATE INDEX IF NOT EXISTS idx_species_class ON species(class_name);
    CREATE INDEX IF NOT EXISTS idx_species_region ON species(region);

    CREATE TABLE IF NOT EXISTS threats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      species_id TEXT NOT NULL,
      threat_code TEXT,
      threat_name TEXT NOT NULL,
      severity TEXT,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_threats_species ON threats(species_id);

    CREATE TABLE IF NOT EXISTS conservation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      species_id TEXT NOT NULL,
      action_code TEXT,
      action_name TEXT NOT NULL,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_actions_species ON conservation_actions(species_id);

    CREATE TABLE IF NOT EXISTS habitats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      species_id TEXT NOT NULL,
      habitat_name TEXT NOT NULL,
      suitability TEXT,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_habitats_species ON habitats(species_id);

    CREATE TABLE IF NOT EXISTS ai_recommendations (
      species_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_retrospectives (
      species_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wikipedia_cache (
      title TEXT PRIMARY KEY,
      summary TEXT,
      thumbnail_url TEXT,
      fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- 임계점 엔진 결과 캐시 (lib/tipping-point.ts)
    CREATE TABLE IF NOT EXISTS tipping_points (
      species_id TEXT PRIMARY KEY,
      consensus_score REAL NOT NULL,
      intervention_tier TEXT NOT NULL,
      deadline_days INTEGER NOT NULL,         -- 개입 마감까지 남은 일수 (정렬 키)
      extinction_days INTEGER,                -- 무대응시 멸종까지 일수 (NULL = 안전)
      payload_json TEXT NOT NULL,             -- 전체 결과 직렬화
      computed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tipping_deadline ON tipping_points(deadline_days);
  `);
}

export interface SpeciesRow {
  id: string;
  scientific_name: string;
  common_name_en: string | null;
  common_name_ko: string | null;
  category: "CR" | "EN" | "VU" | "NT" | "LC" | "EX" | "EW" | "DD" | "NE";
  class_name: string | null;
  family: string | null;
  region: string | null;
  population_trend: string | null;
  mature_individuals: number | null;
  summary_ko: string | null;
  photo_url: string | null;
  wikipedia_title: string | null;
  extinction_year: number | null;
  extinction_cause: string | null;
  year_published: number | null;
}

export interface ThreatRow {
  id: number;
  species_id: string;
  threat_code: string | null;
  threat_name: string;
  severity: string | null;
}

export interface ConservationActionRow {
  id: number;
  species_id: string;
  action_code: string | null;
  action_name: string;
}

export interface HabitatRow {
  id: number;
  species_id: string;
  habitat_name: string;
  suitability: string | null;
}

export const CURRENT_CATEGORIES = ["CR", "EN", "VU"] as const;
export const EXTINCT_CATEGORIES = ["EX", "EW"] as const;
