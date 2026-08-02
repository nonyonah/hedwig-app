import { createLogger } from '../utils/logger';
import { buildLegacyLedgerEntries, LedgerEntry } from './ledger';
import { ensureProjection, readProjectionEntries, ProjectionScope } from './ledger-projection';

const logger = createLogger('LedgerShadowDiff');

export interface ShadowDiffReport {
  rangeStart: string;
  legacyEntries: number;
  projectionEntries: number;
  missingFromProjection: number;   // regression: legacy has it, projection lost it
  extraInProjection: number;       // new coverage (withdrawals, other income, ...)
  amountMismatches: number;
  sampleMissing: string[];
  sampleExtra: string[];
  sampleAmountDeltas: string[];
  consistent: boolean;
}

/**
 * Compares the legacy /ledger read path against the event-driven projection
 * for the same workspace + range.
 *
 * Intentional divergence: the projection surfaces on-rail events the legacy
 * path never saw (offramp withdrawals, wallet deposits, bridge settles) and
 * uses FROZEN FX from event time instead of read-time conversion — both are
 * expected "extra in projection" differences.
 *
 * Anything missing from the projection is a real bug.
 */
export async function runLedgerShadowDiff(scope: ProjectionScope, start: Date): Promise<ShadowDiffReport> {
  const report: ShadowDiffReport = {
    rangeStart: start.toISOString(),
    legacyEntries: 0,
    projectionEntries: 0,
    missingFromProjection: 0,
    extraInProjection: 0,
    amountMismatches: 0,
    sampleMissing: [],
    sampleExtra: [],
    sampleAmountDeltas: [],
    consistent: false,
  };

  try {
    const [legacyEntries, projectionRows] = await Promise.all([
      buildLegacyLedgerEntries({ userId: scope.userId, workspaceId: scope.workspaceId, start }),
      ensureProjection(scope).then(() => readProjectionEntries(scope, start)),
    ]);

    const projectionEntries: LedgerEntry[] = projectionRows.map((row) => ({
      date: row.date,
      description: row.description,
      account: row.account,
      debit: Number(row.debit) || 0,
      credit: Number(row.credit) || 0,
      type: row.type,
      referenceId: row.reference_id,
      category: row.category,
      currency: row.currency || 'USD',
    }));

    report.legacyEntries = legacyEntries.length;
    report.projectionEntries = projectionEntries.length;

    const projectionByKey = new Map<string, LedgerEntry>();
    for (const entry of projectionEntries) {
      projectionByKey.set(`${entry.type}|${entry.referenceId}`, entry);
    }

    const keyOf = (e: LedgerEntry) => `${e.type}|${e.referenceId}`;

    // Regression scan: every legacy entry must exist in the projection.
    for (const entry of legacyEntries) {
      const projected = projectionByKey.get(keyOf(entry));
      if (!projected) {
        report.missingFromProjection++;
        if (report.sampleMissing.length < 10) {
          report.sampleMissing.push(`${entry.date} ${entry.type} ${entry.referenceId} ${entry.account} $${entry.debit || entry.credit}`);
        }
        continue;
      }
      const legacyAmount = Number((entry.debit || entry.credit).toFixed(2));
      const projectedAmount = Number((projected.debit || projected.credit).toFixed(2));
      const tolerance = Math.max(0.01, Math.abs(legacyAmount) * 0.01);
      if (Math.abs(legacyAmount - projectedAmount) > tolerance) {
        report.amountMismatches++;
        if (report.sampleAmountDeltas.length < 10) {
          report.sampleAmountDeltas.push(
            `${entry.date} ${entry.type} ${entry.referenceId}: legacy $${legacyAmount} vs projection $${projectedAmount}`
          );
        }
      }
    }

    // Coverage scan: projection entries that the legacy path can't produce.
    const legacyKeys = new Set(legacyEntries.map(keyOf));
    for (const entry of projectionEntries) {
      if (!legacyKeys.has(keyOf(entry))) {
        report.extraInProjection++;
        if (report.sampleExtra.length < 10) {
          report.sampleExtra.push(`${entry.date} ${entry.type} ${entry.referenceId} ${entry.account} $${entry.debit || entry.credit}`);
        }
      }
    }

    report.consistent = report.missingFromProjection === 0 && report.amountMismatches === 0;

    logger.info('Ledger shadow diff', {
      workspaceId: scope.workspaceId,
      legacy: report.legacyEntries,
      projection: report.projectionEntries,
      missing: report.missingFromProjection,
      extra: report.extraInProjection,
      amountMismatches: report.amountMismatches,
      consistent: report.consistent,
    });
  } catch (error) {
    logger.error('Ledger shadow diff failed', { message: error instanceof Error ? error.message : String(error) });
  }

  return report;
}
