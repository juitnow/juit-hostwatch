import { ValidationErrorBuilder } from 'justus'

import { Probes, Sinks } from './component'
import { parse } from './config'
import { createProbe } from './probes'
import { createSink } from './sinks'
import { logger } from './utils/logger'

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
      try {
        const sink = createSink(def.sink)
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
      try {
        const probe = createProbe(def.probe)

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
