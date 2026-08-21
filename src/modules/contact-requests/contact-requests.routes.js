import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  createContactRequest,
  getReceivedRequests,
  getSentRequests,
  updateContactRequest,
} from './contact-requests.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', createContactRequest);
router.get('/received', getReceivedRequests);
router.get('/sent', getSentRequests);
router.patch('/:id', updateContactRequest);

export default router;
