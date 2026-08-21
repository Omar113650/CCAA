import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  listMaterials,
  createMaterial,
  getMaterial,
  updateMaterial,
  deleteMaterial,
} from './materials.controller.js';

// mergeParams: true allows access to :projectId from parent router
const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', listMaterials);
router.post('/', createMaterial);
router.get('/:id', getMaterial);
router.patch('/:id', updateMaterial);
router.delete('/:id', deleteMaterial);

export default router;
