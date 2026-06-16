import { Router } from 'express';
import { serve } from 'inngest/express';
import { inngest } from '../lib/inngest';
import { runScheduledPayroll } from '../services/inngestPayroll';
import { createLogger } from '../utils/logger';

const logger = createLogger('InngestRoute');
logger.info('Inngest route mounted', { hasEventKey: !!process.env.INNGEST_EVENT_KEY, baseUrl: process.env.INNGEST_BASE_URL || '(default)' });

const router = Router();

router.use(
  '/',
  serve({
    client: inngest,
    functions: [runScheduledPayroll],
  })
);

export default router;
