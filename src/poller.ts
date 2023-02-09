import { allowAdditionalProperties, arrayOf, object, optional, string, validate } from 'justus'

import type { Sink, Unit } from './index'
import type { InferValidation, Schema } from 'justus'

export interface Poller {
  configure(configuration: Record<string, any>): Promise<void>
  poll(sink: Sink): void
}


export interface PollerMetrics {
  [ k: string ]: Unit
}

export type PollerData<Metrics extends PollerMetrics> = {
  [ key in keyof Metrics ]?: number | undefined
}

export abstract class AbstractPoller<
  Metrics extends PollerMetrics,
  Validator extends Schema,
> implements Poller {
  private readonly _name: string
  private readonly _metrics: Metrics
  private readonly _validator: Validator

  private _dimensions: Record<string, string>
  private _publishing: Set<string>
  private _sampling: boolean = false

  constructor(name: string, metrics: Metrics, validator: Validator) {
    this._name = name
    this._metrics = metrics
    this._validator = validator
    this._publishing = new Set(Object.keys(metrics))
    this._dimensions = {}

    if (this._publishing.size === 0) {
      throw new Error(`No metrics available in poller "${this._name}`)
    }
  }

  poll(sink: Sink): void {
    if (this._sampling) return
    this._sampling = true

    setImmediate(async () => {
      try {
        const metrics = await this.sample()

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
      } catch (error: any) {
        sink(error)
      } finally {
        this._sampling = false
      }
    })
  }

  configure(configuration: any): Promise<void> {
    const { config, publish = [], dimensions } = validate(object({
      'config': object(), // TODO: bug in Justus prevents nested validations
      'publish': optional(arrayOf(string)),
      'dimensions': object({
        ...allowAdditionalProperties(string),
      }),
    }), configuration)

    if (publish) {
      if (publish.length === 0) {
        throw new Error(`No metrics published for poller "${this._name}`)
      }

      this._publishing = new Set<string>()
      for (const metric of publish) {
        if (this._metrics[metric]) {
          this._publishing.add(metric)
        } else {
          throw new Error(`Unknown metric "${metric}" for poller "${this._name}"`)
        }
      }
    }

    this._dimensions = {}
    for (const [ name, value ] of Object.entries(dimensions)) {
      if (name && value) this._dimensions[name] = value
    }

    return this.init(validate(this._validator, config))
  }

  protected abstract init(config: InferValidation<Validator>): Promise<void>
  protected abstract sample(): Promise<PollerData<Metrics>>
}
