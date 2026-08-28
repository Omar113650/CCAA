import * as xlsx from 'xlsx';
import fs from 'fs';
import prisma from '../utils/prisma.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedPresets() {
  try {
    // Navigate up from src/scripts to backend/
    const dbPath = path.resolve(__dirname, '../../final data base.xlsx');
    console.log(`Reading database from: ${dbPath}`);

    const fileBuffer = fs.readFileSync(dbPath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert sheet to JSON array
    const data = xlsx.utils.sheet_to_json(sheet);
    
    console.log(`Found ${data.length} rows in the database.`);

    // Clear existing presets
    await prisma.preset.deleteMany({});
    console.log('Cleared existing presets.');

    let count = 0;
    for (const row of data) {
      // Try to extract key fields based on expected Arabic/English names
      const nameAr = row['وصف العنصر'] || row['العنصر'] || row['Element'] || row['Name'] || row['Item'] || `عنصر ${count + 1}`;
      const category = row['الفئة'] || row['Category'] || 'عام';
      
      // Store all raw columns into defaultValues
      const defaultValues = { ...row };
      
      await prisma.preset.create({
        data: {
          nameAr: String(nameAr),
          category: String(category),
          defaultValues: defaultValues
        }
      });
      count++;
    }

    console.log(`Successfully seeded ${count} presets!`);
  } catch (error) {
    console.error('Error seeding presets:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedPresets();
