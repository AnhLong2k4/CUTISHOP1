import { Router } from 'express';
import * as adminOrderController from '../controllers/adminOrderController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { adminOrderStatusSchema, orderQuerySchema } from './schemas.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/orders', validateQuery(orderQuerySchema), adminOrderController.listOrders);
router.get('/orders/:id', adminOrderController.getOrder);
router.patch(
  '/orders/:id/status',
  validateBody(adminOrderStatusSchema),
  adminOrderController.updateOrderStatus,
);

export default router;
