import { CloudWatch } from '@aws-sdk/client-cloudwatch'
import { STS } from '@aws-sdk/client-sts'
import { fromEnv, fromInstanceMetadata } from '@aws-sdk/credential-providers'
import { boolean, number, object, optional, string } from 'justus'

import { Replacer } from '../replacer'
import { AbstractSink } from './abstract'

import type { MetricDatum } from '@aws-sdk/client-cloudwatch'
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types'
import type { InferValidation } from 'justus'
import type { Metric } from '..'


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
  retryThreshold: optional(number({ minimum: 1.000, maximum: 300.000, fromString: true }), 120.000),
  // Interval after which batches of metrics will be sent
  interval: optional(number({ minimum: 10.000, maximum: 120.000, fromString: true }), 30.000),
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

  private _options?: InferValidation<typeof validator>
  private _client?: CloudWatch

  constructor() {
    super('cloudwatch', validator)
  }

  configure(config: InferValidation<typeof validator>): void {
    this._options = config
  }

  async start(): Promise<void> {
    if (! this._options) throw new Error('CloudWatch Sink not configured')

    let credentials: AwsCredentialIdentityProvider
    let region: string | undefined = this._options.region ||
                                     process.env.AWS_REGION ||
                                     process.env.AWS_DEFAULT_REGION

    if (this._options.ec2Credentials === true) {
      credentials = fromInstanceMetadata()
      if (! region) region = await new Replacer().getReplacement('ec2:placement/region') as string
    } else {
      if (this._options.accessKeyId) process.env.AWS_ACCESS_KEY_ID = this._options.accessKeyId
      if (this._options.secretAccessKey) process.env.AWS_SECRET_ACCESS_KEY = this._options.secretAccessKey
      credentials = fromEnv()
    }

    try {
      const stsClient = new STS({ credentials, region })
      const { Arn } = await stsClient.getCallerIdentity({})
      this.log.debug('AWS caller identified as', Arn)
    } catch (cause) {
      throw new Error('Unable to validate AWS caller identity', { cause })
    }

    this._client = new CloudWatch({ credentials, region })
  }

  sink(metric: Metric): void {
    if (! this._options) throw new Error('CloudWatch Sink not configured')
    if (! this._client) throw new Error('CloudWatch Client not initialized')

    // Convert the metric to a CludWatch `MetricDatum` and buffer it
    const length = this._metrics.push({
      Timestamp: new Date(metric.timestamp),
      MetricName: metric.name,
      Unit: metric.unit,
      Value: metric.value,
      Dimensions: Object.entries(metric.dimensions)
          .map(([ Name, Value ]) => ({ Name, Value })),
    })

    this.log.trace('Buffered', length, 'metrics')

    // If we reached the limit in our buffer, then immediately process
    if (length >= this._options.bufferSize) {
      this.log.trace('Scheduling publication immedately')
      setImmediate(() => this.publish())
      return
    }

    // If a timeout is pending, leave it
    if (this._timeout != null) return

    // Schedule to process all buffered metrics in our interval time
    this.log.trace('Scheduling publication in', this._options.interval, 'ms')
    this._timeout = setTimeout(() => this.publish(), this._options.interval)
  }

  private async publish(): Promise<void> {
    if (! this._options) throw new Error('CloudWatch Sink not configured')
    if (! this._client) throw new Error('CloudWatch Client not initialized')

    // First of all clear any timeout, so that `sink` can schedule a new one
    if (this._timeout != null) clearTimeout(this._timeout)
    this._timeout = null

    // Process our metrics in batches
    while (this._metrics.length > 0) {
      const batch = this._metrics.splice(0, this._options.batchSize)

      if (this._options.dryRun) {
        this.log.warn('Dry run: metrics batch', batch)
      }

      try {
        await this._client.putMetricData({
          Namespace: this._options.namespace,
          MetricData: batch,
        })
      } catch (error) {
        this.log.error('Error sending metrics to CloudWatch', error)

        // Re-buffer our metrics that are not past retry threshold
        const threshold = Date.now() - this._options.retryThreshold
        for (const metric of batch) {
          if ((metric.Timestamp?.getTime() || 0) < threshold) continue
          this._metrics.push(metric)
        }
      }
    }
  }
}