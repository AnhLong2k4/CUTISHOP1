import type { NextFunction, Request, Response } from 'express';
import * as orderService from '../services/orderService.js';
import { badRequest } from '../utils/errors.js';

function userId(req: Request): string {
  return req.user!.id;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function idempotencyKey(req: Request, bodyKey?: string): string {
  const header = req.headers['idempotency-key'];
  const key = (Array.isArray(header) ? header[0] : header) ?? bodyKey;
  if (!key || !UUID_V4.test(key)) {
    throw badRequest(
      'Idempotency-Key (UUID v4) là bắt buộc khi tạo đơn, qua header Idempotency-Key hoặc field idempotencyKey',
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  }
  return key;
}

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.validatedBody as {
      items: Array<{ productId: string; sku: string; quantity: number }>;
      shippingAddress: { name: string; phone: string; address: string; note?: string };
      couponCode?: string;
      idempotencyKey?: string;
    };
    const result = await orderService.createOrder(userId(req), {
      items: body.items,
      shippingAddress: body.shippingAddress,
      couponCode: body.couponCode ?? null,
      idempotencyKey: idempotencyKey(req, body.idempotencyKey),
    });
    res.status(result.created ? 201 : 200).json({ success: true, data: result.order });
  } catch (error) {
    next(error);
  }
}

export async function listMyOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.validatedQuery as { page?: number; limit?: number; status?: string };
    res.json({ success: true, data: await orderService.listMyOrders(userId(req), query) });
  } catch (error) {
    next(error);
  }
}

export async function getMyOrder(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await orderService.getMyOrder(userId(req), req.params.id) });
  } catch (error) {
    next(error);
  }
}

export async function cancelMyOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.validatedBody ?? {}) as { reason?: string };
    res.json({
      success: true,
      data: await orderService.cancelMyOrder(userId(req), req.params.id, body.reason),
    });
  } catch (error) {
    next(error);
  }
}

export async function completeMyOrder(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      data: await orderService.completeMyOrder(userId(req), req.params.id),
    });
  } catch (error) {
    next(error);
  }
}

export async function requestReturnMyOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = (req.validatedBody ?? {}) as { reason?: string };
    res.json({
      success: true,
      data: await orderService.requestReturnMyOrder(userId(req), req.params.id, body.reason),
    });
  } catch (error) {
    next(error);
  }
}
