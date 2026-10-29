import { Router } from 'express';
import * as checkoutController from '../controllers/checkoutController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  cartItemSchema,
  cartRemoveSchema,
  cartUpdateSchema,
  quoteSchema,
} from './schemas.js';

const router = Router();
router.use(requireAuth);

router.get('/cart', checkoutController.getCart);
router.post('/cart/items', validateBody(cartItemSchema), checkoutController.addCartItem);
router.patch('/cart/items', validateBody(cartUpdateSchema), checkoutController.updateCartItem);
router.delete('/cart/items', validateBody(cartRemoveSchema), checkoutController.removeCartItem);
router.delete('/cart', checkoutController.clearCart);
router.post('/checkout/quote', validateBody(quoteSchema), checkoutController.quote);

export default router;
