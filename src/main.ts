import { detailed as yargs } from 'yargs-parser'
import { ValidationError } from 'justus'

import { HostWatch } from './hostwatch'
import { logger } from './utils/logger'

import type { Configuration } from './types'

const log = logger('main')

interface MainOptions {
  file: string,
  test: boolean,
  overrides?: Partial<Configuration>
}

async function main(options: MainOptions): Promise<void> {
  log.info('HostWatch starting...')
  const hostwatch = new HostWatch(options.overrides)
  await hostwatch.init(options.file)
  if (options.test) return

  await hostwatch.start()

  function stop(): void {
    log.info('Stopping...')
    setTimeout(() => process.exit(2), 5000).unref()
    hostwatch.stop() .then(() => {
      log.info('HostWatch stopped, goodbye...')
      process.exitCode = 0
    }, (error) => log.fatal('Error stopping', error))
  }

  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

/* ========================================================================== *
 * COMMAND LINE ARGUMENTS                                                     *
 * ========================================================================== */

/* Show help and exit with exit code */
function help(exitCode = 0): never {
  // eslint-disable-next-line no-console
  console.log(`${exitCode ? '\n' : ''}Usage: hostwatch [-...] config.yml

  -h --help     Show this help
  -t --test     Test the configuration file, but don't start
  -v --verbose  Increase verbosity
  -q --quiet    Be more quiet

  config.yml    The configuration file to use
`)
  process.exit(exitCode)
}

/* Parse command line arguments */
const args = yargs(process.argv.slice(2), {
  configuration: { 'strip-aliased': true },
  alias: {
    help: [ 'h' ],
    test: [ 't' ],
    quiet: [ 'q' ],
    verbose: [ 'v' ],
  },
  boolean: [ 'help', 'test' ],
  count: [ 'verbose', 'quiet' ],
})

/* Process parsed arguments */
let test = false
let files: string[] = []
let verbosity: number | null = null
for (const [ key, value ] of Object.entries(args.argv)) {
  switch (key) {
    case 'help': help(0); break
    case 'verbose': verbosity = (verbosity || 0) - value; break
    case 'quiet': verbosity = (verbosity || 0) + value; break
    case 'test': test = true; break
    case '_': files = value; break
    default:
      log.fatal(`Unknown option "${key.length > 1 ? '--' : '-'}${key}"`)
      help(1)
  }
}

/* Check log verbosity */
switch (verbosity) {
  case null: break
  case -2: logger.logLevel = 'TRACE'; break
  case -1: logger.logLevel = 'DEBUG'; break
  case 0: logger.logLevel = 'INFO'; break
  case 1: logger.logLevel = 'WARN'; break
  case 2: logger.logLevel = 'ERROR'; break
  case 3: logger.logLevel = 'FATAL'; break
  case 4: logger.logLevel = 'OFF'; break
  default: logger.logLevel = verbosity > 4 ? 'OFF' : 'TRACE'
}

/* Check config file */
if (files.length < 1) {
  log.fatal('No configuration file specified')
  help(1)
} else if (files.length > 1) {
  log.fatal('More than one configuration file specified')
  help(1)
}
const file = files[0]

/* Config overrides */
const overrides: Partial<Configuration> = {}
if (verbosity != null) overrides.logLevel =logger.logLevel

main({ file, test, overrides })
    .then(() => process.exitCode = 0, (error) => {
      if (error instanceof ValidationError) {
        log.fatal('Configuration error:', error.message)
      } else {
        log.fatal('Fatal error initializing', error)
      }

      setTimeout(() => process.exit(2), 5000).unref()
      process.exitCode = 1
    })
