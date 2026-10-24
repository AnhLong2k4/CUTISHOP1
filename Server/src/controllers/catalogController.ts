import type { NextFunction, Request, Response } from 'express';
import * as catalogService from '../services/catalogService.js';
import type { ProductQueryInput } from '../utils/catalogQuery.js';

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.listPublicProducts(
      req.validatedQuery as ProductQueryInput,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.getPublicProduct(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listCategories(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await catalogService.listPublicCategories() });
  } catch (error) {
    next(error);
  }
}

export async function listBrands(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await catalogService.listPublicBrands() });
  } catch (error) {
    next(error);
  }
}
