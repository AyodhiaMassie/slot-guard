import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const frontendUrl = process.env.SLOTGUARD_FRONTEND_URL || 'http://localhost:5173';
const apiUrl = process.env.SLOTGUARD_API_URL || 'http://localhost:3000/api';
for (const value of [frontendUrl, apiUrl]) {
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname),
    'Browser smoke must target local services.',
  );
}
assert.equal(
  (await fetch(`${apiUrl}/health`)).status,
  200,
  'Start the local API and PostgreSQL first.',
);
assert.equal((await fetch(frontendUrl)).status, 200, 'Start the Vite frontend first.');
const artifactDirectory = new URL('../../../.local/phase-2-browser/', import.meta.url);
await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.SLOTGUARD_BROWSER_CHANNEL || 'msedge',
  headless: true,
});
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'en-GB',
  timezoneId: 'Asia/Kuala_Lumpur',
});
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
page.setDefaultTimeout(15000);

async function login(target, name, role) {
  await target.getByRole('button', { name: `Use ${name} (${role})`, exact: true }).click();
  await target.getByRole('button', { name: 'Sign in', exact: true }).click();
  await target.getByRole('navigation', { name: 'Main navigation' }).waitFor();
}
async function signOut(target = page) {
  await target.getByRole('button', { name: 'Sign out' }).click();
  await target.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
}
async function dayLabel(startsAt) {
  return page.evaluate(
    (value) =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value)),
    startsAt,
  );
}
async function selectTime(target, startsAt) {
  const label = await dayLabel(startsAt);
  await target.getByRole('button', { name: label, exact: true }).click();
  await target.locator(`.time-button:has(time[datetime="${startsAt}"])`).click();
}
async function confirmBooking(target) {
  const dialog = target.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Close dialog' }).focus();
  await target.keyboard.press('Shift+Tab');
  assert.equal(await dialog.getByRole('button', { name: 'Confirm booking' })
    .evaluate((button) => button === document.activeElement), true, 'Backward Tab must stay inside the dialog.');
  await target.keyboard.press('Tab');
  assert.equal(await dialog.getByRole('button', { name: 'Close dialog' })
    .evaluate((button) => button === document.activeElement), true, 'Forward Tab must stay inside the dialog.');
  await dialog.getByRole('button', { name: 'Confirm booking' }).click();
  await target.getByText(/Appointment confirmed with/).waitFor();
  await target.waitForFunction(() => document.activeElement?.id === 'main-content');
}
async function cancelTime(target, startsAt) {
  await target.getByRole('navigation').getByRole('button', { name: 'My appointments' }).click();
  await target
    .locator(`.appointment-card:has(time[datetime="${startsAt}"])`)
    .getByRole('button', { name: /Cancel appointment with/ })
    .click();
  await target
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel appointment', exact: true })
    .click();
  await target.getByText(/Appointment cancelled/).waitFor();
}
async function assertNoOverflow(target) {
  assert.equal(
    await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'Page must not overflow horizontally.',
  );
}

try {
  await page.goto(frontendUrl);
  await page.screenshot({
    path: fileURLToPath(new URL('login-desktop.png', artifactDirectory)),
    fullPage: true,
  });
  await login(page, 'Alex', 'Student');
  await page.locator('.time-button').first().waitFor();
  const originalStart = await page.locator('.time-button time').first().getAttribute('datetime');
  await page.locator('.time-button').first().click();
  await confirmBooking(page);
  await page.getByRole('navigation').getByRole('button', { name: 'My appointments' }).click();
  await page
    .locator(`.appointment-card:has(time[datetime="${originalStart}"])`)
    .getByText('Confirmed', { exact: true })
    .waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL('student-desktop.png', artifactDirectory)),
    fullPage: true,
  });
  await signOut();

  await login(page, 'Maya', 'Tutor');
  await page
    .locator(`.schedule-row:has(time[datetime="${originalStart}"])`)
    .getByText('Alex Morgan', { exact: true })
    .waitFor();
  assert.equal(
    await page
      .locator(`.schedule-row:has(time[datetime="${originalStart}"])`)
      .getByRole('button', { name: /Close slot/ })
      .count(),
    0,
  );
  await page.getByRole('button', { name: 'Manage availability', exact: true }).click();
  const date = await page.evaluate(() => {
    const value = new Date();
    value.setDate(value.getDate() + 32);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  });
  await page.getByLabel('Appointment date').fill(date);
  const existing = await page.evaluate(async (api) => {
    const session = JSON.parse(sessionStorage.getItem('slotguard.session'));
    const slots = [];
    for (let offset = 0; ; offset += 100) {
      const response = await fetch(`${api}/slots/mine?limit=100&offset=${offset}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const result = await response.json();
      slots.push(...result.data);
      if (result.data.length < 100) break;
    }
    return slots.map((slot) => slot.starts_at);
  }, apiUrl);
  const newTime = await page
    .getByLabel('Start time')
    .locator('option')
    .evaluateAll(
      (options, { date, existing }) =>
        options
          .map((option) => option.value)
          .find((time) => !existing.includes(new Date(`${date}T${time}:00`).toISOString())),
      { date, existing },
    );
  assert.ok(newTime, 'Need an unused future slot for the smoke test.');
  await page.getByLabel('Start time').selectOption(newTime);
  const createdResponse = page.waitForResponse(
    (response) => response.url() === `${apiUrl}/slots` && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create time slot', exact: true }).click();
  const created = await createdResponse;
  assert.equal(created.status(), 201);
  const newSlot = (await created.json()).data;
  await page.getByText(/Time slot created/).waitFor();
  await page.screenshot({
    path: fileURLToPath(new URL('tutor-desktop.png', artifactDirectory)),
    fullPage: true,
  });
  await signOut();

  await login(page, 'Sam', 'Student');
  await selectTime(page, newSlot.starts_at);
  await confirmBooking(page);
  await cancelTime(page, newSlot.starts_at);
  await page.getByRole('button', { name: /^History/ }).click();
  await page
    .locator(`.appointment-card:has(time[datetime="${newSlot.starts_at}"])`)
    .getByText('Cancelled', { exact: true })
    .waitFor();
  await page.getByRole('navigation').getByRole('button', { name: 'Find a tutor' }).click();
  await selectTime(page, newSlot.starts_at);

  const competingContext = await browser.newContext({
    locale: 'en-GB',
    timezoneId: 'Asia/Kuala_Lumpur',
  });
  const competitor = await competingContext.newPage();
  competitor.on('pageerror', (error) => errors.push(error.message));
  await competitor.goto(frontendUrl);
  await login(competitor, 'Alex', 'Student');
  await selectTime(competitor, newSlot.starts_at);
  await confirmBooking(competitor);
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm booking' }).click();
  await page.getByRole('alert').filter({ hasText: 'That slot is no longer available' }).waitFor();
  await cancelTime(competitor, newSlot.starts_at);
  await cancelTime(competitor, originalStart);
  await competingContext.close();

  await signOut();
  await login(page, 'Maya', 'Tutor');
  await page
    .locator(`.schedule-row:has(time[datetime="${newSlot.starts_at}"])`)
    .getByRole('button', { name: /Close slot/ })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close slot', exact: true }).click();
  await page.getByText(/Time slot closed/).waitFor();
  await assertNoOverflow(page);
  await page.reload();
  await page.getByRole('button', { name: 'Manage availability' }).waitFor();
  await signOut();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-GB',
    timezoneId: 'America/New_York',
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  mobilePage.on('pageerror', (error) => errors.push(error.message));
  await mobilePage.goto(frontendUrl);
  await assertNoOverflow(mobilePage);
  await mobilePage.screenshot({
    path: fileURLToPath(new URL('login-mobile.png', artifactDirectory)),
    fullPage: true,
  });
  await login(mobilePage, 'Alex', 'Student');
  await mobilePage.locator('.time-button').first().waitFor();
  await mobilePage.getByText('All times in America/New_York', { exact: true }).waitFor();
  await assertNoOverflow(mobilePage);
  await mobilePage.screenshot({
    path: fileURLToPath(new URL('student-mobile.png', artifactDirectory)),
    fullPage: true,
  });
  await signOut(mobilePage);
  await login(mobilePage, 'Maya', 'Tutor');
  await mobilePage.getByRole('button', { name: 'Manage availability' }).click();
  await mobilePage.getByLabel('Start time').waitFor();
  await assertNoOverflow(mobilePage);
  await mobilePage.screenshot({
    path: fileURLToPath(new URL('tutor-mobile.png', artifactDirectory)),
    fullPage: true,
  });
  const nextYear = new Date().getFullYear() + 1;
  const firstMarchDay = new Date(Date.UTC(nextYear, 2, 1)).getUTCDay();
  const springDate = `${nextYear}-03-${String(8 + ((7 - firstMarchDay) % 7)).padStart(2, '0')}`;
  await mobilePage.getByLabel('Appointment date').fill(springDate);
  const springTimes = await mobilePage
    .getByLabel('Start time')
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.equal(
    springTimes.length,
    46,
    'The spring DST gap must not produce nonexistent local times.',
  );
  assert.ok(!springTimes.includes('02:00') && !springTimes.includes('02:30'));
  await mobile.close();

  const quarterHourZone = await browser.newContext({ timezoneId: 'Asia/Kathmandu' });
  const quarterHourPage = await quarterHourZone.newPage();
  quarterHourPage.on('pageerror', (error) => errors.push(error.message));
  await quarterHourPage.goto(frontendUrl);
  await login(quarterHourPage, 'Maya', 'Tutor');
  await quarterHourPage.getByRole('button', { name: 'Manage availability' }).click();
  await quarterHourPage.getByLabel('Start time').waitFor();
  const quarterHourTimes = await quarterHourPage
    .getByLabel('Start time')
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.equal(quarterHourTimes.length, 48);
  assert.ok(
    quarterHourTimes.every((time) => time.endsWith(':15') || time.endsWith(':45')),
    'Quarter-hour zones must still yield UTC half-hour boundaries.',
  );
  await quarterHourZone.close();
  assert.deepEqual(errors, [], 'No unhandled browser errors.');
  console.log(
    'Real-browser smoke passed: Student/Tutor flows, PostgreSQL booking and cancellation, Tutor creation/closure, real 409 conflict, dialog keyboard navigation and focus restoration, session restore/logout, desktop/mobile layout, and three timezones including DST and quarter-hour boundaries.',
  );
  console.log('Screenshots saved in .local/phase-2-browser/.');
} finally {
  await browser.close();
}
