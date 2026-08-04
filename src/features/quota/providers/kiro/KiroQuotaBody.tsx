import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { KiroQuotaState } from '@/types';
import { buildResetDisplay, formatInstantShort } from '@/utils/quota';
import { useNow } from '@/hooks/useNow';
import { QuotaMeter } from '../../components/QuotaMeter';
import { QuotaResetLabel } from '../../components/QuotaResetLabel';
import { KIRO_BALANCE_ROW_ID, collectQuotaRowInstants, pickUrgentRowId } from '../../resetSchedule';
import type { QuotaBodyProps } from '../../types';

const formatBalanceAmount = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '--';
  const maximumFractionDigits = Number.isInteger(value) ? 0 : 2;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
};

const toResetAtMs = (value: number | null | undefined): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
};

export function KiroQuotaBody({ quota, classes }: QuotaBodyProps<KiroQuotaState>) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const soon = useMemo(
    () => pickUrgentRowId(collectQuotaRowInstants('kiro', quota), now) === KIRO_BALANCE_ROW_ID,
    [quota, now]
  );

  const hasData =
    quota.subscriptionTitle != null ||
    quota.currentUsage != null ||
    quota.usageLimit != null ||
    quota.remaining != null;
  if (!hasData) {
    return <div className={classes.quotaMessage}>{t('kiro_quota.empty_data')}</div>;
  }

  const remainingPercent =
    quota.usagePercentage != null
      ? Math.max(0, Math.min(100, 100 - quota.usagePercentage))
      : quota.remaining != null && quota.usageLimit != null && quota.usageLimit > 0
        ? Math.max(0, Math.min(100, (quota.remaining / quota.usageLimit) * 100))
        : null;
  const percentLabel = remainingPercent === null ? '--' : `${Math.round(remainingPercent)}%`;
  const remainingLabel = formatBalanceAmount(quota.remaining);
  const usageLabel = `${formatBalanceAmount(quota.currentUsage)} / ${formatBalanceAmount(quota.usageLimit)}`;
  const planLabel = quota.subscriptionTitle ?? t('kiro_quota.plan_unknown');
  const resetAtMs = toResetAtMs(quota.nextResetAt);
  const resetDisplay = buildResetDisplay(
    resetAtMs === null ? null : formatInstantShort(resetAtMs),
    resetAtMs,
    now,
    i18n.resolvedLanguage
  );

  return (
    <>
      <div className={classes.codexPlan}>
        <span className={classes.codexPlanItem}>
          <span className={classes.codexPlanLabel}>{t('kiro_quota.plan_label')}</span>
          <span className={classes.codexPlanValue}>{planLabel}</span>
        </span>
      </div>
      <div
        className={classes.quotaRow}
        title={soon ? t('quota_management.soonest_row_hint') : undefined}
      >
        <div className={classes.quotaRowHeader}>
          <span className={classes.quotaModel}>{t('kiro_quota.balance_label')}</span>
          <div className={classes.quotaMeta}>
            <span className={classes.quotaPercent}>{remainingLabel}</span>
            <span className={classes.quotaAmount}>{percentLabel}</span>
            {resetDisplay && (
              <QuotaResetLabel display={resetDisplay} classes={classes} soon={soon} />
            )}
          </div>
        </div>
        <QuotaMeter percent={remainingPercent} classes={classes} index={0} />
      </div>
      <div className={classes.quotaRow}>
        <div className={classes.quotaRowHeader}>
          <span className={classes.quotaModel}>{t('kiro_quota.usage_label')}</span>
          <div className={classes.quotaMeta}>
            <span className={classes.quotaAmount}>{usageLabel}</span>
          </div>
        </div>
      </div>
    </>
  );
}
