import { z } from 'zod';

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  company: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  role: z.enum(['individual', 'developer', 'consultant', 'contractor']).optional(),
});

export const registerUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2).max(100),
  role: z.enum(['individual', 'developer', 'consultant', 'contractor']).optional(),
  company: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
});

export const loginUserSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const createProjectSchema = z.object({
  name: z.string().min(2).max(200),
  location: z.string().max(300).optional(),
  areaM2: z.number().positive().optional(),
  constructionYear: z.number().int().min(1800).max(2030).optional(),
  structureType: z.enum(['residential', 'commercial', 'industrial']).optional(),
  hasHazardousMaterials: z.boolean().optional(),
  nearGroundwaterOrUnstableSoil: z.boolean().optional(),
  distanceToNeighbors: z.string().optional(),
  isDensePollutionSensitiveArea: z.boolean().optional(),
  estimatedDemolitionCostPerM2: z.number().positive().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export const criteriaSchema = z.object({
  score: z.number().min(0).max(10).optional(),
  notes: z.string().optional(),
}).optional();

export const createMaterialSchema = z.object({
  presetId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(50),
  notes: z.string().optional(),
  technicalFeasibility: criteriaSchema,
  environmentalPerformance: criteriaSchema,
  economicViability: criteriaSchema,
  safetyContamination: criteriaSchema,
  timeLogistics: criteriaSchema,
  marketPolicy: criteriaSchema,
  overrides: z.record(z.any()).optional(),
});

export const updateMaterialSchema = createMaterialSchema.partial();

export const createListingSchema = z.object({
  materialId: z.string().uuid(),
  quantityAvailable: z.number().positive(),
  price: z.number().min(0).optional(),
  location: z.string().max(300).optional(),
  images: z.array(z.string().url()).optional(),
});

export const updateListingSchema = z.object({
  quantityAvailable: z.number().positive().optional(),
  price: z.number().min(0).optional(),
  location: z.string().max(300).optional(),
  status: z.enum(['available', 'reserved', 'sold']).optional(),
  images: z.array(z.string().url()).optional(),
});

export const listingFiltersSchema = z.object({
  category: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(['available', 'reserved', 'sold']).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const createContactRequestSchema = z.object({
  listingId: z.string().uuid(),
  message: z.string().max(1000).optional(),
});

export const updateContactRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
});

export const validate = (schema, data) => {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  const errors = result.error.errors.map((e) => ({
    field: e.path.join('.'),
    message: e.message,
  }));
  return { success: false, data: null, errors };
};
