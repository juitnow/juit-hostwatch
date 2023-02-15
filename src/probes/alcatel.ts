import { AlcatelClient } from '@juit/lib-tcl-router'
import { object, optional, string } from 'justus'

import { Unit } from '..'
import { AbstractProbe } from './abstract'

import type { PollData } from './abstract'

const metrics = {
  TotalNetworkIn: Unit.Bytes,
  TotalNetworkOut: Unit.Bytes,
  BandwidthNetworkIn: Unit.Bytes_Second,
  BandwidthNetworkOut: Unit.Bytes_Second,
  ConnectionStatus: Unit.None, // -1 disconnecting, 0 disconnected, 1 connecting, 2 connected
  NetworkType: Unit.None, // number of "G"s: 0 no service, 2 2G, ... 4.5 4G+, 5 5G
  // Varous signal strength data
  SignalStrength: Unit.None,
  SignalRSSI: Unit.None,
  SignalRSRP: Unit.None,
  SignalSINR: Unit.None,
  SignalRSRQ: Unit.None,
} as const

const validator = object({
  hostname: string({ minLength: 1 }),
  username: optional(string({ minLength: 1 })),
  password: string({ minLength: 1 }),
})

interface Status {
  timestamp: number,
  bytesOut: number,
  bytesIn: number,
}

export class AlcatelRouterProbe extends AbstractProbe<typeof metrics, typeof validator> {
  private _client?: AlcatelClient
  private _status?: Status

  constructor() {
    super('load', metrics, validator)
  }

  async start(): Promise<void> {
    const { hostname, username: userName, password } = this.configuration
    this._client = new AlcatelClient(hostname, password, { userName })
    try {
      const status = await this._client.poll()
      this.log.debug(`Successfully connected to "${status.device}" at ${hostname}`)
    } catch (cause) {
      throw new Error(`Error contacting router at "${hostname}"`, { cause })
    }
  }

  protected async sample(): Promise<PollData<typeof metrics>> {
    if (! this._client) throw new Error('TclRouter probe not initialized')

    const status = await this.poll()
    this.log.trace('Status from router', status)

    const {
      bytes_in: bytesIn,
      bytes_out: bytesOut,
      network_type: networkTypeString,
      connection_status: connectionStatusString,
      ...data } = await this._client.poll()
    const timestamp = Date.now()

    let bandwidthIn: number = NaN
    let bandwidthOut: number = NaN

    if (this._status && (this._status.timestamp < timestamp)) {
      const seconds = (timestamp - this._status.timestamp) / 1000
      bandwidthOut = (bytesOut - this._status.bytesOut) / seconds
      bandwidthIn = (bytesIn - this._status.bytesIn) / seconds
    }

    this._status = { timestamp, bytesIn, bytesOut }

    // number of "G"s: 0 no service, 2 2G, ... 4.5 4G+, 5 5G
    let networkType: number
    switch (networkTypeString) {
      case 'No Service': networkType = 0; break
      case '2G': networkType = 2; break
      case '3G': networkType = 3; break
      case '3G+': networkType = 3.5; break
      case '4G': networkType = 4; break
      case '4G+': networkType = 4.5; break
      case '5G': networkType = 5; break
      case 'Unknown':
      default:
        networkType = NaN
    }

    // -1 disconnecting, 0 disconnected, 1 connecting, 2 connected
    let connectionStatus: number
    switch (connectionStatusString) {
      case 'Disconnecting': connectionStatus = -1; break
      case 'Disconnected': connectionStatus = 0; break
      case 'Connecting': connectionStatus = 1; break
      case 'Connected': connectionStatus = 2; break
      case 'Unknown':
      default:
        connectionStatus = NaN; break
    }

    return {
      TotalNetworkIn: bytesIn,
      TotalNetworkOut: bytesOut,
      BandwidthNetworkIn: bandwidthIn,
      BandwidthNetworkOut: bandwidthOut,
      ConnectionStatus: connectionStatus,
      NetworkType: networkType,
      SignalStrength: data.strength,
      SignalRSSI: data.rssi,
      SignalRSRP: data.rsrp,
      SignalSINR: data.sinr,
      SignalRSRQ: data.rsrq,
    }
  }
}
