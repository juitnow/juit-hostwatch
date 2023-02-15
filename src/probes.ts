import { AlcatelRouterProbe } from './probes/alcatel'
import { CPUProbe } from './probes/cpu'
import { DiskProbe } from './probes/disk'
import { LoadProbe } from './probes/load'
import { MemoryProbe } from './probes/memory'
import { PingProbe } from './probes/ping'
import { RegExpProbe } from './probes/regexp'

import type { Probe } from './types'

export * from './probes/abstract'
export { AlcatelRouterProbe } from './probes/alcatel'
export { CPUProbe } from './probes/cpu'
export { DiskProbe } from './probes/disk'
export { LoadProbe } from './probes/load'
export { MemoryProbe } from './probes/memory'
export { PingProbe } from './probes/ping'
export { RegExpProbe } from './probes/regexp'

export function createProbe(type: string): Probe {
  switch (type) {
    case 'alcatel': return new AlcatelRouterProbe(); break
    case 'cpu': return new CPUProbe(); break
    case 'disk': return new DiskProbe(); break
    case 'load': return new LoadProbe(); break
    case 'memory': return new MemoryProbe(); break
    case 'ping': return new PingProbe(); break
    case 'regexp': return new RegExpProbe(); break
    default: throw new Error(`Unknown probe "${type}"`)
  }
}
