import { Router } from 'express';
import * as orderController from '../controllers/orderController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  orderCreateSchema,
  orderQuerySchema,
  orderReasonSchema,
} from './schemas.js';

const router = Router();
router.use(requireAuth);

router.post('/orders', validateBody(orderCreateSchema), orderController.createOrder);
router.get('/orders/my', validateQuery(orderQuerySchema), orderController.listMyOrders);
router.get('/orders/:id', orderController.getMyOrder);
router.post('/orders/:id/cancel', validateBody(orderReasonSchema), orderController.cancelMyOrder);
router.post('/orders/:id/complete', orderController.completeMyOrder);
router.post(
  '/orders/:id/return-request',
  validateBody(orderReasonSchema),
  orderController.requestReturnMyOrder,
);

export default router;
