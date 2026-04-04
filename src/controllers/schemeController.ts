import { Request, Response } from 'express';
import * as schemeService from '../services/schemeService';
import logger from '../utils/logger';

/**
 * GET /api/schemes
 * List schemes with optional filters: state, category, crop, issueType
 */
export async function listSchemes(req: Request, res: Response): Promise<void> {
  try {
    const state = req.query.state as string | undefined;
    const category = req.query.category as string | undefined;
    const crop = req.query.crop as string | undefined;
    const issueType = req.query.issueType as string | undefined;

    const schemes = await schemeService.listSchemes({ state, category, crop, issueType });
    res.json({ success: true, data: schemes, message: `Found ${schemes.length} schemes` });
  } catch (error) {
    logger.error('listSchemes controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to fetch schemes' });
  }
}

/**
 * GET /api/schemes/recommend
 * Smart recommendation based on farmer's issue context.
 * Query params: state, crop, issue (disease/loss/equipment/irrigation/organic)
 */
export async function recommendSchemes(req: Request, res: Response): Promise<void> {
  try {
    const state = req.query.state as string | undefined;
    const crop = req.query.crop as string | undefined;
    const issue = req.query.issue as string | undefined;

    const schemes = await schemeService.getRelevantSchemes(state, crop, issue);
    res.json({
      success: true,
      data: schemes,
      message: `Found ${schemes.length} recommended schemes`,
    });
  } catch (error) {
    logger.error('recommendSchemes controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to get scheme recommendations' });
  }
}

/**
 * GET /api/schemes/search
 * Full-text search across scheme names and descriptions.
 * Query params: q (required), language (optional)
 */
export async function searchSchemes(req: Request, res: Response): Promise<void> {
  try {
    const query = req.query.q as string;
    const language = req.query.language as string | undefined;

    const schemes = await schemeService.searchSchemes(query, language);
    res.json({ success: true, data: schemes, message: `Found ${schemes.length} schemes` });
  } catch (error) {
    logger.error('searchSchemes controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to search schemes' });
  }
}

/**
 * GET /api/schemes/:id
 * Get a single scheme by ID.
 */
export async function getScheme(req: Request, res: Response): Promise<void> {
  try {
    const scheme = await schemeService.getSchemeById(req.params.id as string);
    if (!scheme) {
      res.status(404).json({ success: false, message: 'Scheme not found' });
      return;
    }
    res.json({ success: true, data: scheme });
  } catch (error) {
    logger.error('getScheme controller error', {
      error: error instanceof Error ? error.message : String(error),
      schemeId: req.params.id as string,
    });
    res.status(500).json({ success: false, message: 'Failed to fetch scheme' });
  }
}

/**
 * POST /api/schemes (admin only)
 * Create a new scheme.
 */
export async function createScheme(req: Request, res: Response): Promise<void> {
  try {
    const scheme = await schemeService.createScheme(req.body);
    res.status(201).json({ success: true, data: scheme, message: 'Scheme created' });
  } catch (error) {
    logger.error('createScheme controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ success: false, message: 'Failed to create scheme' });
  }
}

/**
 * PATCH /api/schemes/:id (admin only)
 * Update an existing scheme.
 */
export async function updateScheme(req: Request, res: Response): Promise<void> {
  try {
    const scheme = await schemeService.updateScheme(req.params.id as string, req.body);
    if (!scheme) {
      res.status(404).json({ success: false, message: 'Scheme not found' });
      return;
    }
    res.json({ success: true, data: scheme, message: 'Scheme updated' });
  } catch (error) {
    logger.error('updateScheme controller error', {
      error: error instanceof Error ? error.message : String(error),
      schemeId: req.params.id as string,
    });
    res.status(500).json({ success: false, message: 'Failed to update scheme' });
  }
}

/**
 * DELETE /api/schemes/:id (admin only)
 * Soft-delete (deactivate) a scheme.
 */
export async function deleteScheme(req: Request, res: Response): Promise<void> {
  try {
    const scheme = await schemeService.deactivateScheme(req.params.id as string);
    if (!scheme) {
      res.status(404).json({ success: false, message: 'Scheme not found' });
      return;
    }
    res.json({ success: true, data: scheme, message: 'Scheme deactivated' });
  } catch (error) {
    logger.error('deleteScheme controller error', {
      error: error instanceof Error ? error.message : String(error),
      schemeId: req.params.id as string,
    });
    res.status(500).json({ success: false, message: 'Failed to deactivate scheme' });
  }
}
