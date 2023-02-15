import { ValidationError } from 'justus'

import { HostWatch } from './hostwatch'
import { logger } from './utils/logger'

const log = logger('main')

async function main(): Promise<number> {
  if (process.argv.length != 3) {
    log.fatal('Usage: hostwatch [config.yml]')
    return 1
  }

  log.info('HostWatch starting...')
  const hostwatch = new HostWatch()
  await hostwatch.init(process.argv[2])
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
  return 0
}

main().then((code) => process.exitCode = code, (error) => {
  if (error instanceof ValidationError) {
    log.fatal('Configuration error:', error.message)
  } else {
    log.fatal('Fatal error initializing', error)
  }

  setTimeout(() => process.exit(2), 5000).unref()
  process.exitCode = 1
})
