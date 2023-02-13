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

export type Sink = (metric: Metric) => void
