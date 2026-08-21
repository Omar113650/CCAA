import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { runAnalysis, listAnalyses, getAnalysis } from './analyses.controller.js';

const router = Router({ mergeParams: true });

router.use(authenticate);

router.post('/', runAnalysis);
router.get('/', listAnalyses);
router.get('/:id', getAnalysis);

export default router;
