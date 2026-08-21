import { Router } from 'express';
import { authenticate, optionalAuth } from '../../middleware/auth.middleware.js';
import {
  listListings,
  getMyListings,
  getListing,
  createListing,
  updateListing,
  deleteListing,
} from './marketplace.controller.js';

const router = Router();

// Public routes (no auth needed for browsing)
router.get('/', optionalAuth, listListings);
router.get('/:id', optionalAuth, getListing);

// Protected routes
router.get('/my/listings', authenticate, getMyListings);
router.post('/', authenticate, createListing);
router.patch('/:id', authenticate, updateListing);
router.delete('/:id', authenticate, deleteListing);

export default router;
