import assert from 'node:assert'

import { validate } from 'justus'

import { logger } from './logger'

import type { InferValidation, Validation } from 'justus'
import type { Component, Metric, Probe, Sink } from './index'
import type { Logger } from './logger'


export abstract class AbstractComponent<V extends Validation> {
  private readonly _type: string
  private readonly _validation: V
  private _name: string
  private _log: Logger

  constructor(type: string, name: string, validation: V) {
    assert(type, 'Invalid empty/undefined type')
    assert(name, 'Invalid empty/undefined name')
    this._log = logger(`${type}:${name}`)
    this._type = type
    this._name = name
    this._validation = validation
  }

  get name(): string {
    return this._name
  }

  get log(): Logger {
    return this._log
  }

  protected initialize(def: { name?: string, config?: any }): void {
    if (def.name) {
      this._log = logger(`${this._type}:${name}`)
      this._name = name
    }

    const config = validate(this._validation, def.config)
    return this.configure(config)
  }

  protected configure(config: InferValidation<V>): void {
    // empty, just for overrides
    void config
  }

  start(): void {
    // empty, just for overrides
  }

  stop(): void {
    // empty, just for overrides
  }
}


abstract class Components<T extends Probe | Sink> implements Component {
  protected readonly components: readonly T[]

  constructor(components: readonly T[]) {
    assert(components.length, 'No components to combine')
    this.components = components
  }

  init(): void {
    assert.fail('Components must be already initialized')
  }

  async start(): Promise<void> {
    for (const component of this.components) {
      await component.start()
    }
  }

  async stop(): Promise<void> {
    for (const component of this.components) {
      await component.stop()
    }
  }
}

export class Probes extends Components<Probe> implements Probe {
  private readonly log: Logger = logger('probes')

  constructor(probes: readonly Probe[]) {
    super(probes)
  }

  poll(): void {
    for (const component of this.components) {
      try {
        component.poll()
      } catch (error) {
        this.log.error('Error polling metrics', error)
      }
    }
  }
}

export class Sinks extends Components<Sink> implements Sink {
  private readonly log: Logger = logger('probes')

  constructor(sinks: readonly Sink[]) {
    super(sinks)
  }

  sink(metric: Metric): void {
    for (const component of this.components) {
      try {
        component.sink(metric)
      } catch (error) {
        this.log.error('Error sinking metrics', error)
      }
    }
  }
}
