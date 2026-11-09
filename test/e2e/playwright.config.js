const { defineConfig } = require('@playwright/test')

const projects = [{ name: 'behaviour', testDir: './specs' }]
// The packaged app only exists on the macOS CI runner, after `npm run dist:mac`. It uses the real
// Peek folder, so it is registered only there; `--list` also registers it so the specs can be checked anywhere.
const { packagedEnabled } = require('./harness/packaged-2b')
if (packagedEnabled || process.argv.includes('--list')) projects.push({ name: 'packaged', testDir: './packaged' })

module.exports = defineConfig({
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  passWithNoTests: true,
  forbidOnly: !!process.env.CI,
  globalSetup: require.resolve('./harness/global-setup.js'),
  outputDir: './results/artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: './report', open: 'never' }],
    ['junit', { outputFile: './results/junit.xml' }]
  ],
  projects
})
