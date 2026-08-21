import prisma from '../../utils/prisma.js';
import {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendForbidden,
  sendBadRequest,
} from '../../utils/response.js';
import {
  createProjectSchema,
  updateProjectSchema,
  validate,
} from '../../utils/validators.js';

/**
 * Verify project ownership - returns project or sends 404/403
 */
const getOwnedProject = async (res, projectId, userId) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) {
    sendNotFound(res, 'Project not found');
    return null;
  }
  if (project.userId !== userId) {
    sendForbidden(res, 'You do not own this project');
    return null;
  }
  return project;
};

/**
 * GET /api/projects
 * Returns all projects for the authenticated user
 */
export const listProjects = async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { materials: true, analyses: true },
        },
      },
    });

    return sendSuccess(res, projects, 'Projects fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/projects
 * Creates a new project
 */
export const createProject = async (req, res, next) => {
  try {
    const { success, data, errors } = validate(createProjectSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const project = await prisma.project.create({
      data: {
        ...data,
        userId: req.user.id,
      },
    });

    return sendCreated(res, project, 'Project created');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/projects/:id
 * Returns full project details including materials and last analysis
 */
export const getProject = async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        materials: {
          orderBy: { createdAt: 'asc' },
          include: { preset: true },
        },
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { materials: true, analyses: true },
        },
      },
    });

    if (!project) return sendNotFound(res, 'Project not found');
    if (project.userId !== req.user.id) return sendForbidden(res);

    return sendSuccess(res, project, 'Project fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/projects/:id
 * Updates project fields
 */
export const updateProject = async (req, res, next) => {
  try {
    const owned = await getOwnedProject(res, req.params.id, req.user.id);
    if (!owned) return;

    const { success, data, errors } = validate(updateProjectSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data,
    });

    return sendSuccess(res, updated, 'Project updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/projects/:id
 * Deletes project and all related data (cascade)
 */
export const deleteProject = async (req, res, next) => {
  try {
    const owned = await getOwnedProject(res, req.params.id, req.user.id);
    if (!owned) return;

    await prisma.project.delete({ where: { id: req.params.id } });

    return sendSuccess(res, null, 'Project deleted');
  } catch (err) {
    next(err);
  }
};
