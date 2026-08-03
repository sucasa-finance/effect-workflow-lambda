import { SQS } from '@effect-aws/client-sqs';

const endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4570';
const queueName = process.env.SQS_QUEUE_NAME ?? 'ewf-sqs-mysql-queue';

export const queueUrl = `${endpoint}/000000000000/${queueName}`;

export const SqsLive = SQS.layer({
  region: 'ap-southeast-2',
  endpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});
