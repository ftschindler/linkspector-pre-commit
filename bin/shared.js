#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

export function check(configPath) {
  const checked = run(binary('@umbrelladocs/linkspector'), ['check', '-c', configPath])
  return checked.status ?? 1
}
