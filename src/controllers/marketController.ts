import { Request, Response } from 'express';
import * as dataGovService from '../services/dataGovService';
import logger from '../utils/logger';

/**
 * GET /markets/prices?commodity=Rice&state=Punjab&market=Ludhiana
 */
export async function getMandiPrices(req: Request, res: Response): Promise<void> {
  try {
    const commodity = req.query.commodity as string | undefined;
    const state = req.query.state as string | undefined;
    const market = req.query.market as string | undefined;

    const prices = await dataGovService.getMandiPrices(commodity, state, market);
    res.json({ success: true, data: prices, message: `Found ${prices.length} price records` });
  } catch (error) {
    logger.error('getMandiPrices controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      message: 'Failed to fetch mandi prices from data.gov.in',
    });
  }
}

/**
 * GET /markets/production?state=Punjab&crop=Rice&year=2024-25
 */
export async function getCropProduction(req: Request, res: Response): Promise<void> {
  try {
    const state = req.query.state as string | undefined;
    const crop = req.query.crop as string | undefined;
    const year = req.query.year as string | undefined;

    const records = await dataGovService.getCropProduction(state, crop, year);
    res.json({ success: true, data: records, message: `Found ${records.length} production records` });
  } catch (error) {
    logger.error('getCropProduction controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      message: 'Failed to fetch crop production data from data.gov.in',
    });
  }
}

/**
 * GET /markets/search?q=Ludhiana
 */
export async function searchMarkets(req: Request, res: Response): Promise<void> {
  try {
    const query = req.query.q as string;
    const markets = await dataGovService.searchMarkets(query);
    res.json({ success: true, data: markets, message: `Found ${markets.length} markets` });
  } catch (error) {
    logger.error('searchMarkets controller error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(502).json({
      success: false,
      message: 'Failed to search markets from data.gov.in',
    });
  }
}
