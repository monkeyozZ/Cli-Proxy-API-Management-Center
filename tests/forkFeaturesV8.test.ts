import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { apiClient } from '@/services/api/client';
import { authFilesApi } from '@/services/api/authFiles';
import { oauthApi } from '@/services/api/oauth';
import { usageApi } from '@/services/api/usage';
import { normalizeConfigResponse } from '@/services/api/transformers';
import { loadMonitoringMetaPayload } from '@/features/monitoring/hooks/useMonitoringData';
import {
  captureQuotaCacheGeneration,
  commitIfQuotaCacheCurrent,
  useQuotaStore,
} from '@/stores/useQuotaStore';

const spies: Array<{ mockRestore(): void }> = [];
const mock = (method: 'get' | 'post' | 'postForm' | 'delete', value: unknown = {}) => {
  const spy = spyOn(apiClient, method).mockResolvedValue(value as never);
  spies.push(spy);
  return spy;
};

afterEach(() => {
  spies.splice(0).forEach((spy) => spy.mockRestore());
  useQuotaStore.getState().clearQuotaCache();
});

describe('fork features on the v8 management API', () => {
  test('keeps Kiro OAuth on the shared web UI flow, including callback and cancellation', async () => {
    const get = mock('get');
    const post = mock('post');
    const cancel = mock('delete');
    await oauthApi.startAuth('kiro');
    expect(get).toHaveBeenLastCalledWith('/oauth/auth-url', {
      params: { provider: 'kiro', is_webui: true },
    });
    await oauthApi.submitCallback('kiro', 'http://localhost/kiro/callback?code=fixture');
    expect(post).toHaveBeenLastCalledWith(
      '/oauth/callback',
      { provider: 'kiro', redirect_url: 'http://localhost/kiro/callback?code=fixture' },
      undefined
    );
    await oauthApi.cancelSession('fixture-state');
    expect(cancel).toHaveBeenLastCalledWith('/oauth/session', {
      params: { state: 'fixture-state' },
    });
  });

  test('reads Kiro balance through credentials and uploads complete edited credentials', async () => {
    const balance = { current_usage: 25, usage_limit: 100, remaining: 75 };
    const get = mock('get', balance);
    const upload = mock('postForm', { status: 'ok' });
    expect(await authFilesApi.getKiroBalance('kiro account.json')).toEqual(balance);
    expect(get).toHaveBeenLastCalledWith('/credentials/kiro/balance?name=kiro%20account.json');

    const credential = {
      type: 'kiro',
      refresh_token: 'fixture-refresh',
      region: 'us-east-1',
      request_retry: 2,
      model_aliases: [{ name: 'upstream-model', alias: 'public-model' }],
      future_metadata: { retained: true },
    };
    await authFilesApi.saveText('kiro.json', JSON.stringify(credential));
    expect(upload.mock.calls[0][0]).toBe('/credentials');
    const form = upload.mock.calls[0][1] as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('kiro.json');
    expect(JSON.parse(await file.text())).toEqual(credential);
  });

  test('preserves monitoring usage reads and transfers on observability routes', async () => {
    const get = mock('get', { usage: { total_requests: 1 } });
    const post = mock('post', { added: 1 });
    await usageApi.getUsage();
    expect(get.mock.calls.at(-1)?.[0]).toBe('/observability/usage');
    await usageApi.getKeyStats();
    expect(get.mock.calls.at(-1)?.[0]).toBe('/observability/usage');
    await usageApi.exportUsage();
    expect(get.mock.calls.at(-1)?.[0]).toBe('/observability/usage/export');
    await usageApi.importUsage({ version: 1, usage: {} });
    expect(post.mock.calls.at(-1)?.slice(0, 2)).toEqual([
      '/observability/usage/import',
      { version: 1, usage: {} },
    ]);
  });

  test('reads the statistics switch from v8 configuration without reviving legacy settings', () => {
    for (const enabled of [true, false]) {
      expect(
        normalizeConfigResponse({
          observability: { usage: { 'usage-statistics-enabled': enabled } },
          'usage-statistics-enabled': !enabled,
        }).usageStatisticsEnabled
      ).toBe(enabled);
    }
    expect(
      normalizeConfigResponse({ 'usage-statistics-enabled': true }).usageStatisticsEnabled
    ).toBeUndefined();
  });

  test('loads monitoring account and channel metadata from credentials and v8 provider groups', async () => {
    const get = mock('get').mockImplementation(async (path) => {
      if (path === '/credentials') {
        return { files: [{ name: 'kiro.json', type: 'kiro', auth_index: 'kiro-fixture' }] };
      }
      if (path === '/config') {
        return {
          'config-version': 8,
          'api-keys': {
            'openai-compatibility': [
              {
                name: 'Fixture channel',
                'base-url': 'https://upstream.invalid/v1',
                keys: [{ 'api-key': 'fixture-key', 'auth-index': 'channel-fixture' }],
                models: [{ name: 'upstream-model', alias: 'public-model' }],
              },
            ],
          },
        };
      }
      throw new Error(`Unexpected management route: ${path}`);
    });
    const metadata = await loadMonitoringMetaPayload(null);
    expect(metadata.error).toBe('');
    expect(metadata.authFiles[0].type).toBe('kiro');
    expect(metadata.channels[0]).toMatchObject({
      name: 'Fixture channel',
      host: 'upstream.invalid',
      authIndices: ['channel-fixture'],
      modelNames: ['upstream-model'],
    });
    expect(get.mock.calls.map(([path]) => path).sort()).toEqual(['/config', '/credentials']);
  });

  test('invalidates changed Kiro accounts without discarding other pending quota requests', () => {
    const quota = {
      status: 'success' as const,
      currentUsage: 25,
      usageLimit: 100,
      remaining: 75,
      usagePercentage: 25,
    };
    useQuotaStore.getState().setKiroQuota({ 'first.json': quota, 'second.json': quota });
    const first = captureQuotaCacheGeneration('first.json');
    const second = captureQuotaCacheGeneration('second.json');
    useQuotaStore.getState().clearQuotaCache(['first.json']);
    expect(useQuotaStore.getState().kiroQuota).toEqual({ 'second.json': quota });
    expect(commitIfQuotaCacheCurrent(first, () => {})).toBe(false);
    expect(commitIfQuotaCacheCurrent(second, () => {})).toBe(true);
    useQuotaStore.getState().clearQuotaCache();
    expect(useQuotaStore.getState().kiroQuota).toEqual({});
    expect(commitIfQuotaCacheCurrent(second, () => {})).toBe(false);
  });
});
