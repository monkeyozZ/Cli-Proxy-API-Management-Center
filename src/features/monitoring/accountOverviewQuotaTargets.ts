import type { AuthFileItem } from '@/types';
import {
  isCodexFile,
  isKiroFile,
  normalizeAuthIndex,
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
} from '@/utils/quota';
import type { MonitoringAccountAuthState } from './accountOverviewState';
import type { MonitoringAccountRow } from './hooks/useMonitoringData';

export type MonitoringAccountQuotaTarget = {
  providerType: 'codex' | 'kiro';
  key: string;
  authIndex: string | null;
  authLabel: string;
  fileName: string;
  accountId: string | null;
  planType: string | null;
};

const readAuthFileQuotaLabel = (file: AuthFileItem, authIndex: string) => {
  const candidates = [file.label, file.name, file.email, file.account, authIndex];
  for (const candidate of candidates) {
    const text =
      typeof candidate === 'string'
        ? candidate.trim()
        : candidate === null || candidate === undefined
          ? ''
          : String(candidate).trim();
    if (text) return text;
  }
  return authIndex;
};

const buildRowQuotaProviderSet = (row: MonitoringAccountRow) =>
  new Set(
    row.providers
      .map((provider) => provider.trim().toLowerCase())
      .filter((provider) => provider === 'codex' || provider === 'kiro')
  );

export const buildMonitoringAccountQuotaTargetsByAccount = (
  rows: MonitoringAccountRow[],
  authStateByRowId: Map<string, MonitoringAccountAuthState>
) =>
  new Map(
    rows.map((row) => {
      const bucket = new Map<string, MonitoringAccountQuotaTarget>();
      const authState = authStateByRowId.get(row.id);
      const rowQuotaProviders = buildRowQuotaProviderSet(row);

      authState?.files.forEach((file) => {
        const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
        const isCodex = isCodexFile(file);
        const isKiro = isKiroFile(file);
        if (!isCodex && !isKiro) return;
        if (isCodex && !authIndex) return;

        const providerType = isKiro ? 'kiro' : 'codex';
        if (rowQuotaProviders.size > 0 && !rowQuotaProviders.has(providerType)) return;

        const dedupeKey = `${providerType}::${authIndex || file.name}::${file.name}`;
        if (bucket.has(dedupeKey)) return;

        bucket.set(dedupeKey, {
          providerType,
          key: dedupeKey,
          authIndex: authIndex || null,
          authLabel: readAuthFileQuotaLabel(file, authIndex || file.name),
          fileName: file.name,
          accountId: isCodex ? resolveCodexChatgptAccountId(file) : null,
          planType: isCodex ? resolveCodexPlanType(file) : null,
        });
      });

      return [
        row.id,
        Array.from(bucket.values()).sort((left, right) =>
          left.authLabel.localeCompare(right.authLabel)
        ),
      ] as const;
    })
  );
