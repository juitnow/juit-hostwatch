import { AbstractComponent } from '../component'

import type { Validation } from 'justus'
import type { Probe, ProbeDefinition, Sink, Unit } from '../index'

export interface ProbeMetrics {
  [ k: string ]: Unit
}

export type PollData<Metrics extends ProbeMetrics> = {
  [ key in keyof Metrics ]?: number | undefined
}

export abstract class AbstractProbe<
  Metrics extends ProbeMetrics,
  V extends Validation,
> extends AbstractComponent<V> implements Probe {
  // from constructor
  private readonly _metrics: Metrics

  // from init
  private _dimensions: Readonly<Record<string, string>> = {}
  private _publishing: Readonly<Set<string>> = new Set<string>()
  private _sink?: Sink

  // for poll
  private _sampling: boolean = false

  protected constructor(name: string, metrics: Metrics, validation: V) {
    super('probe', name, validation)
    this._metrics = metrics
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
            const unit = this._metrics[name]
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
    super.initialize(def)

    // Remember our sink
    this._sink = sink

    // Destructure our definition
    const { publish, dimensions } = def

    // Metrics to publish as a set
    this._publishing = publish.length === 0 ?
      this._publishing = new Set<string>(...Object.keys(this._metrics)) :
      this._publishing = new Set<string>(...publish)

    // Check each published metric
    for (const metric of publish) {
      if (this._metrics[metric]) {
        this._publishing.add(metric)
        continue
      }
      const extra = `\n  Known metrics:\n  - ${Object.keys(this._metrics).join('\n  - ')}`
      throw new Error(`Unknown metric "${metric}" for probe "${this.name}".${extra}`)
    }

    // Merge dimensions
    this._dimensions = dimensions
  }

  protected abstract sample(): PollData<Metrics> | Promise<PollData<Metrics>>
}

export function percent(value: number, total: number): number {
  return total ? value && (value * 100 / total) : NaN
}

export function percentBig(value: bigint, total: bigint): number {
  return total ? Number(value && (value * 100n / total)) : NaN
}