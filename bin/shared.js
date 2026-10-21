#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export function binary(packageName) {
  // Resolving the package's own `bin` entry and running it with this node,
  // rather than reaching for `node_modules/.bin`, because that directory holds
  // shell shims on Linux and `.cmd` files on Windows, and neither is a path
  // `node` can execute directly.
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const entry = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin)[0]
  return join(dirname(manifestPath), entry)
}

export function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', ...options })
}

export function installBrowser() {
  // Naming no version on purpose: the pinned puppeteer resolves its own, so this
  // cannot drift from the pin the way a literal `chrome@...` does. It is a no-op
  // once the browser is cached, and it is what makes the check work in a restored
  // hook environment whose postinstall never ran.
  const installed = run(binary('puppeteer'), ['browsers', 'install', 'chrome'], { stdio: 'pipe' })
  if (installed.status !== 0) {
    process.stderr.write(installed.stderr?.toString() ?? '')
    console.error('linkspector-pre-commit: could not install the browser puppeteer launches')
    process.exit(installed.status ?? 1)
  }
}

export async function check(configPath) {
  const directory = mkdtempSync(join(tmpdir(), 'linkspector-browser-'))
  try {
    const checked = run(binary('@umbrelladocs/linkspector'), ['check', '-c', configPath], {
      env: await browserEnvironment(directory),
    })
    return checked.status ?? 1
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

export async function browserEnvironment(directory, where = {}) {
  // Left exactly as inherited wherever Chrome can sandbox itself, and wherever
  // the caller already named an executable of their own: a wrapper that
  // silently swapped the browser out from under a deliberate
  // `PUPPETEER_EXECUTABLE_PATH` would be the worse surprise.
  const { platform = process.platform, environment = process.env, restricted = usernsRestricted() } = where
  if (platform !== 'linux' || !restricted || environment.PUPPETEER_EXECUTABLE_PATH) {
    return environment
  }
  return { ...environment, PUPPETEER_EXECUTABLE_PATH: await sandboxlessBrowser(directory) }
}

//: Where the kernel records that unprivileged user namespaces are AppArmor-restricted,
//: which is the default on Ubuntu 23.10 and later and absent on every other system.
const USERNS_RESTRICTION = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns'

export function usernsRestricted(path = USERNS_RESTRICTION) {
  // Chrome's sandbox is built out of an unprivileged user namespace. Where the
  // kernel refuses to hand one out, it does not start degraded: it aborts with
  // "No usable sandbox!" before a single link is checked.
  try {
    return readFileSync(path, 'utf8').trim() === '1'
  } catch {
    return false
  }
}

export async function sandboxlessBrowser(directory) {
  // linkspector hardcodes the args it launches Chrome with, so the only seam a
  // wrapper has is the executable itself. This is a shim that execs the real
  // one with `--no-sandbox` in front of whatever linkspector passes.
  //
  // A shell script rather than a flag because there is no flag, and Linux only
  // because this restriction is Linux's. The sandbox is given up exactly where
  // Chrome cannot have one anyway, and kept everywhere it can.
  const chrome = await puppeteerExecutable()
  const shim = join(directory, 'chrome-no-sandbox')
  writeFileSync(shim, `#!/bin/sh\nexec ${JSON.stringify(chrome)} --no-sandbox "$@"\n`)
  chmodSync(shim, 0o755)
  return shim
}

export async function puppeteerExecutable() {
  // The pinned puppeteer's own answer, so the shim points at the browser the
  // pin decides on rather than at a path this package would have to keep in
  // step with it by hand.
  const puppeteer = await import('puppeteer')
  return puppeteer.default.executablePath()
}
