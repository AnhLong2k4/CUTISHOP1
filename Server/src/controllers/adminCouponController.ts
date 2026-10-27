import type { NextFunction, Request, Response } from 'express';
import * as couponAdminService from '../services/couponAdminService.js';

export async function createCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await couponAdminService.createCoupon(req.validatedBody as never);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listCoupons(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.validatedQuery as { page?: number; limit?: number };
    res.json({ success: true, data: await couponAdminService.listCoupons(query) });
  } catch (error) {
    next(error);
  }
}

export async function getCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await couponAdminService.getCoupon(req.params.id) });
  } catch (error) {
    next(error);
  }
}

export async function updateCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await couponAdminService.updateCoupon(req.params.id, req.validatedBody as never);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteCoupon(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await couponAdminService.deleteCoupon(req.params.id) });
  } catch (error) {
    next(error);
  }
}
