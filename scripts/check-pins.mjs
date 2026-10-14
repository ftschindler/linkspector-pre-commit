#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const linkspector = manifest.dependencies['@umbrelladocs/linkspector']
const puppeteer = manifest.dependencies.puppeteer

const failures = []

for (const [name, version] of [['@umbrelladocs/linkspector', linkspector], ['puppeteer', puppeteer]]) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    failures.push(`${name} is "${version}", which is a range rather than a pin`)
  }
}

// linkspector declares its own caret range on puppeteer. Pinning outside it
// installs two copies and leaves which one runs to npm's resolution, which is
// the opposite of pinning. This is the check the guide asks a human to do.
const declared = execFileSync('npm', ['view', `@umbrelladocs/linkspector@${linkspector}`, 'dependencies.puppeteer'], {
  encoding: 'utf8',
}).trim()

const satisfied = execFileSync(
  process.execPath,
  ['-e', `process.stdout.write(String(require('semver').satisfies("${puppeteer}", "${declared}")))`],
  { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname },
).trim()

if (satisfied !== 'true') {
  failures.push(`puppeteer ${puppeteer} is outside linkspector ${linkspector}'s declared range ${declared}`)
}

// The Chrome revision is a constant inside puppeteer rather than anything the
// pin states, so the README's claim about it can only be checked against the
// installed package. An unchecked mapping is two opaque numbers and no way to
// tell whether they still agree.
const revisions = require('puppeteer-core/lib/cjs/puppeteer/revisions.js')
const chrome = revisions.PUPPETEER_REVISIONS.chrome
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

if (!readme.includes(chrome)) {
  failures.push(`puppeteer ${puppeteer} carries Chrome ${chrome}, which the README does not mention`)
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`pins: ${failure}`)
  }
  process.exit(1)
}

console.log(`pins: linkspector ${linkspector}, puppeteer ${puppeteer} (${declared}), Chrome ${chrome}`)
