const { chromium, expect } = require('@playwright/test');
const crypto = require('crypto');

const appBase = process.env.APP_URL || 'http://127.0.0.1:4183';
const apiBase = process.env.API_URL || 'http://127.0.0.1:18080';
const workspaceId = process.env.WORKSPACE_ID || '0ae15340-d352-4eec-9caf-fd666f386e12';
const jwtSecret = requiredEnv('GOTRUE_JWT_SECRET');
const userUuid = requiredEnv('SYNAPSENOTE_TEST_USER_UUID');
const userEmail = requiredEnv('SYNAPSENOTE_TEST_USER_EMAIL');
const viewports = [
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
];
const sections = ['home', 'library', 'agent'];

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
    refresh_token: 'local-responsive-refresh-token',
    user: {
      id: userUuid,
      email: userEmail,
    },
  };
}

async function installLocalRuntime(page) {
  const token = makeToken();

  await page.addInitScript(
    ({ apiBase, token }) => {
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
    },
    { apiBase, token }
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const offenders = Array.from(document.body.querySelectorAll('*'))
      .map((element) => {
        const rect = element.getBoundingClientRect();

        return {
          tag: element.tagName,
          className: String(element.className || ''),
          text: element.textContent?.trim().slice(0, 60) || '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.width > 0 && (item.left < -4 || item.right > window.innerWidth + 4))
      .slice(0, 8);

    return {
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      offenders,
    };
  });

  if (overflow.bodyScrollWidth > overflow.innerWidth + 4 || overflow.docScrollWidth > overflow.innerWidth + 4) {
    throw new Error(`${label} has horizontal overflow: ${JSON.stringify(overflow)}`);
  }
}

async function main() {
  const browser = await chromium.launch();
  const results = [];

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });

    await installLocalRuntime(page);

    for (const section of sections) {
      const label = `${section} ${viewport.width}x${viewport.height}`;

      await page.goto(`${appBase}/app/${workspaceId}/${section}`, { waitUntil: 'networkidle' });
      await page.waitForSelector(`#view-${section}`, { state: 'visible', timeout: 30_000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await expect(page.locator(`#view-${section}`)).toBeVisible();
      const viewWidth = await page.locator(`#view-${section}`).evaluate((element) => Math.round(element.getBoundingClientRect().width));

      if (viewWidth < Math.min(320, viewport.width - 24)) {
        throw new Error(`${label} content is too narrow to use: ${viewWidth}px`);
      }

      await assertNoHorizontalOverflow(page, label);
      results.push({ label, status: 'passed' });
      console.log(`passed: ${label}`);
    }

    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
