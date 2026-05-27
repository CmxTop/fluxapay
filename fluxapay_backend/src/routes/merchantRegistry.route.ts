import { Router } from "express";
import { adminAuth } from "../middleware/adminAuth.middleware";
import {
  listMerchantsPaginated,
  updateCurrencyMappings,
  getCurrencyMappings,
} from "../controllers/merchantRegistry.controller";

const router = Router();

// All registry routes require admin authentication
router.use(adminAuth);

/**
 * @swagger
 * /api/v1/admin/registry/merchants:
 *   get:
 *     summary: List merchants from registry with pagination (Admin only)
 *     description: |
 *       Issue #213: Optimizing Registry Listing Pagination
 *       Returns fixed page sizes to avoid ledger limits on large registry scans.
 *     tags: [Admin - Registry]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: page_size
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated merchant list
 *       401:
 *         description: Unauthorized
 */
router.get("/merchants", listMerchantsPaginated);

/**
 * @swagger
 * /api/v1/admin/registry/merchants/{merchantId}/currency-mappings:
 *   get:
 *     summary: Get currency mappings for a merchant (Admin only)
 *     description: |
 *       Issue #216: Multi-Currency Registry Mapping
 *       Retrieves all payout addresses mapped to different currencies.
 *     tags: [Admin - Registry]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Currency mappings retrieved
 *       401:
 *         description: Unauthorized
 */
router.get("/merchants/:merchantId/currency-mappings", getCurrencyMappings);

/**
 * @swagger
 * /api/v1/admin/registry/merchants/{merchantId}/currency-mappings:
 *   post:
 *     summary: Update currency mappings for a merchant (Admin only)
 *     description: |
 *       Issue #216: Multi-Currency Registry Mapping
 *       Links multiple payout addresses for diverse currencies.
 *     tags: [Admin - Registry]
 *     security:
 *       - adminSecret: []
 *     parameters:
 *       - in: path
 *         name: merchantId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mappings
 *             properties:
 *               mappings:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *                 example:
 *                   USD: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
 *                   EUR: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
 *                   GBP: "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
 *     responses:
 *       200:
 *         description: Currency mappings updated
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
router.post("/merchants/:merchantId/currency-mappings", updateCurrencyMappings);

export default router;
