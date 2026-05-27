import { Request, Response } from "express";
import { merchantRegistryService } from "../services/merchantRegistry.service";

/**
 * #213: Get paginated list of merchants from registry
 * GET /api/v1/admin/registry/merchants
 */
export async function listMerchantsPaginated(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 50;

    const result = await merchantRegistryService.listMerchantsPaginated(page, pageSize);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error listing merchants:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "REGISTRY_ERROR",
        message: "Failed to fetch merchant list from registry",
      },
    });
  }
}

/**
 * #216: Update currency mappings for a merchant
 * POST /api/v1/admin/registry/merchants/:merchantId/currency-mappings
 */
export async function updateCurrencyMappings(req: Request, res: Response) {
  try {
    const { merchantId } = req.params;
    const { mappings } = req.body;

    if (!mappings || typeof mappings !== "object") {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "mappings object is required",
        },
      });
    }

    const success = await merchantRegistryService.updateCurrencyMappings(
      merchantId,
      mappings,
    );

    return res.status(200).json({
      success: true,
      message: "Currency mappings updated successfully",
      data: { merchantId, updated: success },
    });
  } catch (error: any) {
    console.error("Error updating currency mappings:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "REGISTRY_ERROR",
        message: "Failed to update currency mappings",
      },
    });
  }
}

/**
 * #216: Get currency mappings for a merchant
 * GET /api/v1/admin/registry/merchants/:merchantId/currency-mappings
 */
export async function getCurrencyMappings(req: Request, res: Response) {
  try {
    const { merchantId } = req.params;

    const mappings = await merchantRegistryService.getCurrencyMappings(merchantId);

    return res.status(200).json({
      success: true,
      data: {
        merchantId,
        mappings,
      },
    });
  } catch (error: any) {
    console.error("Error fetching currency mappings:", error);
    return res.status(500).json({
      success: false,
      error: {
        code: "REGISTRY_ERROR",
        message: "Failed to fetch currency mappings",
      },
    });
  }
}
