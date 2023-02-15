import { Probes, Sinks } from './component'
import { parse } from './config'
import { logger } from './logger'
import { CPUProbe } from './probes/cpu'
import { DiskProbe } from './probes/disk'
import { LoadProbe } from './probes/load'
import { MemoryProbe } from './probes/memory'
import { PingProbe } from './probes/ping'
import { RegExpProbe } from './probes/regexp'
import { CloudWatchSink } from './sinks/cloudwatch'
import { ConsoleSink } from './sinks/console'

import type { Probe, Sink } from './index'

const log = logger('main')
logger.logLevel = 'DEBUG'

// our state: probes, sinks and poller interval
interface RunningState {
  interval: NodeJS.Timer,
  probes: Probes,
  sinks: Sinks,
}

// handler for stopping...
async function stop(state: RunningState): Promise<void> {
  const { interval, probes, sinks } = state

  log.info('Stopping...')

  // force exit in 5 seconds (with an error code)
  setTimeout(() => process.exit(2), 5000).unref()

  // clear and unref the main poller loop
  clearInterval(interval.unref())

  // stop all probes and sinks
  try {
    await sinks.stop()
    await probes.stop()
    process.exitCode = 0
    log.info('Stopped, goodbye!')
  } catch (error) {
    log.fatal('Error stopping', error)
    process.exitCode = 1
  }
}

// handler for starting
async function start(file: string): Promise<RunningState> {
  const { config, dimensions, probes: probeDefs, sinks: sinkDefs } = await parse(file)

  logger.logLevel = config.logLevel
  logger.logTimes = config.logTimes
  logger.logColors = config.logColors

  // initialize all known sinks
  const sinkInstances: Sink[] = []
  for (const def of sinkDefs) {
    const { sink: type } = def
    let sink: Sink

    switch (type) {
      case 'console': sink = new ConsoleSink(); break
      case 'cloudwatch': sink = new CloudWatchSink(); break
      default: throw new Error(`Unknown sink "${type}"`)
    }

    await sink.init(def)
    sinkInstances.push(sink)
  }

  // combine all initialized sinks
  const sinks = new Sinks(sinkInstances)

  // initialize all known probes
  const probeInstances: Probe[] = []
  for (const def of probeDefs) {
    const { probe: type } = def
    let probe: Probe

    switch (type) {
      case 'cpu': probe = new CPUProbe(); break
      case 'disk': probe = new DiskProbe(); break
      case 'load': probe = new LoadProbe(); break
      case 'memory': probe = new MemoryProbe(); break
      case 'ping': probe = new PingProbe(); break
      case 'regexp': probe = new RegExpProbe(); break
      default: throw new Error(`Unknown probe "${type}"`)
    }

    // merge dimensions for the probe
    def.dimensions = { ...def.dimensions, ...dimensions }

    // initialize and push
    await probe.init(def, sinks)
    probeInstances.push(probe)
  }

  // combine all initialized probes
  const probes = new Probes(probeInstances)

  // start all sinks and probes
  try {
    await sinks.start()
    await probes.start()
  } catch (error) {
    await sinks.stop()
    await probes.stop()
    throw error
  }

  // run our main polling loop
  probes.poll() // first hit is always free... check for errors, basically
  const interval = setInterval(() => probes.poll(), config.pollInterval)

  // return our running state
  return { probes, sinks, interval }
}

start('./config.yml')
    // register our signal handlers (SIGTERM/CTRL-C)
    .then((state: RunningState) => {
      process.on('SIGINT', () => stop(state))
      process.on('SIGTERM', () => stop(state))
    })
    .catch((error: any) => {
      log.fatal('Fatal error initializing', error)
      setTimeout(() => process.exit(1), 5000).unref()
      process.exitCode = 1
    })
