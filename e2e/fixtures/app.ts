import { test as base } from '@playwright/test';
import { AppSession } from '../support/appHarness';

export const test = base.extend<{
  appSession: AppSession;
}>({
  appSession: async ({ browserName: _browserName }, runFixture, testInfo) => {
    const appSession = await AppSession.launch(testInfo.title);

    try {
      await runFixture(appSession);
    } finally {
      const failed = testInfo.status !== testInfo.expectedStatus;
      await appSession.persistArtifacts(testInfo, failed);
      await appSession.close(failed ? 'failed' : 'completed');
    }
  },
});

export { expect } from '@playwright/test';
