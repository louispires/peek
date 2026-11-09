const path = require('path')
const { test, expect } = require('@playwright/test')
const { assertSafeUserData } = require('../harness/userdata-guard')

const appData = path.resolve(path.sep, 'users', 'dev', 'appdata')

test.describe('userData guard', () => {
  test('refuses a missing variable', () => {
    expect(() => assertSafeUserData(undefined, appData)).toThrow('PEEK_E2E_USERDATA is not set')
  })

  test('refuses a relative path', () => {
    expect(() => assertSafeUserData('userData', appData)).toThrow('absolute')
  })

  test('refuses the real Peek folder in any letter case', () => {
    for (const name of ['Peek', 'peek', 'PEEK']) {
      expect(() => assertSafeUserData(path.join(appData, name), appData)).toThrow('real Peek folder')
    }
  })

  test('refuses a folder inside the real Peek folder', () => {
    expect(() => assertSafeUserData(path.join(appData, 'Peek', 'nested'), appData)).toThrow('real Peek folder')
  })

  test('accepts a temp folder and a sibling with a similar name', () => {
    const tmp = path.resolve(path.sep, 'tmp', 'peek-e2e-1', 'userData')
    expect(assertSafeUserData(tmp, appData)).toBe(tmp)
    const sibling = path.join(appData, 'Peek-e2e')
    expect(assertSafeUserData(sibling, appData)).toBe(sibling)
  })
})
