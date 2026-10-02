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
  evaluateMaterial,
  calculateMaterialValue,
} from './materials.controller.js';


const uploadImage = multer({ limits: { fileSize: 5 * 1024 * 1024 } }).single('image');


const router = Router({ mergeParams: true });

router.use(authenticate);

router.get('/', listMaterials);
router.post('/', createMaterial);
router.post('/upload', uploadBOQMiddleware, uploadBOQ);
router.post('/:id/assess', uploadImage, assessMaterialAI);
router.post('/:id/evaluate', evaluateMaterial);
router.post('/:id/calculate-value', calculateMaterialValue);
router.get('/:id', getMaterial);
router.patch('/:id', updateMaterial);
router.delete('/:id', deleteMaterial);

export default router;
