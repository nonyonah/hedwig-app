import { inngest } from '../lib/inngest';
import { PayrollService } from '../services/payroll';
import { createLogger } from '../utils/logger';

const logger = createLogger('InngestPayroll');

export const runScheduledPayroll = inngest.createFunction(
  { id: 'run-scheduled-payroll' },
  { event: 'payroll/scheduled.run' },
  async ({ event, step }) => {
    const { scheduleId } = event.data as { scheduleId: string };

    logger.info('Running scheduled payroll', { scheduleId });

    await step.run('execute-payroll', async () => {
      const result = await PayrollService.executeScheduledRun(scheduleId);
      logger.info('Scheduled payroll result', { scheduleId, ...result });
      return result;
    });

    return { scheduleId };
  },
);
