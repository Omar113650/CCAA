import { Router } from 'express';
import prisma from '../../utils/prisma.js';
import { sendSuccess } from '../../utils/response.js';

const router = Router();

/**
 * GET /api/presets
 * Public — returns all material presets for the frontend form
 */
router.get('/', async (req, res, next) => {
  try {
    const presets = await prisma.preset.findMany({
      orderBy: [{ category: 'asc' }, { nameAr: 'asc' }],
    });

    // Group by category for easier frontend consumption
    const grouped = presets.reduce((acc, preset) => {
      if (!acc[preset.category]) acc[preset.category] = [];
      acc[preset.category].push(preset);
      return acc;
    }, {});

    return sendSuccess(res, { presets, grouped }, 'Presets fetched');
  } catch (err) {
    next(err);
  }
});

export default router;
