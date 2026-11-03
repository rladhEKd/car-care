import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3001", channel: "chrome", headless: true, locale: "ko-KR", timezoneId: "Asia/Seoul", trace: "retain-on-failure" },
  webServer: { command: "npm.cmd run start -- --hostname 127.0.0.1 --port 3001", url: "http://127.0.0.1:3001", reuseExistingServer: true, timeout: 30000 },
});
