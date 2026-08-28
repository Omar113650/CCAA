import prisma from '../../utils/prisma.js';
import {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendForbidden,
  sendBadRequest,
} from '../../utils/response.js';
import {
  createMaterialSchema,
  updateMaterialSchema,
  validate,
} from '../../utils/validators.js';
import { processBOQUpload } from './materials.services.js';

/**
 * Verify the project belongs to the authenticated user
 */
const verifyProjectOwnership = async (res, projectId, userId) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    sendNotFound(res, 'Project not found');
    return false;
  }
  if (project.userId !== userId) {
    sendForbidden(res, 'You do not own this project');
    return false;
  }
  return true;
};

/**
 * GET /api/projects/:projectId/materials
 */
export const listMaterials = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return sendNotFound(res, 'Project not found');
    if (project.userId !== req.user.id) return sendForbidden(res);

    const materials = await prisma.material.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: { preset: true },
    });

    return sendSuccess(res, materials, 'Materials fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/projects/:projectId/materials
 */
export const createMaterial = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const owned = await verifyProjectOwnership(res, projectId, req.user.id);
    if (!owned) return;

    const { success, data, errors } = validate(createMaterialSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const material = await prisma.material.create({
      data: {
        ...data,
        projectId,
      },
      include: { preset: true },
    });

    return sendCreated(res, material, 'Material added');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/projects/:projectId/materials/:id
 */
export const getMaterial = async (req, res, next) => {
  try {
    const { projectId, id } = req.params;

    const material = await prisma.material.findFirst({
      where: { id, projectId },
      include: { preset: true },
    });

    if (!material) return sendNotFound(res, 'Material not found');

    // Check project ownership
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project.userId !== req.user.id) return sendForbidden(res);

    return sendSuccess(res, material, 'Material fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/projects/:projectId/materials/:id
 */
export const updateMaterial = async (req, res, next) => {
  try {
    const { projectId, id } = req.params;

    const owned = await verifyProjectOwnership(res, projectId, req.user.id);
    if (!owned) return;

    const existing = await prisma.material.findFirst({ where: { id, projectId } });
    if (!existing) return sendNotFound(res, 'Material not found');

    const { success, data, errors } = validate(updateMaterialSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const updated = await prisma.material.update({
      where: { id },
      data,
      include: { preset: true },
    });

    return sendSuccess(res, updated, 'Material updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/projects/:projectId/materials/:id
 */
export const deleteMaterial = async (req, res, next) => {
  try {
    const { projectId, id } = req.params;

    const owned = await verifyProjectOwnership(res, projectId, req.user.id);
    if (!owned) return;

    const existing = await prisma.material.findFirst({ where: { id, projectId } });
    if (!existing) return sendNotFound(res, 'Material not found');

    await prisma.material.delete({ where: { id } });

    return sendSuccess(res, null, 'Material deleted');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/projects/:projectId/materials/upload
 * Handle BOQ Excel upload and matching
 */
export const uploadBOQ = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const owned = await verifyProjectOwnership(res, projectId, req.user.id);
    if (!owned) return;

    if (!req.file) {
      return sendBadRequest(res, 'No file uploaded. Please upload an Excel file.');
    }

    // Process the file buffer and apply logic
    const createdMaterials = await processBOQUpload(req.file.buffer, projectId);

    return sendCreated(res, createdMaterials, `Successfully processed ${createdMaterials.length} materials from BOQ.`);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/projects/:projectId/materials/:id/assess
 * Assess material condition and accessibility via AI (Image)
 */
import { assessElementImage } from '../../utils/ai.js';
import { applyGates, runDecisionEngine } from './materials.services.js';

export const assessMaterialAI = async (req, res, next) => {
  try {
    const { projectId, id } = req.params;

    const owned = await verifyProjectOwnership(res, projectId, req.user.id);
    if (!owned) return;

    if (!req.file) {
      return sendBadRequest(res, 'No image file uploaded.');
    }

    const material = await prisma.material.findFirst({
      where: { id, projectId },
      include: { preset: true }
    });

    if (!material) return sendNotFound(res, 'Material not found');

    // Call AI Service
    const aiResult = await assessElementImage(req.file.buffer, req.file.mimetype, material.name);

    // Update overrides with new AI data
    const currentOverrides = (typeof material.overrides === 'object' && material.overrides) ? material.overrides : {};
    const isHazardous = currentOverrides.isHazardous === true;
    
    const newOverrides = {
      ...currentOverrides,
      condition: aiResult.condition,
      accessibility: aiResult.accessibility
    };

    // Re-evaluate Gates with new AI data
    let { isGated, gatingReason, recommendedPath } = applyGates(
      material.preset,
      aiResult.condition,
      aiResult.accessibility,
      isHazardous
    );

    if (!isGated) {
      const decision = runDecisionEngine(material, aiResult.condition);
      recommendedPath = decision.recommendedPath;
    }

    // Save back to DB
    const updated = await prisma.material.update({
      where: { id },
      data: {
        overrides: newOverrides,
        isGated,
        gatingReason,
        recommendedPath,
        aiSuggested: true
      },
      include: { preset: true }
    });

    return sendSuccess(res, updated, 'Material assessed by AI successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/projects/:projectId/materials/:id/evaluate
 * Receive condition + accessibility + isHazardous from frontend (manual/JSON body)
 * Applies Gates Logic and returns the decision.
 * 
 * Accepts BOTH frontend terms and backend terms:
 *   condition:     جيدة | متوسطة | سيئة (frontend) / تالفة (backend)
 *   accessibility: سهلة | متوسطة | صعبة (frontend) / يتعذر (backend)
 *   isHazardous:   true | false | "نعم" | "لا"
 */
export const evaluateMaterial = async (req, res, next) => {
  try {
    const { projectId, id } = req.params;

    const owned = await verifyProjectOwnership(res, projectId, req.user.id);
    if (!owned) return;

    const material = await prisma.material.findFirst({
      where: { id, projectId },
      include: { preset: true }
    });
    if (!material) return sendNotFound(res, 'Material not found');

    let { condition, accessibility, isHazardous } = req.body;

    // ===================================================
    // SMART NORMALIZATION
    // Frontend can send any value it wants (Arabic or English).
    // We map it intelligently to the internal gate values.
    // ===================================================

    // Normalize CONDITION → internal: 'جيدة' | 'متوسطة' | 'تالفة'
    const normalizeCondition = (val) => {
      if (!val) return 'متوسطة'; // default
      const v = String(val).toLowerCase().trim();
      if (v.includes('تالف') || v.includes('سيئ') || v.includes('poor') || v.includes('bad') || v.includes('damaged') || v.includes('broken')) return 'تالفة';
      if (v.includes('جيد') || v.includes('good') || v.includes('excellent') || v.includes('new') || v.includes('ممتاز')) return 'جيدة';
      return 'متوسطة'; // fair/متوسط → falls to decision engine
    };

    // Normalize ACCESSIBILITY → internal: 'سهل' | 'متوسط' | 'يتعذر'
    const normalizeAccessibility = (val) => {
      if (!val) return 'متوسط'; // default
      const v = String(val).toLowerCase().trim();
      if (v.includes('صعب') || v.includes('يتعذر') || v.includes('hard') || v.includes('difficult') || v.includes('inaccessible') || v.includes('impossible')) return 'يتعذر';
      if (v.includes('سهل') || v.includes('easy') || v.includes('simple') || v.includes('accessible')) return 'سهل';
      return 'متوسط';
    };

    // Normalize HAZARDOUS → boolean
    const normalizeHazardous = (val) => {
      if (val === true || val === 'نعم' || val === 'yes' || val === 'true' || val === 1 || val === '1') return true;
      if (val === false || val === 'لا' || val === 'no' || val === 'false' || val === 0 || val === '0') return false;
      // Fallback: check from preset DB
      const currentOv = (typeof material.overrides === 'object' && material.overrides) ? material.overrides : {};
      if (currentOv.isHazardous === true) return true;
      if (material.preset?.defaultValues) {
        const dv = material.preset.defaultValues;
        if (dv['مواد خطرة'] === 'نعم' || dv['Hazardous'] === 'Yes') return true;
      }
      return false;
    };

    const normalizedCondition = normalizeCondition(condition);
    const normalizedAccessibility = normalizeAccessibility(accessibility);
    const hazardous = normalizeHazardous(isHazardous);

    // Apply Gates Engine
    let { isGated, gatingReason, recommendedPath } = applyGates(
      material.preset,
      normalizedCondition,
      normalizedAccessibility,
      hazardous
    );

    let engineMessage = 'العنصر سليم ويمر لمحرك القرارات';
    if (!isGated) {
      const decision = runDecisionEngine(material, normalizedCondition);
      recommendedPath = decision.recommendedPath;
      engineMessage = decision.reason;
    }

    const currentOverrides = (typeof material.overrides === 'object' && material.overrides) ? material.overrides : {};
    const updated = await prisma.material.update({
      where: { id },
      data: {
        isGated,
        gatingReason,
        recommendedPath,
        overrides: {
          ...currentOverrides,
          condition: normalizedCondition,
          accessibility: normalizedAccessibility,
          isHazardous: hazardous,
          evaluatedManually: true
        }
      },
      include: { preset: true }
    });

    return sendSuccess(res, {
      material: updated,
      decision: {
        condition: normalizedCondition,
        accessibility: normalizedAccessibility,
        isHazardous: hazardous,
        isGated,
        gatingReason,
        recommendedPath: recommendedPath,
        message: isGated
          ? `تم توجيه العنصر: ${gatingReason}`
          : `تم تشغيل محرك القرارات: ${engineMessage}`
      }
    }, 'تم تقييم العنصر بنجاح');
  } catch (err) {
    next(err);
  }
};
