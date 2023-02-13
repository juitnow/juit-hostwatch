import { arrayOf, object, objectOf, optional, string, validate } from 'justus'

import type { Validation, InferValidation } from 'justus'
import type { Sink, Unit } from './index'

export interface Probe {
  configure(configuration: Record<string, any>): Promise<void>
  poll(sink: Sink): void
}


export interface ProbeMetrics {
  [ k: string ]: Unit
}

export type PollData<Metrics extends ProbeMetrics> = {
  [ key in keyof Metrics ]?: number | undefined
}

export abstract class AbstractProbe<
  Metrics extends ProbeMetrics,
  V extends Validation,
> implements Probe {
  private readonly _metrics: Metrics
  private readonly _validator: V
  private readonly _dimensions: Record<string, string>

  private _name: string
  private _publishing: Set<string>
  private _sampling: boolean = false

  constructor(name: string, metrics: Metrics, validator: V) {
    this._name = name
    this._metrics = metrics
    this._validator = validator
    this._publishing = new Set(Object.keys(metrics))
    this._dimensions = {}

    if (this._publishing.size === 0) {
      throw new Error(`No metrics available in probe "${this._name}`)
    }
  }

  poll(sink: Sink): void {
    if (this._sampling) return
    this._sampling = true

    setImmediate(async () => {
      try {
        const metrics = await this.sample()
        console.log('GOTTEN', metrics)

        for (const [ name, value ] of Object.entries(metrics)) {
          // Strip metrics with no valid numerical value
          if ((value == null) || isNaN(value)) continue

          // Only re-publish metrics that should be published
          if (this._publishing.has(name)) {
            const timestamp = Date.now()
            const dimensions = { ...this._dimensions }
            const unit = this._metrics[name]

            sink(null, { name, unit, value, timestamp, dimensions })
          }
        }
      } catch (cause: any) {
        const error = new Error(`Error polling "${this._name}"`, { cause })
        sink(error)
      } finally {
        this._sampling = false
      }
    })
  }

  configure(configuration: any): Promise<void> {
    const {
      config,
      name = this._name,
      publish = Object.keys(this._metrics),
      dimensions = this._dimensions,
    } = validate(object({
      config: this._validator,
      name: optional(string({ minLength: 1 })),
      publish: optional(arrayOf(string)),
      dimensions: optional(objectOf(string)),
    }), configuration)

    // Set the name of this probe
    this._name = name

    // Check the metrics to publish
    if (publish.length === 0) {
      throw new Error(`No metrics published for probe "${this._name}`)
    }

    // Check each published metric
    this._publishing = new Set<string>()
    for (const metric of publish) {
      if (this._metrics[metric]) {
        this._publishing.add(metric)
      } else {
        const extra = `\n  Known metrics:\n  - ${Object.keys(this._metrics).join('\n  - ')}`
        throw new Error(`Unknown metric "${metric}" for probe "${this._name}".${extra}`)
      }
    }

    // Merge dimensions
    Object.assign(this._dimensions, dimensions )

    // Call init
    return this.init(config)
  }

  protected abstract init(config: InferValidation<V>): Promise<void>
  protected abstract sample(): Promise<PollData<Metrics>>
}
