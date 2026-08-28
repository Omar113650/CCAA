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
 * The Decision Engine
 * Determines final path (direct_reuse, refurbishment, recycling) for non-gated materials
 */
export function runDecisionEngine(element, condition) {
  const category = element?.category || 'غير محدد';
  
  // Example predefined category types based on usual construction elements
  const recyclableOnly = ['خرسانة', 'طوب', 'حديد تسليح', 'حصى', 'رمل', 'زجاج مكسور', 'أسمنت'];
  const highlyReusable = ['أبواب', 'نوافذ', 'إضاءة', 'صحي', 'أثاث', 'ديكور', 'تكييف', 'أجهزة'];

  const isRecyclable = recyclableOnly.some(c => category.includes(c));
  const isReusable = highlyReusable.some(c => category.includes(c));

  let recommendedPath = 'recycling';

  if (isRecyclable) {
    recommendedPath = 'recycling';
  } else if (isReusable) {
    if (condition === 'جيدة') recommendedPath = 'direct_reuse';
    else if (condition === 'متوسطة') recommendedPath = 'refurbishment';
    else recommendedPath = 'recycling';
  } else {
    // Default fallback based on condition
    if (condition === 'جيدة') recommendedPath = 'direct_reuse';
    else if (condition === 'متوسطة') recommendedPath = 'refurbishment';
    else recommendedPath = 'recycling';
  }

  return { recommendedPath, reason: `Decision Engine: Condition is ${condition}, Category is ${category}` };
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
      const decision = runDecisionEngine(bestMatch, initialCondition);
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
