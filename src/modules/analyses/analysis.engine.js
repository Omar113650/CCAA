/**
 * CCAA Analysis Engine — Hierarchical Decision Logic (منطق القرار الهرمي)
 * Updated to align with CCAA Flowchart, notebooks, and economic local market matrices.
 */

import { generateAIStrategyRecommendation } from '../../utils/ai.js';

// ==========================================
// BASE VALUES PER CATEGORY (EGP per unit)
// ==========================================
const BASE_VALUES = {
  // Structural
  concrete: 150,
  steel: 8500,
  timber: 1200,
  iron: 7500,
  // Finishes
  tiles: 350,
  marble: 900,
  granite: 1100,
  glass: 450,
  // MEP
  copper_pipes: 12000,
  cables: 6000,
  // Other
  brick: 50,
  aluminum: 9000,
  default: 200,
};

// CO2 saved per ton per path (kg CO2e)
const CO2_SAVINGS = {
  direct_reuse: 850,
  refurbishment: 600,
  recycling: 350,
  safe_disposal: 0,
};

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

// ==========================================
// CATEGORY LEVEL EVALUATION FUNCTIONS
// ==========================================
export const evaluateTechnicalLevel = (preset, accessibility) => {
  const reuseRecycle = getReuseRecycleDb(preset);
  const disassembly = getDisassemblyDb(preset);

  if (reuseRecycle === 'إعادة التدوير' || disassembly === 'صعب') {
    return 'منخفض';
  }

  if (disassembly === 'سهل' && accessibility === 'سهل') {
    return 'عالي';
  } else if ((disassembly === 'سهل' && accessibility === 'متوسط') || (disassembly === 'متوسط' && accessibility === 'سهل')) {
    return 'متوسط-عالي';
  } else {
    return 'متوسط';
  }
};

export const evaluateEnvironmentalLevel = (preset) => {
  const reuseRecycle = getReuseRecycleDb(preset);
  if (reuseRecycle === 'إعادة التدوير') {
    return 'منخفض';
  }

  const envBenefit = getEnvironmentalBenefitDb(preset);
  if (envBenefit === 'High') {
    return 'عالي';
  } else if (envBenefit === 'Medium') {
    return 'متوسط';
  } else {
    return 'منخفض';
  }
};

export const evaluateEconomicLevel = (preset) => {
  const burden = getDisassemblyBurdenDb(preset);
  const market = getLocalMarketDb(preset);

  if (burden === 'Low') {
    if (market === 'High') return 'عالي';
    return 'متوسط';
  } else if (burden === 'Medium') {
    if (market === 'Low') return 'منخفض';
    if (market === 'Medium') return 'متوسط';
    return 'متوسط-عالي';
  } else { // High Burden
    if (market === 'High') return 'متوسط';
    return 'منخفض';
  }
};

// ==========================================
// DECISION MATRIX
// ==========================================
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

const calculateHierarchicalScore = (tech, econ, env) => {
  const scale = {
    'عالي': 4,
    'متوسط-عالي': 3,
    'متوسط': 2,
    'منخفض': 1,
  };
  const techVal = scale[tech] || 1;
  const econVal = scale[econ] || 1;
  const envVal = scale[env] || 1;

  const composite = (techVal * 15) + (econVal * 10) + (envVal * 5);
  return parseFloat(((composite / 120) * 100).toFixed(1));
};

const estimateValue = (material, path, score) => {
  const category = material.category?.toLowerCase() || 'default';
  const baseValuePerUnit = BASE_VALUES[category] || BASE_VALUES.default;
  const quantity = Number(material.quantity) || 0;

  const pathMultipliers = {
    direct_reuse: 0.85,
    refurbishment: 0.60,
    recycling: 0.25,
    safe_disposal: -0.15,
  };

  const multiplier = pathMultipliers[path] || 0;
  const scoreBonus = 1 + (score / 100) * 0.2;

  return parseFloat((baseValuePerUnit * quantity * multiplier * scoreBonus).toFixed(2));
};

// ==========================================
// MAIN MATERIAL ANALYSIS
// ==========================================
export const analyzeMaterial = (material, projectGating = {}) => {
  const overrides = material.overrides || {};
  
  const normalizeAccessibility = (val) => {
    if (!val) return 'سهل';
    const v = String(val).toLowerCase().trim();
    if (v.includes('صعب') || v.includes('يتعذر') || v.includes('hard') || v.includes('difficult') || v.includes('inaccessible') || v.includes('impossible')) return 'يتعذر';
    if (v.includes('متوسط') || v.includes('medium') || v.includes('fair') || v.includes('average')) return 'متوسط';
    return 'سهل';
  };

  const normalizeCondition = (val) => {
    if (!val) return 'جيدة';
    const v = String(val).toLowerCase().trim();
    if (v.includes('تالف') || v.includes('سيئ') || v.includes('poor') || v.includes('bad') || v.includes('damaged') || v.includes('broken')) return 'تالفة';
    if (v.includes('متوسط') || v.includes('medium') || v.includes('fair') || v.includes('average')) return 'متوسطة';
    return 'جيدة';
  };

  const isHazardous = overrides.isHazardous === true || overrides.isHazardous === 'نعم' || overrides.isHazardous === 'yes' || overrides.isHazardous === 'true' || 
    (overrides.isHazardous === undefined && getHazardousDb(material.preset));
  
  const accessibility = normalizeAccessibility(overrides.accessibility);
  const condition = normalizeCondition(overrides.condition);

  // Gates Evaluation
  const gates = {
    G1: { name: 'وجود مواد خطرة', passed: !isHazardous, reason: isHazardous ? 'مواد خطرة متبقية في العنصر' : null },
    G2: { name: 'إمكانية الوصول', passed: accessibility !== 'يتعذر', reason: accessibility === 'يتعذر' ? 'يتعذر الوصول المباشر للعنصر لتفكيكه' : null },
    G3: { name: 'حالة العنصر', passed: condition !== 'تالفة', reason: condition === 'تالفة' ? 'حالة العنصر تالفة ومحطمة' : null },
  };

  const isGated = !gates.G1.passed || !gates.G2.passed || !gates.G3.passed;
  const gatingReason = [gates.G1.reason, gates.G2.reason, gates.G3.reason]
    .filter(Boolean)
    .join(' | ');

  // Compute Levels
  const technicalLevel = evaluateTechnicalLevel(material.preset, accessibility);
  const economicLevel = evaluateEconomicLevel(material.preset);
  const environmentalLevel = evaluateEnvironmentalLevel(material.preset);

  // Recommended Path Selection
  let recommendedPath = null;
  if (isHazardous) {
    recommendedPath = 'safe_disposal';
  } else if (isGated) {
    recommendedPath = 'recycling';
  } else {
    const reuseRecycle = getReuseRecycleDb(material.preset);
    const disassembly = getDisassemblyDb(material.preset);

    if (reuseRecycle === 'إعادة التدوير' || disassembly === 'صعب') {
      recommendedPath = 'recycling';
    } else {
      const decision = getMatrixDecision(technicalLevel, economicLevel, environmentalLevel);
      if (decision === 'Reuse') {
        recommendedPath = condition === 'جيدة' ? 'direct_reuse' : 'refurbishment';
      } else {
        recommendedPath = 'recycling';
      }
    }
  }

  const priority = isGated && isHazardous ? 'غير مجدي (عدم تفكيك)' : 
    (recommendedPath === 'direct_reuse' ? 'أولوية قصوى' : 
     (recommendedPath === 'refurbishment' ? 'أولوية متوسطة' : 'أولوية منخفضة'));

  const description = {
    direct_reuse: 'أولوية قصوى: كافة المعايير تدعم قرار إعادة الاستخدام المباشر للعنصر.',
    refurbishment: 'أولوية متوسطة: العنصر صالح لإعادة الاستخدام بعد الترميم والتأهيل.',
    recycling: 'أولوية منخفضة: العنصر غير مناسب للاستخدام المباشر ويوجه لإعادة التدوير.',
    safe_disposal: 'تخلص آمن: المواد خطرة وتتطلب التخلص الآمن لحماية البيئة.'
  }[recommendedPath] || 'أولوية منخفضة: إعادة التدوير لعدم مطابقة شروط التفكيك.';

  const reusabilityScore = calculateHierarchicalScore(technicalLevel, economicLevel, environmentalLevel);
  const estimatedValue = estimateValue(material, recommendedPath, reusabilityScore);

  return {
    materialId: material.id,
    name: material.name,
    category: material.category,
    quantity: Number(material.quantity),
    unit: material.unit,
    scores: {
      technicalFeasibility: technicalLevel === 'عالي' ? 9 : (technicalLevel === 'متوسط-عالي' ? 7 : (technicalLevel === 'متوسط' ? 5 : 2)),
      environmentalPerformance: environmentalLevel === 'عالي' ? 9 : (environmentalLevel === 'متوسط' ? 6 : 2),
      economicViability: economicLevel === 'عالي' ? 9 : (economicLevel === 'متوسط-عالي' ? 7 : (economicLevel === 'متوسط' ? 5 : 2)),
      safetyContamination: isHazardous ? 2 : 9,
      timeLogistics: accessibility === 'سهل' ? 9 : (accessibility === 'متوسط' ? 6 : 2),
      marketPolicy: 5,
    },
    levels: {
      technical: technicalLevel,
      economic: economicLevel,
      environmental: environmentalLevel,
    },
    gates,
    reusabilityScore,
    recommendedPath,
    priority,
    description,
    estimatedValue,
    isGated,
    gatingReason: gatingReason || null,
    estimatedCO2Saved: parseFloat(
      ((Number(material.quantity) / 1000) * CO2_SAVINGS[recommendedPath]).toFixed(2)
    ),
  };
};

// ==========================================
// REPORT GENERATORS
// ==========================================
const generateDemolitionStrategy = (analyzedMaterials) => {
  const order = ['safe_disposal', 'recycling', 'refurbishment', 'direct_reuse'];

  const groups = order.map((path) => ({
    phase: path,
    label: {
      safe_disposal: 'المرحلة الأولى: المواد الخطرة والتخلص الآمن (Safe Disposal)',
      recycling: 'المرحلة الثانية: مواد قابلة لإعادة التدوير (Recycling)',
      refurbishment: 'المرحلة الثالثة: مواد تحتاج لإعادة تأهيل (Refurbishment)',
      direct_reuse: 'المرحلة الرابعة: مواد صالحة لإعادة الاستخدام المباشر (Direct Reuse)',
    }[path],
    materials: analyzedMaterials
      .filter((m) => m.recommendedPath === path)
      .map((m) => ({
        name: m.name,
        quantity: `${m.quantity} ${m.unit}`,
        estimatedValue: m.estimatedValue,
        priority: m.priority,
        description: m.description,
        accessibility: m.gates.G2.passed ? 'سهل الوصول والتفكيك' : 'صعب الوصول - تم تخفيض التوصية',
        notes: m.isGated ? m.gatingReason : null,
      })),
  })).filter((g) => g.materials.length > 0);

  return {
    totalPhases: groups.length,
    sequence: groups,
    safetyWarnings: analyzedMaterials
      .filter((m) => m.isGated && m.recommendedPath === 'safe_disposal')
      .map((m) => `${m.name}: ${m.gatingReason}`),
  };
};

const generateFinancialReport = (analyzedMaterials, projectCostPerM2, areaM2) => {
  const totalRevenue = analyzedMaterials
    .filter((m) => m.estimatedValue > 0)
    .reduce((sum, m) => sum + m.estimatedValue, 0);

  const totalDisposalCost = analyzedMaterials
    .filter((m) => m.estimatedValue < 0)
    .reduce((sum, m) => sum + Math.abs(m.estimatedValue), 0);

  const demolitionCost = projectCostPerM2 && areaM2
    ? Number(projectCostPerM2) * Number(areaM2)
    : null;

  const netValue = totalRevenue - totalDisposalCost - (demolitionCost || 0);

  const breakdown = analyzedMaterials.map((m) => ({
    material: m.name,
    path: m.recommendedPath,
    quantity: `${m.quantity} ${m.unit}`,
    estimatedValue: m.estimatedValue,
    levelDetails: `فني: ${m.levels.technical} | اقتصادي: ${m.levels.economic} | بيئي: ${m.levels.environmental}`,
  }));

  return {
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalDisposalCost: parseFloat(totalDisposalCost.toFixed(2)),
    demolitionCost: demolitionCost ? parseFloat(demolitionCost.toFixed(2)) : null,
    netValue: parseFloat(netValue.toFixed(2)),
    currency: 'EGP',
    breakdown,
    summary: `صافي القيمة المستردة المتوقعة للمواد بعد التفكيك: ${netValue.toFixed(0)} جنيه مصري.`,
  };
};

const generateEnvironmentalReport = (analyzedMaterials) => {
  const totalCO2Saved = analyzedMaterials.reduce((sum, m) => sum + m.estimatedCO2Saved, 0);

  const materialsDiverted = analyzedMaterials.filter(
    (m) => m.recommendedPath !== 'safe_disposal'
  ).length;

  const reusePercentage = analyzedMaterials.length > 0
    ? parseFloat(((materialsDiverted / analyzedMaterials.length) * 100).toFixed(1))
    : 0;

  const pathDistribution = ['direct_reuse', 'refurbishment', 'recycling', 'safe_disposal'].map((path) => {
    const count = analyzedMaterials.filter((m) => m.recommendedPath === path).length;
    return {
      path,
      count,
      percentage: analyzedMaterials.length > 0
        ? parseFloat(((count / analyzedMaterials.length) * 100).toFixed(1))
        : 0,
    };
  });

  const score = Math.min(100, parseFloat((reusePercentage * 0.6 + (totalCO2Saved / 100) * 0.4).toFixed(1)));

  return {
    environmentalScore: score,
    totalCO2SavedKg: parseFloat(totalCO2Saved.toFixed(2)),
    equivalentTreesPlanted: Math.round(totalCO2Saved / 21),
    wastesDiverted: materialsDiverted,
    reusePercentage,
    pathDistribution,
    summary: `تم تحويل ${reusePercentage}% من المواد بعيداً عن المكبات، مما يساهم في خفض حوالي ${totalCO2Saved.toFixed(0)} كجم من انبعاثات ثنائي أكسيد الكربون.`,
  };
};

// ==========================================
// MAIN ANALYSIS RUNNER (ASYNCHRONOUS)
// ==========================================
export const runProjectAnalysis = async (project) => {
  const { materials = [] } = project;

  const projectGating = {
    hasHazardousMaterials: project.hasHazardousMaterials,
    nearGroundwaterOrUnstableSoil: project.nearGroundwaterOrUnstableSoil,
    distanceToNeighbors: project.distanceToNeighbors,
    isDensePollutionSensitiveArea: project.isDensePollutionSensitiveArea,
  };

  // Analyze each material
  const analyzedMaterials = materials.map((m) => analyzeMaterial(m, projectGating));

  // Generate reports
  const demolitionStrategy = generateDemolitionStrategy(analyzedMaterials);
  const financialReport = generateFinancialReport(
    analyzedMaterials,
    project.estimatedDemolitionCostPerM2,
    project.areaM2
  );
  const environmentalReport = generateEnvironmentalReport(analyzedMaterials);

  // Generate AI Strategy Recommendation using Gemini
  const aiRecommendation = await generateAIStrategyRecommendation(analyzedMaterials, project);
  if (aiRecommendation) {
    demolitionStrategy.aiRecommendation = aiRecommendation;
  }

  return {
    materialResults: analyzedMaterials,
    demolitionStrategy,
    financialReport,
    environmentalReport,
    summary: {
      totalMaterials: materials.length,
      averageReusabilityScore: materials.length > 0
        ? parseFloat((analyzedMaterials.reduce((s, m) => s + m.reusabilityScore, 0) / analyzedMaterials.length).toFixed(1))
        : 0,
      gatedMaterials: analyzedMaterials.filter((m) => m.isGated).length,
    },
  };
};
