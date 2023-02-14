import { Probes, Sinks } from './component'
import { parse } from './config'
import { logger } from './logger'
import { CPUProbe } from './probes/cpu'
import { DiskProbe } from './probes/disk'
import { LoadProbe } from './probes/load'
import { MemoryProbe } from './probes/memory'
import { PingProbe } from './probes/ping'
import { CloudWatchSink } from './sinks/cloudwatch'
import { ConsoleSink } from './sinks/console'

import type { Probe, Sink } from './index'

const log = logger('main')
logger.logLevel = 'TRACE'

async function main(file: string): Promise<void> {
  const { config, dimensions, probes: probeDefs, sinks: sinkDefs } = await parse(file)
  void config

  // initialize all known sinks
  const sinks: Sink[] = []
  for (const def of sinkDefs) {
    const { sink: type } = def
    let sink: Sink

    switch (type) {
      case 'console': sink = new ConsoleSink(); break
      case 'cloudwatch': sink = new CloudWatchSink(); break
      default: throw new Error(`Unknown sink "${type}"`)
    }

    await sink.init(def)
    sinks.push(sink)
  }

  // combine all initialized sinks
  const sink = new Sinks(sinks)

  // initialize all known probes
  const probes: Probe[] = []
  for (const def of probeDefs) {
    const { probe: type } = def
    let probe: Probe

    switch (type) {
      case 'cpu': probe = new CPUProbe(); break
      case 'disk': probe = new DiskProbe(); break
      case 'load': probe = new LoadProbe(); break
      case 'memory': probe = new MemoryProbe(); break
      case 'ping': probe = new PingProbe(); break
      default: throw new Error(`Unknown probe "${type}"`)
    }

    // merge dimensions for the probe
    def.dimensions = { ...def.dimensions, ...dimensions }

    // initialize and push
    await probe.init(def, sink)
    probes.push(probe)
  }

  // combine all initialized probes
  const probe = new Probes(probes)

  // start all sinks and probes
  await sink.start()
  await probe.start()

  // run our main polling loop
  setInterval(() => probe.poll(), 10000)
}

main('./config.yml').catch(log.fatal)
