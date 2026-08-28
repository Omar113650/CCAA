import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { uploadBOQMiddleware } from '../../middleware/upload.js';
import multer from 'multer';
import {
  listMaterials,
  createMaterial,
  getMaterial,
  updateMaterial,
  deleteMaterial,
  uploadBOQ,
  assessMaterialAI,
  evaluateMaterial
} from './materials.controller.js';

// Setup basic memory upload for images
const uploadImage = multer({ limits: { fileSize: 5 * 1024 * 1024 } }).single('image');

// mergeParams: true allows access to :projectId from parent router
const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', listMaterials);
router.post('/', createMaterial);
router.post('/upload', uploadBOQMiddleware, uploadBOQ);
router.post('/:id/assess', uploadImage, assessMaterialAI);
router.post('/:id/evaluate', evaluateMaterial);
router.get('/:id', getMaterial);
router.patch('/:id', updateMaterial);
router.delete('/:id', deleteMaterial);

export default router;
