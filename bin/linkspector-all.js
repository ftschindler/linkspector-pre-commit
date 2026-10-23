#!/usr/bin/env node
import { check, installBrowser } from './shared.js'

function parseArgv(argv) {
  const options = { config: '.linkspector.yml', browser: true }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '-c' || argument === '--config') {
      index += 1
      options.config = argv[index]
    } else if (argument === '--no-browser-install') {
      options.browser = false
    }
  }
  return options
}

const options = parseArgv(process.argv.slice(2))

if (options.browser) {
  installBrowser()
}

process.exit(await check(options.config))
