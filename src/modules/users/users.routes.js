import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { getMe, updateMe, register, login } from './users.controller.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);

export default router;
