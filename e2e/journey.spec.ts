import { test, expect } from '@playwright/test';
test('sample replay, debrief, evidence, export and deletion', async ({ page }) => {
  await page.goto('/');
  const existing = await page.request.get('/api/sessions');
  for (const item of await existing.json())
    await page.request.delete(`/api/sessions/${item.id}`, { headers: { 'x-hotseat': '1' } });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'A better pitch starts with a hard question.' }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/images/home.png', fullPage: true });
  await page.getByRole('button', { name: 'Watch a sample', exact: true }).click();
  await expect(page.getByText('SAMPLE REPLAY · NO LIVE INFERENCE')).toBeVisible();
  await expect(
    page.getByText('You have three pilots. What evidence says these shops will actually pay?', {
      exact: true,
    }),
  ).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: 'docs/images/room.png', fullPage: true });
  await page.getByRole('button', { name: 'See the debrief' }).click();
  await expect(
    page.getByRole('heading', { name: 'Interest is not a purchase commitment' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'See the moment' }).first().click();
  await expect(page.locator('#turn-sample-1')).toHaveClass(/highlight/);
  await page.screenshot({ path: 'docs/images/debrief.png', fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Markdown' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/\.md$/);
  await page.getByRole('button', { name: 'Retry answer' }).first().click();
  await expect(page.locator('.notice[role=alert]')).toContainText('OpenAI key');
  await page.getByRole('button', { name: 'All sessions' }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete Gather session' }).first().click();
  await expect(page.getByRole('button', { name: 'Delete Gather session' })).toHaveCount(0);
});
test('setup controls explain data handling and require reviewed context', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What are you pitching?' })).toBeVisible();
  await page.getByRole('button', { name: 'Use an example' }).click();
  await expect(page.getByLabel('Your startup, in your own words')).toContainText('Gather');
  await page.getByRole('button', { name: /Intense/ }).click();
  await page.getByRole('button', { name: '12 min' }).click();
  await expect(page.getByRole('button', { name: 'Take the hot seat' })).toBeDisabled();
  await expect(
    page.getByText('This is a simulated panel with synthetic voices.', { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/images/setup.png', fullPage: true });
});
test('small screens and reduced motion remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start a session', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('session expiry opens the debrief automatically', async ({ page }) => {
  const sampleResponse = await page.request.post('/api/sample', { headers: { 'x-hotseat': '1' } });
  const session = await sampleResponse.json();
  session.mode = 'live';
  session.status = 'active';
  await page.route(`**/api/sessions/${session.id}`, (route) => route.fulfill({ json: session }));
  await page.route(`**/api/sessions/${session.id}/events`, (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ type: 'state', status: 'completed', elapsedMs: 480000 })}\n\n`,
    }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: /Gather.*Sample replay/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Keep the clarity. Sharpen the answer.' }),
  ).toBeVisible();
  await page.request.delete(`/api/sessions/${session.id}`, { headers: { 'x-hotseat': '1' } });
});

test('real session events arrive immediately through the web proxy', async ({ page }) => {
  const response = await page.request.post('/api/sample', { headers: { 'x-hotseat': '1' } });
  const session = await response.json();
  await page.goto('/');
  const event = await page.evaluate(
    (id) =>
      new Promise<{ type: string; status: string }>((resolve, reject) => {
        const stream = new EventSource(`/api/sessions/${id}/events`);
        const timeout = setTimeout(() => {
          stream.close();
          reject(new Error('Session events were buffered'));
        }, 3000);
        stream.onmessage = (message) => {
          clearTimeout(timeout);
          stream.close();
          resolve(JSON.parse(message.data));
        };
      }),
    session.id,
  );
  expect(event).toMatchObject({ type: 'state', status: 'completed' });
  await page.request.delete(`/api/sessions/${session.id}`, { headers: { 'x-hotseat': '1' } });
});

test('panel previews work with a keyboard and keep their selected state', async ({ page }) => {
  await page.goto('/');
  const customer = page.getByRole('button', { name: 'Maya, the customer', exact: true });
  await customer.focus();
  await page.keyboard.press('Enter');
  await expect(customer).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByText('I already have a way of doing this. Why would I switch?'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Alex, the investor', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Jordan, the operator', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('You have six weeks. What are you actually going to ship?'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start a session', exact: true }).click();
  await expect(page.locator('#workspace')).toBeFocused();
  await page.getByRole('button', { name: /Intense/ }).click();
  await expect(page.getByRole('button', { name: /Intense/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '5 min' }).click();
  await expect(page.getByRole('button', { name: '5 min' })).toHaveAttribute('aria-pressed', 'true');
});

test('studio, room and feedback fit phone and tablet widths', async ({ page }) => {
  for (const width of [375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Watch a sample', exact: true }).click();
    await expect(page.getByRole('button', { name: 'See the debrief' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'See the debrief' }).click();
    await expect(
      page.getByRole('heading', { name: 'Interest is not a purchase commitment' }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
