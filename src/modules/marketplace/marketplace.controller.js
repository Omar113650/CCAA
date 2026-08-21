import prisma from '../../utils/prisma.js';
import {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendForbidden,
  sendBadRequest,
} from '../../utils/response.js';
import {
  createListingSchema,
  updateListingSchema,
  listingFiltersSchema,
  validate,
} from '../../utils/validators.js';

/**
 * GET /api/marketplace
 * Public listing with filtering and pagination
 */
export const listListings = async (req, res, next) => {
  try {
    const { success, data: filters, errors } = validate(listingFiltersSchema, req.query);
    if (!success) return sendBadRequest(res, 'Invalid filters', errors);

    const { category, location, status, minPrice, maxPrice, page, limit } = filters;

    const where = {};

    if (status) where.status = status;
    else where.status = 'available'; // default to available

    if (location) where.location = { contains: location, mode: 'insensitive' };

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (category) {
      where.material = { category: { contains: category, mode: 'insensitive' } };
    }

    const [listings, total] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          material: {
            select: {
              id: true,
              name: true,
              category: true,
              unit: true,
              reusabilityScore: true,
              recommendedPath: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              company: true,
              location: true,
            },
          },
          _count: { select: { contactRequests: true } },
        },
      }),
      prisma.marketplaceListing.count({ where }),
    ]);

    return sendSuccess(res, {
      listings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }, 'Listings fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/marketplace/my
 * Returns listings belonging to the authenticated user
 */
export const getMyListings = async (req, res, next) => {
  try {
    const listings = await prisma.marketplaceListing.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        material: {
          select: {
            id: true,
            name: true,
            category: true,
            unit: true,
            reusabilityScore: true,
          },
        },
        _count: { select: { contactRequests: true } },
      },
    });

    return sendSuccess(res, listings, 'My listings fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/marketplace/:id
 */
export const getListing = async (req, res, next) => {
  try {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: req.params.id },
      include: {
        material: {
          include: { preset: true },
        },
        user: {
          select: {
            id: true,
            name: true,
            company: true,
            location: true,
          },
        },
        _count: { select: { contactRequests: true } },
      },
    });

    if (!listing) return sendNotFound(res, 'Listing not found');

    return sendSuccess(res, listing, 'Listing fetched');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/marketplace
 * Creates a new listing (material must belong to the user's project)
 */
export const createListing = async (req, res, next) => {
  try {
    const { success, data, errors } = validate(createListingSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    // Verify the material belongs to a project owned by this user
    const material = await prisma.material.findUnique({
      where: { id: data.materialId },
      include: { project: true },
    });

    if (!material) return sendNotFound(res, 'Material not found');
    if (material.project.userId !== req.user.id) {
      return sendForbidden(res, 'You do not own this material');
    }

    // Check if material already has an active listing
    const existingListing = await prisma.marketplaceListing.findFirst({
      where: {
        materialId: data.materialId,
        status: { in: ['available', 'reserved'] },
      },
    });

    if (existingListing) {
      return sendBadRequest(res, 'This material already has an active listing');
    }

    const listing = await prisma.marketplaceListing.create({
      data: {
        ...data,
        images: data.images || [],
        userId: req.user.id,
        location: data.location || material.project.location,
      },
      include: {
        material: { select: { id: true, name: true, category: true, unit: true } },
      },
    });

    return sendCreated(res, listing, 'Listing created');
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/marketplace/:id
 */
export const updateListing = async (req, res, next) => {
  try {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: req.params.id },
    });

    if (!listing) return sendNotFound(res, 'Listing not found');
    if (listing.userId !== req.user.id) return sendForbidden(res);

    const { success, data, errors } = validate(updateListingSchema, req.body);
    if (!success) return sendBadRequest(res, 'Validation failed', errors);

    const updated = await prisma.marketplaceListing.update({
      where: { id: req.params.id },
      data,
    });

    return sendSuccess(res, updated, 'Listing updated');
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/marketplace/:id
 */
export const deleteListing = async (req, res, next) => {
  try {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { id: req.params.id },
    });

    if (!listing) return sendNotFound(res, 'Listing not found');
    if (listing.userId !== req.user.id) return sendForbidden(res);

    await prisma.marketplaceListing.delete({ where: { id: req.params.id } });

    return sendSuccess(res, null, 'Listing deleted');
  } catch (err) {
    next(err);
  }
};
