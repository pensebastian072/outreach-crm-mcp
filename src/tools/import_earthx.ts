import mammoth from 'mammoth';
import { Database } from '../db/database';
import fs from 'fs';
import path from 'path';

interface EarthXData {
  earthx_date_range: string;
  earthx_city: string;
  earthx_venue: string;
  earthx_mission: string;
  earthx_highlights: string[];
  earthx_attendee_types: string[];
  earthx_sponsor_notes: string[];
}

export async function importEarthxContext(db: Database, docxPath: string, isTestMode: boolean = false): Promise<EarthXData> {
  try {
    const buffer = fs.readFileSync(docxPath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    // Extract structured EarthX data
    const data: EarthXData = {
      earthx_date_range: '',
      earthx_city: '',
      earthx_venue: '',
      earthx_mission: '',
      earthx_highlights: [],
      earthx_attendee_types: [],
      earthx_sponsor_notes: []
    };

    // Extract date range (e.g., "April 19–22, 2026")
    const dateMatch = text.match(/April\s+(\d+)–(\d+),\s+(\d{4})/);
    if (dateMatch) {
      data.earthx_date_range = `April ${dateMatch[1]}–${dateMatch[2]}, ${dateMatch[3]}`;
    }

    // Extract city and venue
    const locationMatch = text.match(/(Dallas),\s*(TX);\s*(Hilton Anatole)/);
    if (locationMatch) {
      data.earthx_city = locationMatch[1];
      data.earthx_venue = locationMatch[3];
    }

    // Extract mission
    const missionMatch = text.match(/EarthX is([^.]*)\./);
    if (missionMatch) {
      data.earthx_mission = `EarthX is${missionMatch[1]}.`;
    }

    // Extract highlights (split by semicolons or bullet points)
    const highlightsMatch = text.match(/highlights?:?\s*([^.!?]*[.!?])/i);
    if (highlightsMatch) {
      data.earthx_highlights = highlightsMatch[1]
        .split(/[;•\n]/)
        .map(h => h.trim())
        .filter(h => h.length > 0);
    }

    // Extract attendee types
    const attendeesMatch = text.match(/attendees?:?\s*([^.!?]*[.!?])/i);
    if (attendeesMatch) {
      data.earthx_attendee_types = attendeesMatch[1]
        .split(/[,;]/)
        .map(a => a.trim())
        .filter(a => a.length > 0);
    }

    // Extract sponsor notes
    const sponsorMatch = text.match(/sponsors?:?\s*([^.!?]*[.!?])/i);
    if (sponsorMatch) {
      data.earthx_sponsor_notes = sponsorMatch[1]
        .split(/[;•\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    }

    // Store in database as key/value pairs
    await db.run('DELETE FROM earthx_context'); // Clear existing data

    const entries = Object.entries(data);
    for (const [key, value] of entries) {
      if (Array.isArray(value)) {
        // Store arrays as JSON
        await db.run('INSERT INTO earthx_context (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
      } else {
        await db.run('INSERT INTO earthx_context (key, value) VALUES (?, ?)', [key, value]);
      }
    }

    return data;

  } catch (error) {
    console.error('EarthX DOCX import failed:', error);
    if (!isTestMode) {
      throw new Error('EarthX DOCX import failed and not in test mode - cannot generate emails with mock context');
    }
    // Insert mock data for testing
    const mockData: EarthXData = {
      earthx_date_range: 'April 19–22, 2026',
      earthx_city: 'Dallas',
      earthx_venue: 'Hilton Anatole',
      earthx_mission: 'EarthX focuses on carbon capture, sustainable agriculture, and clean water technologies.',
      earthx_highlights: ['Carbon capture innovations', 'Sustainable agriculture solutions', 'Clean water technologies'],
      earthx_attendee_types: ['CEOs', 'CTOs', 'Sustainability leaders', 'Investors'],
      earthx_sponsor_notes: ['Media partnership', 'Premier networking opportunities']
    };

    await db.run('DELETE FROM earthx_context');
    for (const [key, value] of Object.entries(mockData)) {
      if (Array.isArray(value)) {
        await db.run('INSERT INTO earthx_context (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
      } else {
        await db.run('INSERT INTO earthx_context (key, value) VALUES (?, ?)', [key, value]);
      }
    }

    console.log('Inserted mock EarthX context for testing');
    return mockData;
  }
}