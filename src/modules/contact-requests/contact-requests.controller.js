import prisma from '../../utils/prisma.js';
import {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendForbidden,
  sendBadRequest,
} from '../../utils/response.js';
import {
  createContactRequestSchema,
  updateContactRequestSchema,
  validate,
} from '../../utils/validators.js';

/**
 * POST /api/contact-requests
 * Buyer sends a contact request to a listing owner
 */
export const createContactRequest = async (req, res, next) => {
  try {
    const { success, data, errors } = validate(createContactRequestSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const { listingId, message } = data;

    // Verify listing exists and is available
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: listingId },
      include: { user: true },
    });

    if (!listing) return sendNotFound(res, 'Listing not found');
    if (listing.status !== 'available') {
      return sendBadRequest(res, 'This listing is no longer available');
    }

    // Can't contact yourself
    if (listing.userId === req.user.id) {
      return sendBadRequest(res, 'You cannot contact your own listing');
    }

    // Check for duplicate pending request
    const existing = await prisma.contactRequest.findFirst({
      where: {
        listingId,
        requesterId: req.user.id,
        status: 'pending',
      },
    });

    if (existing) {
      return sendBadRequest(res, 'You already have a pending request for this listing');
    }

    const contactRequest = await prisma.contactRequest.create({
      data: {
        listingId,
        requesterId: req.user.id,
        message,
      },
      include: {
        listing: {
          select: {
            id: true,
            material: { select: { name: true, category: true } },
            user: { select: { name: true, company: true } },
          },
        },
        requester: {
          select: { id: true, name: true, company: true },
        },
      },
    });

    return sendCreated(res, contactRequest, 'Contact request sent');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/contact-requests/received
 * Returns requests received by the authenticated user (on their listings)
 */
export const getReceivedRequests = async (req, res, next) => {
  try {
    const requests = await prisma.contactRequest.findMany({
      where: {
        listing: { userId: req.user.id },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            quantityAvailable: true,
            price: true,
            material: { select: { name: true, category: true } },
          },
        },
        requester: {
          select: { id: true, name: true, company: true, location: true, email: true },
        },
      },
    });

    return sendSuccess(res, requests, 'Received requests fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/contact-requests/sent
 * Returns requests sent by the authenticated user
 */
export const getSentRequests = async (req, res, next) => {
  try {
    const requests = await prisma.contactRequest.findMany({
      where: { requesterId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        listing: {
          select: {
            id: true,
            quantityAvailable: true,
            price: true,
            status: true,
            material: { select: { name: true, category: true } },
            user: { select: { name: true, company: true, email: true } },
          },
        },
      },
    });

    return sendSuccess(res, requests, 'Sent requests fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/contact-requests/:id
 * Listing owner accepts or rejects a contact request
 */
export const updateContactRequest = async (req, res, next) => {
  try {
    const { success, data, errors } = validate(updateContactRequestSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const request = await prisma.contactRequest.findUnique({
      where: { id: req.params.id },
      include: { listing: true },
    });

    if (!request) return sendNotFound(res, 'Contact request not found');

    // Only the listing owner can accept/reject
    if (request.listing.userId !== req.user.id) {
      return sendForbidden(res, 'Only the listing owner can respond to requests');
    }

    if (request.status !== 'pending') {
      return sendBadRequest(res, `Request already ${request.status}`);
    }

    const updated = await prisma.contactRequest.update({
      where: { id: req.params.id },
      data: { status: data.status },
      include: {
        requester: { select: { name: true, email: true } },
        listing: {
          select: {
            material: { select: { name: true } },
          },
        },
      },
    });

    const message = data.status === 'accepted'
      ? 'Request accepted — contact details now visible'
      : 'Request rejected';

    return sendSuccess(res, updated, message);
  } catch (err) {
    next(err);
  }
};
