import type { NextFunction, Request, Response } from 'express';
import * as orderService from '../services/orderService.js';
import type { OrderStatus } from '../utils/orderStatus.js';

function adminId(req: Request): string {
  return req.user!.id;
}

export async function listOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.validatedQuery as { page?: number; limit?: number; status?: string };
    res.json({ success: true, data: await orderService.listAdminOrders(query) });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await orderService.getAdminOrder(req.params.id) });
  } catch (error) {
    next(error);
  }
}

export async function updateOrderStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.validatedBody as { status: OrderStatus; reason?: string; restock?: boolean };
    res.json({
      success: true,
      data: await orderService.adminTransitionOrder(
        adminId(req),
        req.params.id,
        body.status,
        body.reason,
        body.restock ?? false,
      ),
    });
  } catch (error) {
    next(error);
  }
}
