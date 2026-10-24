import { Router } from 'express';
import * as authController from '../controllers/authController.js';
import { requireAuth, requireCustomHeader } from '../middleware/auth.js';
import {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
} from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas.js';

const router = Router();

router.post('/register', registerLimiter, validateBody(registerSchema), authController.register);
router.post('/login', loginLimiter, validateBody(loginSchema), authController.login);
router.post('/refresh', requireCustomHeader, authController.refresh);
router.post('/logout', requireCustomHeader, authController.logout);
router.get('/me', requireAuth, authController.me);
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validateBody(forgotPasswordSchema),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  authController.resetPassword,
);

export default router;
