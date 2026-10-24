import type { NextFunction, Request, Response } from 'express';
import * as catalogService from '../services/catalogService.js';
import { badRequest } from '../utils/errors.js';

type CategoryBody = { name: string; description?: string; isActive?: boolean };
type BrandBody = { name: string; isActive?: boolean };

export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.listAdminProducts(
      req.validatedQuery as Parameters<typeof catalogService.listAdminProducts>[0],
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.getAdminProduct(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.createCategory(req.validatedBody as CategoryBody);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.updateCategory(
      req.params.id,
      req.validatedBody as Partial<CategoryBody>,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.deleteCategory(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createBrand(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.createBrand(req.validatedBody as BrandBody);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateBrand(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.updateBrand(
      req.params.id,
      req.validatedBody as Partial<BrandBody>,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteBrand(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.deleteBrand(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.createProduct(
      req.validatedBody as catalogService.ProductInputData,
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.updateProduct(
      req.params.id,
      req.validatedBody as catalogService.ProductInputData,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await catalogService.deactivateProduct(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function uploadProductImages(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('Chưa chọn ảnh nào để tải lên', 'NO_FILES');
    const data = await catalogService.uploadProductImages(req.params.id, files);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
