export enum Unit {
  // Simple units

  None = 'None',

  Count = 'Count',
  Percent = 'Percent',

  Microseconds = 'Microseconds',
  Milliseconds = 'Milliseconds',
  Seconds = 'Seconds',

  Bits = 'Bits',
  Kilobits = 'Kilobits',
  Megabits = 'Megabits',
  Gigabits = 'Gigabits',
  Terabits = 'Terabits',

  Bytes = 'Bytes',
  Kilobytes = 'Kilobytes',
  Megabytes = 'Megabytes',
  Gigabytes = 'Gigabytes',
  Terabytes = 'Terabytes',

  // Rates

  Count_Second = 'Count/Second',

  Bits_Second = 'Bits/Second',
  Kilobits_Second = 'Kilobits/Second',
  Megabits_Second = 'Megabits/Second',
  Gigabits_Second = 'Gigabits/Second',
  Terabits_Second = 'Terabits/Second',

  Bytes_Second = 'Bytes/Second',
  Kilobytes_Second = 'Kilobytes/Second',
  Megabytes_Second = 'Megabytes/Second',
  Gigabytes_Second = 'Gigabytes/Second',
  Terabytes_Second = 'Terabytes/Second',
}

export interface Metric {
  name: string,
  unit: Unit,
  value: number
  timestamp: number,
  dimensions: Record<string, string>,
}

export interface Component {
  start(): void | Promise<void>
  stop(): void | Promise<void>
}

export interface ProbeDefinition {
  probe: string,
  name?: string,
  publish: string[],
  dimensions: Readonly<Record<string, string>>,
  config?: Readonly<Record<string, any>>,
}

export interface Probe extends Component {
  init(def: ProbeDefinition, sink: Sink): void | Promise<void>
  poll(): void
}

export interface SinkDefinition {
  sink: string,
  name?: string,
  config?: Readonly<Record<string, any>>,
}

export interface Sink extends Component {
  init(def: SinkDefinition): void | Promise<void>
  sink(metric: Metric): void
}
