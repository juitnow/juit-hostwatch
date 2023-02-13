import { parse } from './config'
import { PingProbe } from './probes/ping'

import type { Metric, Sink } from '.'
import type { Probe } from './probe'

async function main(file: string): Promise<void> {
  const { config, dimensions, probes, sinks } = await parse(file)
  console.log({ config, dimensions, probes, sinks })

  const probeInstances: Probe[] = []
  for (const probeOptions of probes) {
    const { probe, ...options } = probeOptions
    let instance: Probe

    switch (probe) {
      case 'ping': instance = new PingProbe(); break
      default: throw new Error(`Unknown probe "${probe}"`)
    }

    await instance.configure(options)
    probeInstances.push(instance)
  }

  const sink: Sink = (error: Error | null, metric?: Metric) => {
    console.log('SINKING', error, metric)
  }

  setInterval(() => {
    probeInstances.forEach((probe) => probe.poll(sink))
  }, 10000)
}

main('./config.yml').catch(console.error)
