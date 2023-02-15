export function percent(value: number, total: number): number {
  return total ? value && (value * 100 / total) : NaN
}

export function percentBig(value: bigint, total: bigint): number {
  return total ? Number(value && (value * 100n / total)) : NaN
}
