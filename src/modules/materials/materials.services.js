import * as xlsx from 'xlsx';
import prisma from '../../utils/prisma.js';

// ==========================================
// PRESET PARSER FOR MULTILINGUAL COLUMN HEADERS
// ==========================================
const getPresetDbValue = (preset, keys) => {
  if (!preset || !preset.defaultValues) return null;
  for (const key of keys) {
    if (preset.defaultValues[key] !== undefined) {
      return preset.defaultValues[key];
    }
  }
  return null;
};

const getReuseRecycleDb = (preset) => {
  const val = getPresetDbValue(preset, [
    'إعادة الاستخدام / إعادة التدوير',
    'Reuse / Recycle',
    'القرار',
    'Decision',
    'Reuse/Recycle',
    'إعادة الاستخدام'
  ]);
  if (!val) return 'إعادة الاستخدام';
  const s = String(val).trim();
  if (s.includes('تدوير') || s.includes('Recycle') || s.includes('recycle') || s.includes('إعادة التدوير')) {
    return 'إعادة التدوير';
  }
  return 'إعادة الاستخدام';
};

const getDisassemblyDb = (preset) => {
  const val = getPresetDbValue(preset, [
    'التفكيك',
    'Disassembly',
    'سهولة التفكيك',
    'Disassembly Ease'
  ]);
  if (!val) return 'سهل';
  const s = String(val).trim();
  if (s.includes('صعب') || s.includes('Difficult') || s.includes('difficult') || s.includes('Hard') || s.includes('hard')) {
    return 'صعب';
  }
  return 'سهل';
};

const getEnvironmentalBenefitDb = (preset) => {
  const val = getPresetDbValue(preset, [
    'الفائدة البيئية',
    'Environmental Benefit',
    'الأثر البيئي',
    'Environmental benefit',
    'المنفعة البيئية'
  ]);
  if (!val) return 'Medium';
  const s = String(val).toLowerCase().trim();
  if (s.includes('high') || s.includes('عالية') || s.includes('عالي')) return 'High';
  if (s.includes('low') || s.includes('منخفضة') || s.includes('منخفض')) return 'Low';
  return 'Medium';
};

const getDisassemblyBurdenDb = (preset) => {
  const val = getPresetDbValue(preset, [
    'عبء التفكيك',
    'Disassembly Burden',
    'Disassembly burden'
  ]);
  if (!val) return 'Medium';
  const s = String(val).toLowerCase().trim();
  if (s.includes('low') || s.includes('منخفض')) return 'Low';
  if (s.includes('high') || s.includes('مرتفع') || s.includes('عالي')) return 'High';
  return 'Medium';
};

const getLocalMarketDb = (preset) => {
  const val = getPresetDbValue(preset, [
    'السوق المحلي',
    'Local Market',
    'السوق',
    'Market'
  ]);
  if (!val) return 'Medium';
  const s = String(val).toLowerCase().trim();
  if (s.includes('low') || s.includes('منخفض')) return 'Low';
  if (s.includes('high') || s.includes('عالي') || s.includes('مرتفع')) return 'High';
  return 'Medium';
};

const getHazardousDb = (preset) => {
  const val = getPresetDbValue(preset, [
    'مواد خطرة',
    'Hazardous',
    'خطرة',
    'IsHazardous'
  ]);
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return (s === 'نعم' || s === 'yes' || s === 'true' || s === '1');
};

const getMatrixDecision = (tech, econ, env) => {
  if (tech === 'منخفض' || econ === 'منخفض') return 'Recycle';

  if (
    (tech === 'عالي' || tech === 'متوسط-عالي') &&
    (econ === 'عالي' || econ === 'متوسط-عالي' || econ === 'متوسط') &&
    (env === 'عالي' || env === 'متوسط')
  ) {
    return 'Reuse';
  }

  if (
    tech === 'متوسط' &&
    (econ === 'عالي' || econ === 'متوسط-عالي') &&
    (env === 'عالي' || env === 'متوسط')
  ) {
    return 'Reuse';
  }

  return 'Recycle';
};

/**
 * The Gates Engine
 * Gate 1: Hazardous Check -> Safe disposal
 * Gate 2: Inaccessible Check -> Recycling
 * Gate 3: Damaged Condition Check -> Recycling
 */
export function applyGates(element, condition, accessibility, isHazardous) {
  let isGated = false;
  let gatingReason = null;
  let recommendedPath = null;

  // Gate 1: Hazardous Check
  if (isHazardous === true || String(isHazardous).trim() === 'نعم' || String(isHazardous).trim() === 'true') {
    isGated = true;
    gatingReason = 'وجود مواد خطرة';
    recommendedPath = 'safe_disposal';
  } 
  // Gate 2: Inaccessible
  else if (accessibility === 'يتعذر') {
    isGated = true;
    gatingReason = 'يتعذر الوصول إلى العنصر';
    recommendedPath = 'recycling';
  } 
  // Gate 3: Damaged
  else if (condition === 'تالفة') {
    isGated = true;
    gatingReason = 'حالة العنصر تالفة';
    recommendedPath = 'recycling';
  }

  return { isGated, gatingReason, recommendedPath };
}

/**
 * The Decision Engine (Matrix-Based)
 * Evaluates Technical, Economic, and Environmental factors to assign levels.
 * Maps combinations to a recommended path.
 */
export function runDecisionEngine(material, condition, accessibility) {
  const preset = material.preset || material;

  const normalizeCondition = (val) => {
    if (!val) return 'جيدة';
    const v = String(val).toLowerCase().trim();
    if (v.includes('تالف') || v.includes('سيئ') || v.includes('poor') || v.includes('bad') || v.includes('damaged') || v.includes('broken')) return 'تالفة';
    if (v.includes('متوسط') || v.includes('medium') || v.includes('fair') || v.includes('average')) return 'متوسطة';
    return 'جيدة';
  };

  const normalizeAccessibility = (val) => {
    if (!val) return 'سهل';
    const v = String(val).toLowerCase().trim();
    if (v.includes('صعب') || v.includes('يتعذر') || v.includes('hard') || v.includes('difficult') || v.includes('inaccessible') || v.includes('impossible')) return 'يتعذر';
    if (v.includes('متوسط') || v.includes('medium') || v.includes('fair') || v.includes('average')) return 'متوسط';
    return 'سهل';
  };

  const normalizedCondition = normalizeCondition(condition);
  const normalizedAccessibility = normalizeAccessibility(accessibility);

  // 1. Technical Level
  let technical = 'منخفض';
  const reuseRecycle = getReuseRecycleDb(preset);
  const disassembly = getDisassemblyDb(preset);

  if (reuseRecycle === 'إعادة التدوير' || disassembly === 'صعب') {
    technical = 'منخفض';
  } else {
    if (disassembly === 'سهل' && normalizedAccessibility === 'سهل') {
      technical = 'عالي';
    } else if ((disassembly === 'سهل' && normalizedAccessibility === 'متوسط') || (disassembly === 'متوسط' && normalizedAccessibility === 'سهل')) {
      technical = 'متوسط-عالي';
    } else {
      technical = 'متوسط';
    }
  }

  // 2. Environmental Level
  let environmental = 'منخفض';
  if (reuseRecycle === 'إعادة الاستخدام') {
    const envBenefit = getEnvironmentalBenefitDb(preset);
    if (envBenefit === 'High') environmental = 'عالي';
    else if (envBenefit === 'Medium') environmental = 'متوسط';
    else environmental = 'منخفض';
  }

  // 3. Economic Level
  let economic = 'منخفض';
  const burden = getDisassemblyBurdenDb(preset);
  const market = getLocalMarketDb(preset);

  if (burden === 'Low') {
    if (market === 'High') economic = 'عالي';
    else economic = 'متوسط';
  } else if (burden === 'Medium') {
    if (market === 'Low') economic = 'منخفض';
    else if (market === 'Medium') economic = 'متوسط';
    else economic = 'متوسط-عالي';
  } else { // High Burden
    if (market === 'High') economic = 'متوسط';
    else economic = 'منخفض';
  }

  // 4. Matrix Decision
  let recommendedPath = 'recycling';
  if (reuseRecycle === 'إعادة التدوير' || disassembly === 'صعب') {
    recommendedPath = 'recycling';
  } else {
    const decision = getMatrixDecision(technical, economic, environmental);
    if (decision === 'Reuse') {
      recommendedPath = normalizedCondition === 'جيدة' ? 'direct_reuse' : 'refurbishment';
    } else {
      recommendedPath = 'recycling';
    }
  }

  const scores = { technical, economic, environmental };

  return { 
    recommendedPath, 
    scores,
    reason: `المنطق الهرمي الجديد [فني: ${technical} | اقتصادي: ${economic} | بيئي: ${environmental}] -> ${recommendedPath}`
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
    const description = row['وصف العنصر كما يظهر في الحصر'] || row['الوصف'] || row['Description'] || row['العنصر'] || row['وصف العنصر'] || row['Item'];
    const category = row['الفئة'] || row['Category'] || 'غير محدد';
    const quantity = row['الكمية'] || row['الكميه'] || row['Quantity'] || 1;
    const unit = row['الوحدة'] || row['الوحده'] || row['Unit'] || 'عدد';
    const location = row['الموقع'] || row['Location'] || '';
    const notes = row['ملاحظات'] || row['Notes'] || '';

    if (!description) continue; // Skip empty rows

    // Matching Logic: Find a preset whose nameAr includes the description (or vice versa)
    let bestMatch = presets.find(p => 
      description.includes(p.nameAr) || p.nameAr.includes(description)
    );

    // If no exact substring match, just pick one with same category
    if (!bestMatch) {
      bestMatch = presets.find(p => p.category === category);
    }

    const presetId = bestMatch ? bestMatch.id : null;
    let isHazardous = false;

    if (bestMatch) {
      isHazardous = getHazardousDb(bestMatch);
    }

    const initialCondition = 'جيدة';
    const initialAccessibility = 'سهل';

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
