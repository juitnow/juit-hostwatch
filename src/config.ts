import { readFile } from 'node:fs/promises'

import { arrayOf, boolean, object, objectOf, oneOf, optional, string, validate } from 'justus'
import { parse as parseYaml } from 'yaml'

import { logger, logLevels } from './logger'
import { Replacer } from './replacer'
import { millis } from './seconds'

import type { Config, ProbeDefinition, SinkDefinition } from '.'

const log = logger('config')

const configValidator = object({
  logLevel: optional(oneOf(...logLevels), logger.logLevel),
  logTimes: optional(boolean({ fromString: true }), logger.logTimes),
  logColors: optional(boolean({ fromString: true }), logger.logColors),
  pollInterval: optional(millis({ minimum: 1_000, maximum: 120_000, defaultUnit: 'seconds' }), '45 sec'),
})

const probeValidator = object({
  probe: string({ minLength: 1 }),
  name: optional(string({ minLength: 1 })),
  publish: optional(arrayOf(string), []),
  dimensions: optional(objectOf(oneOf(string, null)), {}),
  config: optional(object),
})

const sinkValidator = object({
  sink: string({ minLength: 1 }),
  name: optional(string({ minLength: 1 })),
  config: optional(object),
})

const validator = object({
  config: optional(configValidator, {}),
  variables: optional(object, {}),
  dimensions: optional(objectOf(string), {}),
  probes: arrayOf(probeValidator),
  sinks: arrayOf(sinkValidator),
})

export interface ParsedConfig {
  config: Config,
  dimensions: Record<string, string>,
  probes: ProbeDefinition[],
  sinks: SinkDefinition[],
}

export async function parse(file: string): Promise<ParsedConfig> {
  const text = await readFile(file, 'utf-8')
  const data = parseYaml(text)

  const { variables, ...options } = validate(validator, data)

  const replacer = new Replacer()
  const vars = await replacer.replace(variables, true)

  const [ config, dimensions, probes, sinks ] = await Promise.all([
    replacer.replace(options.config || validate(configValidator, {})),
    replacer.replace(options.dimensions),
    replacer.replace(options.probes),
    replacer.replace(options.sinks),
  ])

  log.debug('Known variables:')
  Object.entries(vars).forEach(([ name, value ]) => log.debug('- %s =>', name, value))

  log.info('Global dimensions:')
  Object.entries(dimensions).forEach(([ name, value ]) => log.info('- %s =>', name, value))

  log.info('Probes configured:', probes.length)
  log.info('Sinks configured:', sinks.length)

  return { config, dimensions, probes, sinks }
}
