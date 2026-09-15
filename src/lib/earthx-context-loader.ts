import * as fs from 'fs';
import { Database } from '../db/database';
import { EarthXData } from './email-utils';
import { parseEarthXContextDoc, toEarthXData } from './earthx-context-parser-v2';

let mammoth: any = null;
try {
  mammoth = require('mammoth');
} catch {
  mammoth = null;
}

const DOCX_PATHS = [
  './data/Earth X context.docx',
  './data/Earth X context.doc'
];
const TEXT_PATHS = [
  './data/Earth X context.txt'
];

function normalizeContextText(text: string): string {
  return (text || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readContextText(): Promise<string> {
  let txtCandidate = '';
  for (const path of TEXT_PATHS) {
    if (fs.existsSync(path)) {
      const raw = fs.readFileSync(path, 'utf-8');
      txtCandidate = normalizeContextText(raw);
      if (txtCandidate.length > 0) return txtCandidate;
    }
  }
  for (const path of DOCX_PATHS) {
    if (fs.existsSync(path)) {
      if (!mammoth) {
        throw new Error('mammoth package not installed. Install it to parse DOCX.');
      }
      const result = await mammoth.extractRawText({ path });
      const docxText = normalizeContextText(result.value || '');
      if (docxText.length > 0) return docxText;
    }
  }
  if (txtCandidate.length > 0) return txtCandidate;
  throw new Error('EarthX context file not found in data folder.');
}

export async function loadEarthXDataFromFile(): Promise<EarthXData> {
  const text = await readContextText();
  const context = parseEarthXContextDoc(text);
  return toEarthXData(context);
}

export async function saveEarthXDataToDb(db: Database, earthx: EarthXData) {
  await db.run('DELETE FROM earthx_context');
  for (const [key, value] of Object.entries(earthx)) {
    await db.run('INSERT INTO earthx_context (key, value) VALUES (?, ?)', [key, typeof value === 'string' ? value : JSON.stringify(value)]);
  }
}

export async function loadEarthXDataFromDb(db: Database): Promise<EarthXData | null> {
  const rows = await db.all<{key: string; value: string}>('SELECT key, value FROM earthx_context');
  if (!rows || rows.length === 0) return null;
  const earthx: any = {};
  for (const row of rows) {
    try {
      earthx[row.key] = JSON.parse(row.value);
    } catch {
      earthx[row.key] = row.value;
    }
  }
  return earthx as EarthXData;
}