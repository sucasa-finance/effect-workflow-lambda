import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';

const queue = new aws.sqs.Queue('ewf-sqs-postgres-queue', {
  name: 'ewf-sqs-postgres-queue',
  visibilityTimeoutSeconds: 30,
  messageRetentionSeconds: 86400,
  receiveWaitTimeSeconds: 5,
});

export const queueUrl = queue.url;
export const queueArn = queue.arn;
export const queueName = queue.name;
