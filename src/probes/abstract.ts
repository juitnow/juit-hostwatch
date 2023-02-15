import { AbstractComponent } from '../component'

import type { Validation } from 'justus'
import type { Probe, ProbeDefinition, Sink, Unit } from '../types'

export interface ProbeMetrics {
  [ k: string ]: Unit
}

export type PollData<Metrics extends ProbeMetrics> = {
  [ key in keyof Metrics ]?: number | undefined
}

export abstract class AbstractProbe<
  M extends ProbeMetrics,
  V extends Validation,
> extends AbstractComponent<V> implements Probe {
  protected readonly metrics: M

  // from init
  private _dimensions: Readonly<Record<string, string>> = {}
  private _publishing: Readonly<Set<string>> = new Set<string>()
  private _sink?: Sink

  // for poll
  private _sampling: boolean = false

  protected constructor(name: string, metrics: M, validation: V) {
    super('probe', name, validation)
    this.metrics = metrics
  }

  poll(): void {
    // Check the sink, first and foremost
    if (! this._sink) throw new Error(`No sink configured for poller "${this.name}`)
    const sink = this._sink

    // If we're already sampling, don't start again
    if (this._sampling) return
    this._sampling = true

    // Always sample decoupled from this event loop
    setImmediate(async () => {
      try {
        const metrics = await this.sample()
        for (const [ name, value ] of Object.entries(metrics)) {
          // Strip metrics with no valid numerical value
          if ((value == null) || isNaN(value)) {
            this.log.trace('Invalid metric value', name, '=>', value)
            continue
          }

          // Only re-publish metrics that should be published
          if (this._publishing.has(name)) {
            const timestamp = Date.now()
            const dimensions = { ...this._dimensions }
            const unit = this.metrics[name]
            this.log.trace('Sinking metric', name, '=>', value, `[${unit}]`)
            sink.sink({ name, unit, value, timestamp, dimensions })
          }
        }
      } catch (error: any) {
        this.log.error(`Error polling "${this.name}"`, error)
      } finally {
        this._sampling = false
      }
    })
  }

  init(def: ProbeDefinition, sink: Sink): void {
    this.configure(def)

    // Remember our sink
    this._sink = sink

    // Destructure our definition
    const { publish, dimensions } = def

    // Metrics to publish as a set
    this._publishing = publish.length === 0 ?
      this._publishing = new Set<string>(Object.keys(this.metrics)) :
      this._publishing = new Set<string>(publish)

    // Check each published metric
    for (const metric of publish) {
      if (this.metrics[metric]) {
        this._publishing.add(metric)
        continue
      }
      const extra = `\n  Known metrics:\n  - ${Object.keys(this.metrics).join('\n  - ')}`
      throw new Error(`Unknown metric "${metric}" for probe "${this.name}".${extra}`)
    }

    // Check that we're publishing at least one metric
    if (this._publishing.size < 1) {
      throw new Error(`No metrics published by probe "${this.name}".`)
    }

    // Log out the metrics we're going to publish
    this.log.debug(`Publishing ${this._publishing.size} metrics:`)
    this._publishing.forEach((m) => this.log.debug('-', m))

    // A "null" diversion value is used to override a default dimension. If
    // we encounter one, we simply strip it out
    const dims: Record<string, string> = this._dimensions = {}
    Object.entries(dimensions).forEach(([ name, value ]) => {
      if (name && value) dims[name] = value
    })
  }

  protected abstract sample(): PollData<M> | Promise<PollData<M>>
}
