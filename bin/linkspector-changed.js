#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { parse, stringify } from 'yaml'
import { check, installBrowser } from './shared.js'

function parseArgv(argv) {
  const options = { config: '.linkspector.yml', browser: true, files: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '-c' || argument === '--config') {
      index += 1
      options.config = argv[index]
    } else if (argument === '--no-browser-install') {
      options.browser = false
    } else {
      options.files.push(argument)
    }
  }
  return options
}

const options = parseArgv(process.argv.slice(2))

// pre-commit skips a hook whose file list is empty, so this only happens when a
// caller invokes the wrapper directly. Checking nothing is the honest answer;
// falling back to the whole tree would turn "I touched no markdown" into a sweep.
if (options.files.length === 0) {
  process.exit(0)
}

let config
try {
  config = parse(readFileSync(options.config, 'utf8')) ?? {}
} catch (error) {
  console.error(`linkspector-changed: cannot read ${options.config}: ${error.message}`)
  process.exit(1)
}

const extensions = config.fileExtensions ?? ['md']
const files = options.files.filter((file) => extensions.includes(extname(file).slice(1).toLowerCase()))

if (files.length === 0) {
  process.exit(0)
}

// `dirs` and `files` are alternatives, and leaving both in place would check the
// whole tree alongside the list we were given. Everything else in the config -
// the ignore patterns, the timeout, the exclusions, useGitIgnore - is carried
// over untouched and still applies to an explicit file list.
delete config.dirs
config.files = files

const directory = mkdtempSync(join(tmpdir(), 'linkspector-changed-'))
const generated = join(directory, 'linkspector.yml')
writeFileSync(generated, stringify(config))

try {
  if (options.browser) {
    installBrowser()
  }
  process.exit(await check(generated))
} finally {
  rmSync(directory, { recursive: true, force: true })
}
