import * as xlsx from 'xlsx';
import prisma from '../../utils/prisma.js';

/**
 * The Gates Engine
 * Gate 1: Accessibility == Inaccessible && No Hazardous -> Separation after demolition
 * Gate 2: Hazardous == Yes -> Safe disposal
 * Gate 3: Condition == Damaged && No Hazardous -> Recycling
 */
export function applyGates(element, condition, accessibility, isHazardous) {
  let isGated = false;
  let gatingReason = null;
  let recommendedPath = null;

  // Gate 1: Hazardous Check
  if (isHazardous === true || String(isHazardous).trim() === 'نعم') {
    isGated = true;
    gatingReason = 'Hazardous material detected';
    recommendedPath = 'safe_disposal';
  } 
  // Gate 2: Inaccessible
  else if (accessibility === 'يتعذر') {
    isGated = true;
    gatingReason = 'Inaccessible without hazardous materials';
    recommendedPath = 'recycling'; // Adjusted to enum
  } 
  // Gate 3: Damaged
  else if (condition === 'تالفة') {
    isGated = true;
    gatingReason = 'Damaged condition';
    recommendedPath = 'recycling';
  }

  return { isGated, gatingReason, recommendedPath };
}

/**
 * The Decision Engine (Matrix-Based)
 * Evaluates Technical, Economic, and Environmental factors to assign High/Medium/Low.
 * Then maps the combination to a recommended path.
 */
export function runDecisionEngine(element, condition, accessibility) {
  const category = element?.category || 'غير محدد';
  
  // 1. Define Factor Levels (High = 3, Medium = 2, Low = 1, or string based)
  let technical = 'Low';
  let economic = 'Low';
  let environmental = 'Low';

  // --- Technical Factor (العامل الفني) ---
  // Depends heavily on Condition and Accessibility
  if (condition === 'جيدة' && accessibility === 'سهل') {
    technical = 'High';
  } else if ((condition === 'جيدة' && accessibility === 'متوسط') || (condition === 'متوسطة' && accessibility === 'سهل')) {
    technical = 'Medium';
  } else {
    technical = 'Low';
  }

  // --- Economic Factor (العامل الاقتصادي) ---
  // Depends on category value/resale potential
  const highValueCategories = ['أبواب', 'نوافذ', 'إضاءة', 'أجهزة', 'أثاث', 'تكييف', 'صحي'];
  const mediumValueCategories = ['حديد تسليح', 'زجاج', 'خشب', 'ألمنيوم'];
  
  if (highValueCategories.some(c => category.includes(c))) {
    economic = 'High';
  } else if (mediumValueCategories.some(c => category.includes(c))) {
    economic = 'Medium';
  } else {
    // concrete, rubble, etc.
    economic = 'Low';
  }

  // --- Environmental Factor (العامل البيئي) ---
  // Depends on how much landfill is saved vs energy required to process
  // Reuse saves most (High), Recycling saves some (Medium), Disposal saves nothing (Low)
  const easilyRecyclable = ['حديد', 'ألمنيوم', 'طوب', 'خرسانة', 'خشب', 'زجاج'];
  if (highValueCategories.some(c => category.includes(c))) {
    environmental = 'High'; // Reuse prevents new manufacturing
  } else if (easilyRecyclable.some(c => category.includes(c))) {
    environmental = 'Medium'; // Recycling is better than landfill
  } else {
    environmental = 'Low';
  }

  // 2. Decision Matrix Mapping
  // Format: "Technical-Economic-Environmental"
  const matrix = {
    // Technical is High
    'High-High-High': 'direct_reuse',
    'High-High-Medium': 'direct_reuse',
    'High-Medium-Medium': 'direct_reuse',
    'High-Low-Medium': 'recycling',
    
    // Technical is Medium
    'Medium-High-High': 'refurbishment',
    'Medium-High-Medium': 'refurbishment',
    'Medium-Medium-Medium': 'refurbishment',
    'Medium-Low-Medium': 'recycling',
    'Medium-Low-Low': 'recycling',

    // Technical is Low
    'Low-High-High': 'recycling',
    'Low-Medium-Medium': 'recycling',
    'Low-Low-Low': 'recycling',
  };

  const comboKey = `${technical}-${economic}-${environmental}`;
  let recommendedPath = matrix[comboKey];

  // Fallback if combination not explicitly defined
  if (!recommendedPath) {
    if (technical === 'High' && economic === 'High') recommendedPath = 'direct_reuse';
    else if (technical === 'Medium' || economic === 'High') recommendedPath = 'refurbishment';
    else recommendedPath = 'recycling';
  }

  const scores = { technical, economic, environmental };

  return { 
    recommendedPath, 
    scores,
    reason: `Matrix [F: ${technical}, E: ${economic}, V: ${environmental}] -> ${recommendedPath}` 
  };
}

/**
 * Process BOQ File buffer
 */
export const processBOQUpload = async (fileBuffer, projectId) => {
  // 1. Parse Excel
  const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const boqData = xlsx.utils.sheet_to_json(sheet);

  // 2. Fetch all presets for matching
  const presets = await prisma.preset.findMany();

  const createdMaterials = [];

  // 3. Iterate over BOQ items
  for (const row of boqData) {
    const description = row['وصف العنصر كما يظهر في الحصر'] || row['الوصف'] || row['Description'];
    const category = row['الفئة'] || 'غير محدد';
    const quantity = row['الكمية'] || 1;
    const unit = row['الوحدة'] || 'عدد';
    const location = row['الموقع'] || '';
    const notes = row['ملاحظات'] || '';

    if (!description) continue; // Skip empty rows

    // Matching Logic: Find a preset whose nameAr includes the description (or vice versa)
    let bestMatch = presets.find(p => 
      description.includes(p.nameAr) || p.nameAr.includes(description)
    );

    // If no exact substring match, just pick one with same category for MVP or leave null
    if (!bestMatch) {
      bestMatch = presets.find(p => p.category === category);
    }

    const presetId = bestMatch ? bestMatch.id : null;
    let isHazardous = false;

    if (bestMatch && bestMatch.defaultValues) {
       // Try to extract hazardous info from DB
       const defVals = bestMatch.defaultValues;
       if (defVals['مواد خطرة'] === 'نعم' || defVals['Hazardous'] === 'Yes' || defVals['خطرة'] === 'نعم') {
          isHazardous = true;
       }
    }

    // Since we don't have Condition/Accessibility in BOQ yet (done by AI or manual later),
    // We set default values to simulate the gates if they were provided, or leave them for later.
    // We will assume "جيدة" (Good) and "سهل" (Easy) for initial upload, unless the AI step is run immediately.
    // Here we will run the gates with dummy data for now, user can update them later via API.
    const initialCondition = 'جيدة'; // 'جيدة' / 'متوسطة' / 'تالفة'
    const initialAccessibility = 'سهل'; // 'سهل' / 'متوسط' / 'يتعذر'

    let { isGated, gatingReason, recommendedPath } = applyGates(
      bestMatch, 
      initialCondition, 
      initialAccessibility, 
      isHazardous
    );

    if (!isGated) {
      const decision = runDecisionEngine(bestMatch, initialCondition, initialAccessibility);
      recommendedPath = decision.recommendedPath;
    }

    // 4. Create Material record
    const material = await prisma.material.create({
      data: {
        projectId,
        presetId,
        name: String(description),
        category: String(category),
        quantity: Number(quantity),
        unit: String(unit),
        notes: String(location + ' - ' + notes),
        isGated,
        gatingReason,
        recommendedPath,
        overrides: {
           condition: initialCondition,
           accessibility: initialAccessibility,
           isHazardous
        }
      }
    });

    createdMaterials.push(material);
  }

  return createdMaterials;
};
