const { chromium, expect } = require('@playwright/test');
const crypto = require('crypto');

const appBase = process.env.APP_URL || 'http://127.0.0.1:4183';
const apiBase = process.env.API_URL || 'http://127.0.0.1:18080';
const workspaceId = process.env.WORKSPACE_ID || '0ae15340-d352-4eec-9caf-fd666f386e12';
const jwtSecret = requiredEnv('GOTRUE_JWT_SECRET');
const userUuid = requiredEnv('SYNAPSENOTE_TEST_USER_UUID');
const userEmail = requiredEnv('SYNAPSENOTE_TEST_USER_EMAIL');

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt({
    aud: 'authenticated',
    exp: now + 7 * 24 * 60 * 60,
    iat: now,
    sub: userUuid,
    email: userEmail,
    role: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { email_verified: true },
  });

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 7 * 24 * 60 * 60,
    expires_at: now + 7 * 24 * 60 * 60,
    refresh_token: 'local-functional-refresh-token',
    user: {
      id: userUuid,
      email: userEmail,
    },
  };
}

async function getViewIdByName(name) {
  const token = makeToken();
  const response = await fetch(`${apiBase}/api/workspace/${workspaceId}/view/${workspaceId}?depth=50`, {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
    },
  });
  const json = await response.json();
  const stack = [...(json.data?.children || [])];

  while (stack.length > 0) {
    const view = stack.shift();

    if (view?.name === name) return view.view_id;
    stack.push(...(view?.children || []));
  }
}

async function installLocalRuntime(page) {
  const token = makeToken();
  const activeViewId = await getViewIdByName('Roadmap 2026');

  await page.addInitScript(
    ({ activeViewId, apiBase, token }) => {
      const fixedNow = new Date('2026-06-29T20:00:00+09:00').getTime();
      const RealDate = Date;

      class FixedDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            super(fixedNow);
            return;
          }
          super(...args);
        }

        static now() {
          return fixedNow;
        }
      }

      FixedDate.UTC = RealDate.UTC;
      FixedDate.parse = RealDate.parse;
      window.Date = FixedDate;
      window.__APP_CONFIG__ = {
        SYNAPSENOTE_BASE_URL: apiBase,
        SYNAPSENOTE_GOTRUE_BASE_URL: `${apiBase}/gotrue`,
        SYNAPSENOTE_WS_BASE_URL: `ws://${new URL(apiBase).host}/ws/v2`,
      };
      window.localStorage.setItem('token', JSON.stringify(token));
      window.localStorage.setItem('dark-mode', 'false');
      window.localStorage.setItem('outline_open', 'true');
      window.localStorage.setItem('outline_width', '268');
      window.localStorage.setItem('favorite_expanded', 'true');
      if (activeViewId) {
        window.localStorage.setItem('synapse_last_sidebar_view_id', activeViewId);
      }
    },
    { activeViewId, apiBase, token }
  );
}

async function openSection(page, section) {
  await page.goto(`${appBase}/app/${workspaceId}/${section}`, { waitUntil: 'networkidle' });
  await page.waitForSelector(`#view-${section}`, { state: 'visible', timeout: 30_000 });
}

async function runStep(results, name, fn) {
  await fn();
  results.push({ name, status: 'passed' });
  console.log(`passed: ${name}`);
}

async function main() {
  const browser = await chromium.launch({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const results = [];
  const pageErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: appBase });
  await installLocalRuntime(page);

  await runStep(results, 'home stats and cards render from real workspace data', async () => {
    await openSection(page, 'home');
    await expect(page.locator('#view-home .stat-card')).toHaveCount(4);
    await expect(page.locator('#view-home .stat-lbl')).toHaveText(['문서', '연결', '스페이스', '오늘 편집']);
    const statValues = await page.locator('#view-home .stat-num').allTextContents();

    if (statValues.length !== 4 || statValues.some((value) => !/^\d+$/.test(value))) {
      throw new Error(`home stat values are not numeric: ${JSON.stringify(statValues)}`);
    }

    await expect(page.locator('#view-home .hcard').first()).toContainText('Synapse roadmap');
  });

  await runStep(results, 'sidebar navigation changes sections and active state', async () => {
    await page.locator('nav[aria-label="Primary"] button', { hasText: 'Library' }).click();
    await page.waitForURL(`**/app/${workspaceId}/library`);
    await expect(page.locator('#view-library')).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary"] button[aria-current="page"]')).toContainText('Library');
    await page.locator('nav[aria-label="Primary"] button', { hasText: 'Agent' }).click();
    await page.waitForURL(`**/app/${workspaceId}/agent`);
    await expect(page.locator('#view-agent')).toBeVisible();
  });

  await runStep(results, 'sidebar shell menus and collapse controls respond', async () => {
    await openSection(page, 'home');
    await page.getByRole('button', { name: '워크스페이스 전환' }).click();
    await expect(page.getByText('워크스페이스').last()).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.locator('html')).not.toHaveAttribute('data-dark-mode', 'true');
    await page.getByRole('button', { name: '라이트/다크 전환' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-dark-mode', 'true');
    await expect(page.locator('#view-home .stat-card').first()).toBeVisible();
    await page.getByRole('button', { name: '라이트/다크 전환' }).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-dark-mode', 'true');

    await page.getByRole('button', { name: '받은 알림' }).click();
    await expect(page.locator('[data-radix-popper-content-wrapper]').last()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('#sec-fav .sb-sec-h').click();
    await expect(page.locator('#sec-fav .sb-sec-h')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#sec-fav .sb-sec-h').click();
    await expect(page.locator('#sec-fav .sb-sec-h')).toHaveAttribute('aria-expanded', 'true');

    const productRow = page.locator('.tree-row', { hasText: 'Product' }).first();

    if ((await productRow.getAttribute('aria-expanded')) === 'false') {
      await productRow.locator('.tw.has-children').click();
    }

    const releaseNotes = page.locator('.tree-row', { hasText: 'Release notes' }).first();
    const initialReleaseExpanded = await releaseNotes.getAttribute('aria-expanded');

    await releaseNotes.hover();
    await releaseNotes.locator('.tw.has-children').click();
    await expect(releaseNotes).toHaveAttribute('aria-expanded', initialReleaseExpanded === 'true' ? 'false' : 'true');
    await releaseNotes.locator('.tw.has-children').click();
    await expect(releaseNotes).toHaveAttribute('aria-expanded', initialReleaseExpanded === 'true' ? 'true' : 'false');

    const roadmapRow = page.locator('.tree-row', { hasText: 'Roadmap 2026' }).first();

    await roadmapRow.hover();
    await page.getByRole('button', { name: 'Roadmap 2026 더보기', exact: true }).click();
    await expect(page.locator('[data-testid="view-actions-popover"]')).toBeVisible();
    await page.keyboard.press('Escape');

    await roadmapRow.hover();
    await page.getByRole('button', { name: 'Roadmap 2026 하위 페이지', exact: true }).click();
    await expect(page.locator('[data-testid="view-actions-popover"]')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('.sb-bottom .sb-item', { hasText: '설정' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('.sb-bottom .sb-item', { hasText: '휴지통' }).click();
    await page.waitForURL('**/app/trash');
    await openSection(page, 'home');

    await page.getByRole('button', { name: '패널 접기' }).click();
    await page.waitForFunction(() => {
      const sidebar = document.querySelector('.sb');

      if (!sidebar) return true;

      const rect = sidebar.getBoundingClientRect();
      const style = window.getComputedStyle(sidebar);

      return rect.right <= 1 || style.visibility === 'hidden' || style.display === 'none';
    });
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.sb')).toBeVisible();
  });

  await runStep(results, 'search opens by button and keyboard shortcut', async () => {
    await page.locator('.sb-actions .sb-item', { hasText: '검색' }).click();
    await expect(page.locator('[role="dialog"] input').first()).toBeVisible();
    await page.locator('[role="dialog"] input').first().fill('Roadmap');
    await expect(page.locator('[role="dialog"] input').first()).toHaveValue('Roadmap');
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.locator('[role="dialog"] input').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  await runStep(results, 'library controls update real UI state', async () => {
    await openSection(page, 'library');
    await page.locator('.lib-toolbar .seg button', { hasText: '갤러리' }).click();
    await expect(page.locator('.lib-toolbar .seg button[aria-pressed="true"]')).toContainText('갤러리');
    await expect(page.locator('#view-library .hcards')).toBeVisible();

    await page.locator('.lib-toolbar .seg button', { hasText: '보드' }).click();
    await expect(page.locator('.lib-toolbar .seg button[aria-pressed="true"]')).toContainText('보드');
    await expect(page.locator('#view-library .spaces')).toBeVisible();

    await page.locator('.lib-toolbar .seg button', { hasText: '목록' }).click();
    await expect(page.locator('#view-library .tbl')).toBeVisible();
    await page.locator('.lib-toolbar input').fill('Roadmap');
    await expect(page.locator('#view-library .trow')).toHaveCount(2);
    await expect(page.locator('#view-library .trow', { hasText: 'Synapse roadmap' })).toBeVisible();
    await expect(page.locator('#view-library .trow', { hasText: 'Roadmap 2026' })).toBeVisible();
    await page.locator('.lib-toolbar input').fill('');

    await page.locator('.lib-toolbar .chip', { hasText: '최근 수정순' }).click();
    await expect(page.locator('.lib-toolbar .chip', { hasText: '이름순' })).toBeVisible();
    await page.locator('.lib-toolbar .chip', { hasText: '스페이스별' }).click();
    await expect(page.locator('#view-library .tgrouph').first()).toContainText('전체');
    await page.locator('.lib-toolbar .chip', { hasText: '전체' }).click();
    await expect(page.locator('#view-library .tgrouph').first()).toContainText('Product');
    await page.locator('#view-library .tgrouph', { hasText: 'Product' }).click();
    await expect(page.locator('#view-library .tgrouph', { hasText: 'Product' })).toHaveAttribute('aria-expanded', 'false');
  });

  await runStep(results, 'home document cards are keyboard-openable', async () => {
    await openSection(page, 'home');
    await page.locator('#view-home .more', { hasText: '전체 보기' }).first().click();
    await page.waitForURL(`**/app/${workspaceId}/library`);
    await openSection(page, 'home');
    await page.locator('#view-home .spaces .hcard', { hasText: 'Product' }).click();
    await page.waitForFunction(() => !location.pathname.endsWith('/home'), null, { timeout: 10_000 });
    await openSection(page, 'home');
    await page.locator('#view-home .hcard').first().focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !location.pathname.endsWith('/home'), null, { timeout: 10_000 });
  });

  await runStep(results, 'agent conversation controls are wired', async () => {
    await openSection(page, 'agent');
    await expect(page.locator('#view-agent .empty h2')).toContainText('무엇을 도와드릴까요?');
    await page.locator('#view-agent .model-sel').click();
    await page.getByRole('menuitem', { name: /GPT-5\.5/ }).click();
    await expect(page.locator('#view-agent .model-sel')).toContainText('GPT-5.5');
    await page.getByRole('button', { name: '대화 기록' }).click();
    await expect(page.locator('[role="menu"]').last()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '새 대화' }).click();
    await expect(page.locator('#view-agent .empty h2')).toContainText('무엇을 도와드릴까요?');
    await page.locator('#view-agent .scard').first().click();
    await expect(page.locator('#view-agent .q-bubble').last()).toContainText('최근 회의록 3개', { timeout: 10_000 });
    await expect(page.locator('#view-agent .turn-head').last()).toContainText(/응답 완료|연결 필요/, { timeout: 10_000 });

    const webTool = page.locator('#view-agent .tool', { hasText: '웹' });
    await expect(webTool).toHaveAttribute('aria-pressed', 'false');
    await webTool.click();
    await expect(webTool).toHaveAttribute('aria-pressed', 'true');

    const mentionTool = page.locator('#view-agent .tool', { hasText: '문서 멘션' });
    await mentionTool.click();
    await expect(mentionTool).toHaveAttribute('aria-pressed', 'true');

    await page.locator('#view-agent textarea').fill('바나나 보관법만 한 줄로 답해줘');
    await expect(page.getByRole('button', { name: '보내기' })).toBeEnabled();
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.locator('#view-agent .q-bubble').last()).toContainText('바나나 보관법', {
      timeout: 10_000,
    });
    await expect(page.locator('#view-agent .turn-body').last()).not.toContainText('이번 분기(Q2)');
    await expect(page.locator('#view-agent .turn-head').last()).toContainText(/응답 완료|연결 필요/, { timeout: 10_000 });
    await page.getByRole('button', { name: '복사' }).click();
    await page.getByRole('button', { name: '좋아요' }).click();
    await expect(page.getByRole('button', { name: '좋아요' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '싫어요' }).click();
    await expect(page.getByRole('button', { name: '싫어요' })).toHaveAttribute('aria-pressed', 'true');
    const turnCount = await page.locator('#view-agent .q-bubble').count();

    await page.getByRole('button', { name: '다시 생성' }).click();
    await expect(page.locator('#view-agent .q-bubble')).toHaveCount(turnCount + 1, { timeout: 10_000 });
    await page.locator('#view-agent').getByRole('button', { name: '공유' }).click();
  });

  if (pageErrors.length > 0) {
    throw new Error(`page errors: ${pageErrors.join(' | ')}`);
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
