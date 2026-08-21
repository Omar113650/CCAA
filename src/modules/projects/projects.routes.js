import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
} from './projects.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id', getProject);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
