import { Router } from 'express';
import * as adminController from '../controllers/adminCatalogController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { uploadProductImages } from '../middleware/upload.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  brandInputSchema,
  brandPatchSchema,
  categoryInputSchema,
  categoryPatchSchema,
  productInputSchema,
  productQuerySchema,
} from './schemas.js';

const router = Router();

// Every admin endpoint requires a valid access token AND the admin role,
// enforced here on the server — never only by hiding UI.
router.use(requireAuth, requireAdmin);

router.get('/products', validateQuery(productQuerySchema), adminController.listProducts);
router.get('/products/:id', adminController.getProduct);
router.post('/products', validateBody(productInputSchema), adminController.createProduct);
router.patch('/products/:id', validateBody(productInputSchema), adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);
router.put(
  '/products/:id/images',
  uploadProductImages.array('images', 10),
  adminController.uploadProductImages,
);

router.post('/categories', validateBody(categoryInputSchema), adminController.createCategory);
router.patch('/categories/:id', validateBody(categoryPatchSchema), adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

router.post('/brands', validateBody(brandInputSchema), adminController.createBrand);
router.patch('/brands/:id', validateBody(brandPatchSchema), adminController.updateBrand);
router.delete('/brands/:id', adminController.deleteBrand);

export default router;
