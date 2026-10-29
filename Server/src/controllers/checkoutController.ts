import type { NextFunction, Request, Response } from 'express';
import * as cartService from '../services/cartService.js';

function userId(req: Request): string {
  return req.user!.id;
}

export async function getCart(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await cartService.getCart(userId(req)) });
  } catch (error) {
    next(error);
  }
}

export async function addCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.validatedBody as { productId: string; sku: string; quantity: number };
    res.json({ success: true, data: await cartService.addToCart(userId(req), body) });
  } catch (error) {
    next(error);
  }
}

export async function updateCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.validatedBody as { productId: string; sku: string; quantity: number };
    res.json({ success: true, data: await cartService.updateCartItem(userId(req), body) });
  } catch (error) {
    next(error);
  }
}

export async function removeCartItem(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.validatedBody as { productId: string; sku: string };
    res.json({ success: true, data: await cartService.removeCartItem(userId(req), body.productId, body.sku) });
  } catch (error) {
    next(error);
  }
}

export async function clearCart(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await cartService.clearCart(userId(req)) });
  } catch (error) {
    next(error);
  }
}

export async function quote(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.validatedBody as {
      items: Array<{ productId: string; sku: string; quantity: number }>;
      couponCode?: string;
    };
    res.json({
      success: true,
      data: await cartService.quote(body.items, body.couponCode ?? null),
    });
  } catch (error) {
    next(error);
  }
}
