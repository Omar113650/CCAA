import prisma from '../../utils/prisma.js';
import {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendForbidden,
  sendBadRequest,
} from '../../utils/response.js';
import { runProjectAnalysis } from './analysis.engine.js';

/**
 * POST /api/projects/:projectId/analyse
 * Runs the full analysis engine on all project materials
 * Saves result to DB and updates material records
 */
export const runAnalysis = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    // Fetch project with all materials
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        materials: {
          include: { preset: true },
        },
      },
    });

    if (!project) return sendNotFound(res, 'Project not found');
    if (project.userId !== req.user.id) return sendForbidden(res);

    if (!project.materials || project.materials.length === 0) {
      return sendBadRequest(res, 'Project has no materials to analyze. Add materials first.');
    }

    // Update project status to "analyzing"
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'analyzing' },
    });

    // Run analysis engine
    const analysisResult = await runProjectAnalysis(project);

    // Persist analysis result
    const analysis = await prisma.analysis.create({
      data: {
        projectId,
        demolitionStrategy: analysisResult.demolitionStrategy,
        financialReport: analysisResult.financialReport,
        environmentalReport: analysisResult.environmentalReport,
      },
    });

    // Update each material with its computed scores
    await Promise.all(
      analysisResult.materialResults.map((result) =>
        prisma.material.update({
          where: { id: result.materialId },
          data: {
            reusabilityScore: result.reusabilityScore,
            estimatedValue: result.estimatedValue,
            recommendedPath: result.recommendedPath,
            isGated: result.isGated,
            gatingReason: result.gatingReason,
          },
        })
      )
    );

    // Update project status to "completed"
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'completed' },
    });

    return sendCreated(
      res,
      {
        analysisId: analysis.id,
        ...analysisResult,
      },
      'Analysis completed successfully'
    );
  } catch (err) {
    // Reset status on failure
    try {
      await prisma.project.update({
        where: { id: req.params.projectId },
        data: { status: 'draft' },
      });
    } catch (_) {}
    next(err);
  }
};

/**
 * GET /api/projects/:projectId/analyses
 * Returns all analyses for a project (history)
 */
export const listAnalyses = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return sendNotFound(res, 'Project not found');
    if (project.userId !== req.user.id) return sendForbidden(res);

    const analyses = await prisma.analysis.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return sendSuccess(res, analyses, 'Analyses fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/projects/:projectId/analyses/:id
 * Returns a specific analysis
 */
export const getAnalysis = async (req, res, next) => {
  try {
    const { projectId, id } = req.params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return sendNotFound(res, 'Project not found');
    if (project.userId !== req.user.id) return sendForbidden(res);

    const analysis = await prisma.analysis.findFirst({
      where: { id, projectId },
    });

    if (!analysis) return sendNotFound(res, 'Analysis not found');

    return sendSuccess(res, analysis, 'Analysis fetched');
  } catch (err) {
    next(err);
  }
};
