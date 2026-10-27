import { Router } from 'express';
import * as adminCouponController from '../controllers/adminCouponController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { couponInputSchema, couponPatchSchema, orderQuerySchema } from './schemas.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.post('/coupons', validateBody(couponInputSchema), adminCouponController.createCoupon);
router.get('/coupons', validateQuery(orderQuerySchema), adminCouponController.listCoupons);
router.get('/coupons/:id', adminCouponController.getCoupon);
router.patch('/coupons/:id', validateBody(couponPatchSchema), adminCouponController.updateCoupon);
router.delete('/coupons/:id', adminCouponController.deleteCoupon);

export default router;
