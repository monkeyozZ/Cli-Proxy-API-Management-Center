import type { TFunction } from 'i18next';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem, KiroQuotaState } from '@/types';
import {
  isDisabledAuthFile,
  isKiroFile,
  normalizeNumberValue,
  normalizeStringValue,
} from '@/utils/quota';
import { isRuntimeOnlyAuthFile } from '@/features/authFiles/constants';
import type { QuotaProviderData } from '../types';

export interface KiroQuotaData {
  subscriptionTitle: string | null;
  currentUsage: number | null;
  usageLimit: number | null;
  remaining: number | null;
  usagePercentage: number | null;
  nextResetAt: number | null;
}

const fetchKiroQuota = async (file: AuthFileItem, t: TFunction): Promise<KiroQuotaData> => {
  const name = String(file.name ?? '').trim();
  if (!name) {
    throw new Error(t('common.unknown_error'));
  }

  const payload = await authFilesApi.getKiroBalance(name);
  return {
    subscriptionTitle: normalizeStringValue(
      payload.subscription_title ?? payload.subscriptionTitle
    ),
    currentUsage: normalizeNumberValue(payload.current_usage ?? payload.currentUsage),
    usageLimit: normalizeNumberValue(payload.usage_limit ?? payload.usageLimit),
    remaining: normalizeNumberValue(payload.remaining),
    usagePercentage: normalizeNumberValue(payload.usage_percentage ?? payload.usagePercentage),
    nextResetAt: normalizeNumberValue(payload.next_reset_at ?? payload.nextResetAt),
  };
};

export const KIRO_CONFIG: QuotaProviderData<KiroQuotaState, KiroQuotaData> = {
  type: 'kiro',
  i18nPrefix: 'kiro_quota',
  filterFn: (file) => isKiroFile(file) && !isRuntimeOnlyAuthFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchKiroQuota,
  storeSelector: (state) => state.kiroQuota,
  storeSetter: 'setKiroQuota',
  buildLoadingState: () => ({
    status: 'loading',
    subscriptionTitle: null,
    currentUsage: null,
    usageLimit: null,
    remaining: null,
    usagePercentage: null,
    nextResetAt: null,
  }),
  buildSuccessState: (data) => ({
    status: 'success',
    subscriptionTitle: data.subscriptionTitle,
    currentUsage: data.currentUsage,
    usageLimit: data.usageLimit,
    remaining: data.remaining,
    usagePercentage: data.usagePercentage,
    nextResetAt: data.nextResetAt,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    subscriptionTitle: null,
    currentUsage: null,
    usageLimit: null,
    remaining: null,
    usagePercentage: null,
    nextResetAt: null,
    error: message,
    errorStatus: status,
  }),
};
