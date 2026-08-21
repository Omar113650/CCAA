/**
 * CCAA Analysis Engine — Hierarchical Decision Logic (منطق القرار الهرمي)
 * 
 * Analyzes each material based on the CCAA Hierarchical Decision Framework:
 * 1. Evaluates 5 Gating Criteria (Pass/Fail)
 * 2. Groups criteria into 3 main families (TECHNICAL, ECONOMIC, ENVIRONMENTAL)
 * 3. Follows the Decision Tree Pipeline to classify each family (High, Medium, Low)
 * 4. Applies a 27-combination Lookup Table tailored for the Egyptian Market (Economic priority)
 * 5. Integrates Safety Contexts & Item-Level Access filters
 * 6. Generates Demolition Strategy, Financial, and Environmental reports
 */

// ==========================================
// SCORING WEIGHTS FOR INTERMEDIATE STATS (sum = 1.0)
// ==========================================
const WEIGHTS = {
  technicalFeasibility: 0.25,
  environmentalPerformance: 0.20,
  economicViability: 0.20,
  safetyContamination: 0.20,
  timeLogistics: 0.10,
  marketPolicy: 0.05,
};

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
// 27-COMBINATION LOOKUP TABLE (Egyptian Market Context)
// ==========================================
const DECISION_MATRIX = {
  // TECHNICAL - ECONOMIC - ENVIRONMENTAL
  'عالي-عالي-عالي': {
    priority: 'قصوى',
    path: 'direct_reuse',
    description: 'أولوية قصوى: كافة المعايير تدعم قرار إعادة الاستخدام المباشر للعنصر.',
  },
  'عالي-عالي-متوسط': {
    priority: 'عالية',
    path: 'direct_reuse',
    description: 'أولوية عالية: جدوى فنية واقتصادية ممتازة، مع أداء بيئي متوسط.',
  },
  'عالي-عالي-منخفض': {
    priority: 'عالية',
    path: 'direct_reuse',
    description: 'أولوية عالية: توافق ممتاز في الجدوى الفنية والاقتصادية (أولوية السوق المصري بالرغم من ضعف الأداء البيئي).',
  },
  'عالي-متوسط-عالي': {
    priority: 'عالية',
    path: 'direct_reuse',
    description: 'أولوية عالية: جدوى فنية وبيئية قوية مع ملاءمة اقتصادية مقبولة.',
  },
  'عالي-متوسط-متوسط': {
    priority: 'متوسطة',
    path: 'refurbishment',
    description: 'أولوية متوسطة: جدوى فنية ممتازة مع حاجة لإعادة تأهيل خفيفة للتوافق الاقتصادي والبيئي.',
  },
  'عالي-متوسط-منخفض': {
    priority: 'متوسطة',
    path: 'refurbishment',
    description: 'أولوية متوسطة: فني ممتاز واقتصادي متوسط، يوصى بالتفكيك وإعادة التأهيل.',
  },
  'عالي-منخفض-عالي': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: جدوى اقتصادية ضعيفة تمنع إعادة الاستخدام المباشر؛ يُفضل التوجيه لإعادة التدوير.',
  },
  'عالي-منخفض-متوسط': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: انخفاض الجدوى الاقتصادية يرجح خيار التفكيك وإعادة التدوير.',
  },
  'عالي-منخفض-منخفض': {
    priority: 'منخفضة',
    path: 'safe_disposal',
    description: 'أولوية منخفضة (غير مجدي): ضعف العائد الاقتصادي والأثر البيئي يفرض التخلص الآمن.',
  },

  'متوسط-عالي-عالي': {
    priority: 'عالية',
    path: 'refurbishment',
    description: 'أولوية عالية: الجدوى الاقتصادية والبيئية كافية لتعزيز التفكيك وإعادة التأهيل ولو كان الجانب الفني متوسطاً.',
  },
  'متوسط-عالي-متوسط': {
    priority: 'عالية',
    path: 'refurbishment',
    description: 'أولوية عالية: توافق اقتصادي ممتاز يدعم عمليات إعادة التأهيل للعنصر.',
  },
  'متوسط-عالي-منخفض': {
    priority: 'متوسطة',
    path: 'refurbishment',
    description: 'أولوية متوسطة: جدوى اقتصادية ممتازة تدعم الاسترجاع بالرغم من ضعف الأداء البيئي.',
  },
  'متوسط-متوسط-عالي': {
    priority: 'متوسطة',
    path: 'refurbishment',
    description: 'أولوية متوسطة: أداء متوازن يميل لإعادة التأهيل نظراً للجدوى البيئية الجيدة.',
  },
  'متوسط-متوسط-متوسط': {
    priority: 'متوسطة',
    path: 'refurbishment',
    description: 'أولوية متوسطة: معايير متعادلة تدعم التفكيك الانتقائي وإعادة التأهيل.',
  },
  'متوسط-متوسط-منخفض': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: يُقترح التوجيه لإعادة التدوير لضعف العائد البيئي المباشر.',
  },
  'متوسط-منخفض-عالي': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: الأداء البيئي ممتاز ولكن ضعف الجدوى الاقتصادية يوجهنا لإعادة التدوير.',
  },
  'متوسط-منخفض-متوسط': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: يُقترح إعادة التدوير لضعف المردود المالي المباشر.',
  },
  'متوسط-منخفض-منخفض': {
    priority: 'غير مجدي',
    path: 'safe_disposal',
    description: 'غير مجدي: ضعف الجدوى الاقتصادية والبيئية يستدعي التخلص الآمن والتوجيه للمكبات المعتمدة.',
  },

  'منخفض-عالي-عالي': {
    priority: 'متوسطة',
    path: 'recycling',
    description: 'أولوية متوسطة: على الرغم من التحديات الفنية، فإن العائد الاقتصادي والبيئي المرتفع يدعم التدوير والاستخلاص.',
  },
  'منخفض-عالي-متوسط': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: تحديات فنية كبيرة تعوق الاسترجاع المباشر بالرغم من توفر السوق.',
  },
  'منخفض-عالي-منخفض': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: صعوبة التفكيك الفنية مع ضعف البيئة توجه المادة لإعادة التدوير فقط للاستفادة الاقتصادية.',
  },
  'منخفض-متوسط-عالي': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: يُقترح إعادة التدوير لوجود عائد بيئي مقبول مع صعوبة التفكيك الفنية.',
  },
  'منخفض-متوسط-متوسط': {
    priority: 'منخفضة',
    path: 'recycling',
    description: 'أولوية منخفضة: صعوبات فنية مع مردود اقتصادي متوسط يوجه المادة لإعادة التدوير.',
  },
  'منخفض-متوسط-منخفض': {
    priority: 'منخفضة جداً (ملغى للجدوى)',
    path: 'safe_disposal',
    description: 'ملغى للجدوى: الصعوبة الفنية مع انخفاض العوائد الاقتصادية والبيئية تجعل التفكيك غير مجدٍ.',
  },
  'منخفض-منخفض-عالي': {
    priority: 'منخفضة جداً (ملغى للجدوى)',
    path: 'safe_disposal',
    description: 'ملغى للجدوى: الأداء البيئي ممتاز ولكن صعوبة الفك وضعف الجدوى الاقتصادية يلغيان خيار التفكيك.',
  },
  'منخفض-منخفض-متوسط': {
    priority: 'غير مجدي (عدم تفكيك)',
    path: 'safe_disposal',
    description: 'غير مجدي: يُقترح الهدم التقليدي والتخلص الآمن نظراً لتدني جميع المعايير.',
  },
  'منخفض-منخفض-منخفض': {
    priority: 'غير مجدي (عدم تفكيك)',
    path: 'safe_disposal',
    description: 'غير مجدي: انخفاض تام في كافة معايير التفكيك والاسترجاع؛ يوصى بالهدم التقليدي والتخلص الآمن.',
  },
};

/**
 * Extract score from a criteria JSON field
 * Defaults to 5 (neutral) if not provided
 */
const getScore = (criteriaJson) => {
  if (!criteriaJson) return 5;
  if (typeof criteriaJson === 'object' && criteriaJson.score !== undefined) {
    return Math.min(10, Math.max(0, Number(criteriaJson.score)));
  }
  return 5;
};

/**
 * Evaluate Technical Family (TECHNICAL)
 * Uses hierarchical decision logic based on technicalFeasibility & timeLogistics
 */
const evaluateTechnicalLevel = (techFeasibility, timeLogistics) => {
  if (techFeasibility >= 7.5) {
    return timeLogistics >= 5.0 ? 'عالي' : 'متوسط';
  } else if (techFeasibility >= 4.0) {
    return timeLogistics >= 5.0 ? 'متوسط' : 'منخفض';
  } else {
    return 'منخفض';
  }
};

/**
 * Evaluate Economic Family (ECONOMIC)
 * Prioritizes economic factors to align with Egyptian market dynamics
 */
const evaluateEconomicLevel = (economicViability, marketPolicy) => {
  if (economicViability >= 7.0) {
    return marketPolicy >= 4.0 ? 'عالي' : 'متوسط';
  } else if (economicViability >= 4.0) {
    return marketPolicy >= 5.0 ? 'متوسط' : 'منخفض';
  } else {
    return 'منخفض';
  }
};

/**
 * Evaluate Environmental Family (ENVIRONMENTAL)
 * Accounts for environmentalPerformance, safetyContamination, and green certification status
 */
const evaluateEnvironmentalLevel = (envPerformance, safetyContam, hasGreenOverride) => {
  let level = 'منخفض';
  if (envPerformance >= 7.5) {
    level = safetyContam >= 5.0 ? 'عالي' : 'متوسط';
  } else if (envPerformance >= 4.0) {
    level = safetyContam >= 4.0 ? 'متوسط' : 'منخفض';
  }

  // Green / high sustainability context boost
  if (hasGreenOverride && level === 'متوسط') {
    level = 'عالي';
  }
  return level;
};

/**
 * Map high/medium/low levels of the 3 families to a unified reusability score (0-100)
 */
const calculateHierarchicalScore = (tech, econ, env) => {
  const scale = {
    'عالي': 3,
    'متوسط': 2,
    'منخفض': 1,
  };
  const techVal = scale[tech] || 1;
  const econVal = scale[econ] || 1;
  const envVal = scale[env] || 1;

  // Weighted composition (Technical = 15, Economic = 10, Environmental = 5)
  // Max possible: 3*15 + 3*10 + 3*5 = 90
  // Min possible: 1*15 + 1*10 + 1*5 = 30
  const composite = (techVal * 15) + (econVal * 10) + (envVal * 5);
  
  // Normalize to 0 - 100 range
  return parseFloat(((composite / 90) * 100).toFixed(1));
};

/**
 * Estimate material value based on category, quantity, path, and score
 */
const estimateValue = (material, path, score) => {
  const category = material.category?.toLowerCase() || 'default';
  const baseValuePerUnit = BASE_VALUES[category] || BASE_VALUES.default;
  const quantity = Number(material.quantity) || 0;

  const pathMultipliers = {
    direct_reuse: 0.85,    // 85% of market value
    refurbishment: 0.60,   // 60% after refurbishment costs
    recycling: 0.25,       // 25% for raw material recycling
    safe_disposal: -0.15,  // Negative (represents cleanup & disposal costs)
  };

  const multiplier = pathMultipliers[path] || 0;
  const scoreBonus = 1 + (score / 100) * 0.2;

  return parseFloat((baseValuePerUnit * quantity * multiplier * scoreBonus).toFixed(2));
};

/**
 * Analyze a single material using Hierarchical Decision Logic (HDL)
 */
export const analyzeMaterial = (material, projectGating = {}) => {
  const techFeasibility = getScore(material.technicalFeasibility);
  const envPerformance = getScore(material.environmentalPerformance);
  const economicViability = getScore(material.economicViability);
  const safetyContamination = getScore(material.safetyContamination);
  const timeLogistics = getScore(material.timeLogistics);
  const marketPolicy = getScore(material.marketPolicy);

  // 1. Evaluate Levels for the 3 Families
  const technicalLevel = evaluateTechnicalLevel(techFeasibility, timeLogistics);
  const economicLevel = evaluateEconomicLevel(economicViability, marketPolicy);

  // Check if green / sustainable environment is active
  const hasGreenOverride = projectGating.isDensePollutionSensitiveArea || !!material.overrides?.greenCertificate;
  const environmentalLevel = evaluateEnvironmentalLevel(envPerformance, safetyContamination, hasGreenOverride);

  // 2. Evaluate the 5 Gates (Pass/Fail)
  const gates = {
    G1: { name: 'وجود مواد خطرة', passed: true, reason: null },
    G2: { name: 'الاستقرار الإنشائي أثناء الإزالة', passed: true, reason: null },
    G3: { name: 'مخاطر سلامة العمال', passed: true, reason: null },
    G4: { name: 'إمكانية الوصول', passed: true, reason: null },
    G5: { name: 'حد فعالية التكلفة', passed: true, reason: null },
  };

  // G1: Hazardous Materials
  if (projectGating.hasHazardousMaterials && safetyContamination <= 4) {
    gates.G1.passed = false;
    gates.G1.reason = 'وجود مواد خطرة في سياق المشروع مع ضعف تقييم السلامة للعنصر.';
  } else if (safetyContamination <= 2) {
    gates.G1.passed = false;
    gates.G1.reason = 'العنصر يحتوي على ملوثات خطرة جداً تمنع إعادة الاستخدام.';
  }

  // G2: Structural Stability
  if (techFeasibility <= 2 || !!material.overrides?.structuralInstability) {
    gates.G2.passed = false;
    gates.G2.reason = 'ضعف الاستقرار الإنشائي أثناء الإزالة يمنع عملية التفكيك الآمن.';
  }

  // G3: Worker Safety
  if (safetyContamination <= 3 || !!material.overrides?.workerSafetyRisk) {
    gates.G3.passed = false;
    gates.G3.reason = 'مخاطر عالية على سلامة العمال تمنع تفكيك العنصر يدوياً.';
  }

  // G4: Access to Connections (evaluated at item level)
  if (!!material.overrides?.inaccessible) {
    gates.G4.passed = false;
    gates.G4.reason = 'تعذر الوصول المباشر للروابط والتوصيلات الخاصة بهذا العنصر.';
  }

  // G5: Cost-Effectiveness Threshold
  if (economicViability <= 2) {
    gates.G5.passed = false;
    gates.G5.reason = 'تكلفة تفكيك واستخلاص المادة تتجاوز قيمتها السوقية التقديرية.';
  }

  // 3. Apply Safety Contexts Filter (سياقات الأمان)
  // Neighbors proximity or groundwater presence forces dismantling even if cost effectiveness (G5) fails.
  const safetyContextActive = 
    projectGating.nearGroundwaterOrUnstableSoil || 
    projectGating.isDensePollutionSensitiveArea ||
    (projectGating.distanceToNeighbors && 
     /close|adjacent|dense|قريب|متلاصق/i.test(projectGating.distanceToNeighbors));

  let isG5Bypassed = false;
  if (!gates.G5.passed && safetyContextActive) {
    gates.G5.passed = true;
    gates.G5.reason = 'تم تجاوز حد التكلفة لمقتضيات الأمان البيئي والإنشائي للموقع المحيط (مياه جوفية أو مباني متلاصقة).';
    isG5Bypassed = true;
  }

  // Determine if gated out of deconstruction (G1, G2, G3 must pass. G4 is item-level and G5 is economic/safety)
  const isGated = !gates.G1.passed || !gates.G2.passed || !gates.G3.passed;
  const gatingReason = [gates.G1.reason, gates.G2.reason, gates.G3.reason]
    .filter(Boolean)
    .join(' | ');

  // 4. Lookup from the 27-Combination Decision Matrix
  const lookupKey = `${technicalLevel}-${economicLevel}-${environmentalLevel}`;
  const decision = DECISION_MATRIX[lookupKey] || {
    priority: 'متوسطة',
    path: 'recycling',
    description: 'تصنيف افتراضي لعدم تطابق التوليفة.',
  };

  // If any safety gate failed, force safe disposal regardless of lookup
  let recommendedPath = isGated ? 'safe_disposal' : decision.path;
  let priority = isGated ? 'غير مجدي (عدم تفكيك)' : decision.priority;

  // Item-level Access Filter check (G4)
  // If the item itself has poor access, we degrade the path to recycling/safe_disposal
  if (!gates.G4.passed && !isGated) {
    recommendedPath = recommendedPath === 'direct_reuse' ? 'refurbishment' : 'recycling';
    priority = 'منخفضة (لصعوبة الوصول)';
  }

  // Calculate final score
  const reusabilityScore = calculateHierarchicalScore(technicalLevel, economicLevel, environmentalLevel);

  // Estimate final value
  const estimatedValue = estimateValue(material, recommendedPath, reusabilityScore);

  return {
    materialId: material.id,
    name: material.name,
    category: material.category,
    quantity: Number(material.quantity),
    unit: material.unit,
    scores: {
      technicalFeasibility: techFeasibility,
      environmentalPerformance: envPerformance,
      economicViability: economicViability,
      safetyContamination: safetyContamination,
      timeLogistics: timeLogistics,
      marketPolicy: marketPolicy,
    },
    levels: {
      technical: technicalLevel,
      economic: economicLevel,
      environmental: environmentalLevel,
    },
    gates,
    safetyContextActive,
    isG5Bypassed,
    reusabilityScore,
    recommendedPath,
    priority,
    description: decision.description,
    estimatedValue,
    isGated,
    gatingReason: gatingReason || null,
    estimatedCO2Saved: parseFloat(
      ((Number(material.quantity) / 1000) * CO2_SAVINGS[recommendedPath]).toFixed(2)
    ),
  };
};

/**
 * Generate demolition strategy (ordered sequence)
 */
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
        accessibility: m.gates.G4.passed ? 'سهل الوصول والتفكيك' : 'صعب الوصول - تم تخفيض التوصية',
        notes: m.isGated ? m.gatingReason : (m.isG5Bypassed ? 'تم تجاوز تكلفة التفكيك لدواعي الأمان' : null),
      })),
  })).filter((g) => g.materials.length > 0);

  return {
    totalPhases: groups.length,
    sequence: groups,
    safetyWarnings: analyzedMaterials
      .filter((m) => m.isGated)
      .map((m) => `${m.name}: ${m.gatingReason}`),
  };
};

/**
 * Generate financial report
 */
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

/**
 * Generate environmental report
 */
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

/**
 * Main analysis runner based on Hierarchical Decision Logic
 */
export const runProjectAnalysis = (project) => {
  const { materials = [] } = project;

  const projectGating = {
    hasHazardousMaterials: project.hasHazardousMaterials,
    nearGroundwaterOrUnstableSoil: project.nearGroundwaterOrUnstableSoil,
    distanceToNeighbors: project.distanceToNeighbors,
    isDensePollutionSensitiveArea: project.isDensePollutionSensitiveArea,
  };

  // Analyze each material hierarchically
  const analyzedMaterials = materials.map((m) => analyzeMaterial(m, projectGating));

  // Generate reports
  const demolitionStrategy = generateDemolitionStrategy(analyzedMaterials);
  const financialReport = generateFinancialReport(
    analyzedMaterials,
    project.estimatedDemolitionCostPerM2,
    project.areaM2
  );
  const environmentalReport = generateEnvironmentalReport(analyzedMaterials);

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
