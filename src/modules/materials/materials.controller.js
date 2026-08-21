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
