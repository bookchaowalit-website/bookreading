import { expect, test } from '@playwright/test';

test.describe('BookReading public landing page', () => {
  test('renders the Thai landing page and primary sign-up entry point', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/BookReading/);
    await expect(page.getByRole('heading', { name: /อ่านนิยายจีนแปลไทย/ })).toBeVisible();
    await expect(page.getByText('ใหม่! รองรับการแปลด้วย AI ที่แม่นยำขึ้น', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'คุณสมบัติเด่น', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'เริ่มอ่านฟรี', exact: true }).first()).toHaveAttribute(
      'href',
      '/register',
    );
  });

  test('exposes public login and registration routes', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/BookReading/);
    await expect(page.getByRole('heading', { name: 'เข้าสู่ระบบ', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'สมัครสมาชิก', exact: true })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});
