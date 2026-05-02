import { Router, Request, Response } from 'express';
import { getRateSnapshot, listCurrencyMeta } from '../services/currency';
import { createLogger } from '../utils/logger';

const router = Router();
const logger = createLogger('CurrencyRoute');

router.get('/rates', async (_req: Request, res: Response) => {
  try {
    const snapshot = await getRateSnapshot();
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json({
      success: true,
      data: {
        base: snapshot.base,
        fetchedAt: snapshot.fetchedAt,
        source: snapshot.source,
        rates: snapshot.rates,
        currencies: listCurrencyMeta(),
      },
    });
  } catch (error: any) {
    logger.error('Currency rates failed', { error: error?.message });
    res.status(500).json({ success: false, error: 'Could not load FX rates' });
  }
});

export default router;
