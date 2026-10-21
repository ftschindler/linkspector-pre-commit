import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { browserEnvironment, sandboxlessBrowser, usernsRestricted } from '../bin/shared.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const changed = join(root, 'bin', 'linkspector-changed.js')

function wrapper(args, options = {}) {
  return spawnSync(process.execPath, [changed, ...args], { cwd: root, encoding: 'utf8', ...options })
}

test('a file whose links resolve passes', () => {
  assert.equal(wrapper(['test/fixtures/good.md']).status, 0)
})

test('a file with a dead link fails, and names the file', () => {
  const result = wrapper(['test/fixtures/broken.md'])
  assert.equal(result.status, 1)
  assert.match(result.stdout, /broken\.md/)
})

test('a dead link in a file that was not passed is not checked', () => {
  assert.equal(wrapper(['test/fixtures/good.md']).status, 0)
})

test('ignorePatterns from the project config survive the rewrite', () => {
  assert.equal(wrapper(['test/fixtures/ignored.md']).status, 0)
})

test('no files means no check, rather than a sweep', () => {
  assert.equal(wrapper([]).status, 0)
})

test('a file outside fileExtensions is dropped before linkspector sees it', () => {
  const result = wrapper(['package.json'])
  assert.equal(result.status, 0)
  assert.doesNotMatch(result.stdout, /does not have the correct extension/)
})

test('a missing config fails loudly rather than checking nothing', () => {
  const result = wrapper(['-c', 'no-such-config.yml', 'test/fixtures/good.md'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /cannot read/)
})

test('the generated config keeps every key except dirs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'linkspector-pre-commit-test-'))
  const configPath = join(directory, 'config.yml')
  writeFileSync(
    configPath,
    ['dirs:', '- .', 'fileExtensions:', '- md', 'timeout: 4321', 'retryCount: 7', ''].join('\n'),
  )

  const result = wrapper(['-c', configPath, '--no-browser-install', 'test/fixtures/good.md'])
  assert.equal(result.status, 0)

  rmSync(directory, { recursive: true, force: true })
})

test('the README states the Chrome revision the pinned puppeteer carries', async () => {
  const { PUPPETEER_REVISIONS } = await import('puppeteer-core/lib/cjs/puppeteer/revisions.js')
  assert.match(readFileSync(join(root, 'README.md'), 'utf8'), new RegExp(PUPPETEER_REVISIONS.chrome))
})

test('a kernel that refuses user namespaces gets a Chrome launched without the sandbox', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'linkspector-pre-commit-test-'))
  try {
    const environment = await browserEnvironment(directory, {
      platform: 'linux',
      restricted: true,
      environment: {},
    })
    const shim = readFileSync(environment.PUPPETEER_EXECUTABLE_PATH, 'utf8')
    assert.match(shim, /--no-sandbox/)
    assert.match(shim, /chrome/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a kernel that allows them is left with the sandbox it can have', async () => {
  const environment = await browserEnvironment('unused', {
    platform: 'linux',
    restricted: false,
    environment: { SOMETHING: 'else' },
  })
  assert.deepEqual(environment, { SOMETHING: 'else' })
})

test('a browser the caller named themselves is never swapped out', async () => {
  const theirs = { PUPPETEER_EXECUTABLE_PATH: '/opt/their/chrome' }
  const environment = await browserEnvironment('unused', { platform: 'linux', restricted: true, environment: theirs })
  assert.deepEqual(environment, theirs)
})

test('nothing is done to a platform that has no such restriction', async () => {
  const environment = await browserEnvironment('unused', { platform: 'win32', restricted: true, environment: {} })
  assert.deepEqual(environment, {})
})

test('the restriction is read from the kernel, and absent everywhere it does not exist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'linkspector-pre-commit-test-'))
  try {
    const restricted = join(directory, 'restricted')
    const allowed = join(directory, 'allowed')
    writeFileSync(restricted, '1\n')
    writeFileSync(allowed, '0\n')

    assert.equal(usernsRestricted(restricted), true)
    assert.equal(usernsRestricted(allowed), false)
    assert.equal(usernsRestricted(join(directory, 'no-such-file')), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the shim it writes really launches the browser linkspector then drives', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'linkspector-pre-commit-test-'))
  try {
    const shim = await sandboxlessBrowser(directory)
    const result = wrapper(['--no-browser-install', 'test/fixtures/good.md'], {
      env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: shim },
    })
    assert.equal(result.status, 0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
