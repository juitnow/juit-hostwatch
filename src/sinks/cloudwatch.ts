import { CloudWatch } from '@aws-sdk/client-cloudwatch'
import { STS } from '@aws-sdk/client-sts'
import { fromEnv, fromInstanceMetadata } from '@aws-sdk/credential-providers'
import { boolean, number, object, optional, string } from 'justus'

import { getMetaData } from '../utils/ec2'
import { millis } from '../utils/milliseconds'
import { AbstractSink } from './abstract'

import type { MetricDatum } from '@aws-sdk/client-cloudwatch'
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types'
import type { Metric } from '../types'

const HARD_MAX = Math.pow(2, 360)
const HARD_MIN = -HARD_MAX


const validator = object({
  // The namespace of our metrics, _must_ exist
  namespace: string({ minLength: 1 }),
  // The region where our metrics must be ingested to
  region: optional(string({ minLength: 1 })),
  // The maximum number of metrics to buffer before forcing a send
  bufferSize: optional(number({ minimum: 1, maximum: 500, fromString: true }), 100),
  // The batch size of metrics to send, the docs says 1000 max, but we're conservative
  batchSize: optional(number({ minimum: 1, maximum: 500, fromString: true }), 500),
  // Threshold after which a metric will be discarded, if it failed sending
  retryThreshold: optional(millis({ minimum: 1_000, maximum: 300_000, defaultUnit: 'seconds' }), '2 min'),
  // Interval after which batches of metrics will be sent
  interval: optional(millis({ minimum: 10_000, maximum: 120_000, defaultUnit: 'seconds' }), '10 sec'),
  // Access key, optional as we can also use credentials from EC2
  accessKeyId: optional(string({ minLength: 1 })),
  // Secret Access key, optional as we can also use credentials from EC2
  secretAccessKey: optional(string({ minLength: 1 })),
  // A boolean flag indicating whether we should use credentials from EC2
  ec2Credentials: optional(boolean({ fromString: true }), false),
  // A boolean flag indicating whether this is a dry run (nothing will be sent)
  dryRun: optional(boolean({ fromString: true }), false),
})

export class CloudWatchSink extends AbstractSink<typeof validator> {
  private readonly _metrics: MetricDatum[] = []
  private _timeout: null | ReturnType<typeof setTimeout> = null

  private _client?: CloudWatch

  constructor() {
    super('cloudwatch', validator)
  }

  async start(): Promise<void> {
    let credentials: AwsCredentialIdentityProvider
    let region: string | undefined = this.configuration.region ||
                                     process.env.AWS_REGION ||
                                     process.env.AWS_DEFAULT_REGION

    if (this.configuration.ec2Credentials === true) {
      credentials = fromInstanceMetadata()
      if (! region) region = await getMetaData('placement/region') as string
    } else {
      if (this.configuration.accessKeyId) process.env.AWS_ACCESS_KEY_ID = this.configuration.accessKeyId
      if (this.configuration.secretAccessKey) process.env.AWS_SECRET_ACCESS_KEY = this.configuration.secretAccessKey
      credentials = fromEnv()
    }

    if (! region) throw new Error('AWS region is missing')

    try {
      const stsClient = new STS({ credentials, region })
      const { Arn } = await stsClient.getCallerIdentity({})
      this.log.info('AWS caller identified as', Arn)
    } catch (cause) {
      throw new Error('Unable to validate AWS caller identity', { cause })
    }

    this._client = new CloudWatch({ credentials, region })
  }

  async stop(): Promise<void> {
    if (this._client) await this.publish()
  }

  sink(_metric: Metric): void {
    if (! this.configuration) throw new Error('CloudWatch Sink not configured')
    if (! this._client) throw new Error('CloudWatch Client not initialized')

    // Expand our values
    const { timestamp, name, unit, value, dimensions } = _metric

    if ((! isFinite(value)) || (value > HARD_MAX) || (value < HARD_MIN)) {
      this.log.warn(`Ignoring invalid metric value for "${name}:`, value)
      return
    }

    // Convert the metric to a CludWatch `MetricDatum` and buffer it. Here we
    // don't aggregate multiple data points per minute, as CloudWatch will
    // calculate the average for us, and keep track of minimum, maximum and
    // number of samples sent for us.
    // See https://docs.aws.amazon.com/en_us/AmazonCloudWatch/latest/monitoring/publishingMetrics.html#publishingDataPoints1
    const length = this._metrics.push({
      Timestamp: new Date(timestamp),
      MetricName: name,
      Unit: unit,
      Value: value,
      Dimensions: Object.entries(dimensions)
          .map(([ Name, Value ]) => ({ Name, Value })),
    })

    this.log.debug('Buffered', length, 'metrics')

    // If we reached the limit in our buffer, then immediately process
    if (length >= this.configuration.bufferSize) {
      this.log.debug(`Scheduling publication immedately (bufferSize=${this.configuration.bufferSize})`)
      setImmediate(() => this.publish())
      return
    }

    // If a timeout is pending, leave it
    if (this._timeout != null) return

    // Schedule to process all buffered metrics in our interval time
    this.log.debug('Scheduling publication in', this.configuration.interval, 'ms')
    this._timeout = setTimeout(() => this.publish(), this.configuration.interval).unref()
  }

  private async publish(): Promise<void> {
    if (! this.configuration) throw new Error('CloudWatch Sink not configured')
    if (! this._client) throw new Error('CloudWatch Client not initialized')

    // First of all clear any timeout, so that `sink` can schedule a new one
    if (this._timeout != null) clearTimeout(this._timeout)
    this._timeout = null

    // Process our metrics in batches
    while (this._metrics.length > 0) {
      const batch = this._metrics.splice(0, this.configuration.batchSize)

      if (this.configuration.dryRun) {
        this.log.warn('Dry run: metrics batch', batch)
      }

      try {
        await this._client.putMetricData({
          Namespace: this.configuration.namespace,
          MetricData: batch,
        })
      } catch (error) {
        this.log.error('Error sending metrics to CloudWatch', error)

        // Re-buffer our metrics that are not past retry threshold
        const threshold = Date.now() - this.configuration.retryThreshold
        for (const metric of batch) {
          if ((metric.Timestamp?.getTime() || 0) < threshold) continue
          this._metrics.push(metric)
        }
      }
    }
  }
}
