import { Router } from 'express';
import * as catalogController from '../controllers/catalogController.js';
import { validateQuery } from '../middleware/validate.js';
import { productQuerySchema } from './schemas.js';

const router = Router();

router.get('/products', validateQuery(productQuerySchema), catalogController.listProducts);
router.get('/products/:id', catalogController.getProduct);
router.get('/categories', catalogController.listCategories);
router.get('/brands', catalogController.listBrands);

export default router;
