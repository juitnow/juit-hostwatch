import { ValidationErrorBuilder } from 'justus'

import { Probes, Sinks } from './component'
import { parse } from './config'
import { logger } from './logger'
import { AlcatelRouterProbe } from './probes/alcatel'
import { CPUProbe } from './probes/cpu'
import { DiskProbe } from './probes/disk'
import { LoadProbe } from './probes/load'
import { MemoryProbe } from './probes/memory'
import { PingProbe } from './probes/ping'
import { RegExpProbe } from './probes/regexp'
import { CloudWatchSink } from './sinks/cloudwatch'
import { ConsoleSink } from './sinks/console'

import type { Component, HostWatchDefinition, Probe, Sink } from './types'

// our state: probes, sinks and poller interval
interface HostWatchState {
  interval: number,
  probes: Probes,
  sinks: Sinks,
}

export class HostWatch implements Component {
  private _state?: HostWatchState
  private _timer?: NodeJS.Timer

  async init(file: string): Promise<void>
  async init(definition: HostWatchDefinition): Promise<void>
  async init(arg: string | HostWatchDefinition): Promise<void> {
    if (this._state) throw new Error('Hostwatch already initialized')

    const {
      config,
      dimensions,
      sinks: sinkDefinitions,
      probes: probeDefinitions,
    } = typeof arg === 'string' ? await parse(arg) : arg

    // logger configuration
    logger.logLevel = config.logLevel
    logger.logTimes = config.logTimes
    logger.logColors = config.logColors

    // validation error builder for sub configurations
    const errorBuilder = new ValidationErrorBuilder()

    // initialize all known sinks
    const sinkInstances: Sink[] = []
    for (let i = 0; i < sinkDefinitions.length; i ++) {
      const def = sinkDefinitions[i]
      const { sink: type } = def
      try {
        let sink: Sink

        switch (type) {
          case 'console': sink = new ConsoleSink(); break
          case 'cloudwatch': sink = new CloudWatchSink(); break
          default: throw new Error(`Unknown sink "${type}"`)
        }

        await sink.init(def)
        sinkInstances.push(sink)
      } catch (error) {
        errorBuilder.record(error, 'sinks', i)
      }
    }

    // assert no errors from sinks
    errorBuilder.assert(void 0)

    // combine all initialized sinks
    const sinks = new Sinks(sinkInstances)

    // initialize all known probes
    const probeInstances: Probe[] = []
    for (let i = 0; i < probeDefinitions.length; i ++) {
      const def = probeDefinitions[i]
      const { probe: type } = def

      try {
        let probe: Probe

        switch (type) {
          case 'alcatel': probe = new AlcatelRouterProbe(); break
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
      } catch (error) {
        errorBuilder.record(error, 'probes', i)
      }
    }

    // assert no errors from probes
    errorBuilder.assert(void 0)

    // combine all initialized probes
    const probes = new Probes(probeInstances)

    // store the state
    this._state = { sinks, probes, interval: config.pollInterval }
  }

  async start(): Promise<void> {
    if (this._timer) throw new Error('Hostwatch already started')
    if (! this._state) throw new Error('Hostwatch not initialized')

    const { probes, sinks, interval } = this._state

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
    this._timer = setInterval(() => probes.poll(), interval)
  }

  async stop(): Promise<void> {
    if (! this._state) return
    if (! this._timer) return

    const { probes, sinks } = this._state

    // clear and unref the main poller loop
    clearInterval(this._timer.unref())

    // stop all probes and sinks
    await sinks.stop()
    await probes.stop()
  }
}
