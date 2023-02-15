import { CloudWatchSink } from './sinks/cloudwatch'
import { ConsoleSink } from './sinks/console'

import type { Sink } from './types'

export * from './sinks/abstract'
export { CloudWatchSink } from './sinks/cloudwatch'
export { ConsoleSink } from './sinks/console'

export function createSink(type: string): Sink {
  switch (type) {
    case 'console': return new ConsoleSink(); break
    case 'cloudwatch': return new CloudWatchSink(); break
    default: throw new Error(`Unknown sink "${type}"`)
  }
}
