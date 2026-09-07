/**
 * Test accounts and shared constants.
 * Override via env vars so credentials need not be committed in CI.
 */
export const ADMIN_USER = {
  email: process.env.TEST_ADMIN_EMAIL ?? 'sontvh@aipower.com.vn',
  password: process.env.TEST_ADMIN_PASSWORD ?? 'Sontran280900@',
}

/** UI strings from the app's ja locale (features/auth/locales/ja.ts). */
export const JA = {
  emailLabel: 'メールアドレス',
  passwordLabel: 'パスワード',
  submit: 'ログイン',
  dashboardTitle: 'ダッシュボード',
} as const
