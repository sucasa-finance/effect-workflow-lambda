import * as aws from '@pulumi/aws';
import * as pulumi from '@pulumi/pulumi';
import * as path from 'path';

const appRoot = path.resolve(__dirname, '..');
const buildDir = path.resolve(appRoot, '.build');

const queue = new aws.sqs.Queue('ewf-sqs-mysql-queue', {
  name: 'ewf-sqs-mysql-queue',
  visibilityTimeoutSeconds: 30,
  messageRetentionSeconds: 86400,
  receiveWaitTimeSeconds: 5,
});

const lambdaEnv = {
  variables: {
    AWS_ENDPOINT_URL: 'http://floci:4566',
    SQS_QUEUE_NAME: 'ewf-sqs-mysql-queue',
    MYSQL_HOST: 'mysql',
    MYSQL_PORT: '3306',
  },
};

const sqsHandler = new aws.lambda.Function('ewf-sqs-handler', {
  name: 'ewf-sqs-handler',
  runtime: 'nodejs20.x',
  handler: 'sqs.handler',
  role: 'arn:aws:iam::000000000000:role/lambda-role',
  code: new pulumi.asset.FileArchive(path.join(buildDir, 'sqs')),
  timeout: 30,
  environment: lambdaEnv,
});

const httpHandler = new aws.lambda.Function('ewf-http-handler', {
  name: 'ewf-http-handler',
  runtime: 'nodejs20.x',
  handler: 'http.handler',
  role: 'arn:aws:iam::000000000000:role/lambda-role',
  code: new pulumi.asset.FileArchive(path.join(buildDir, 'http')),
  timeout: 30,
  environment: lambdaEnv,
});

new aws.lambda.EventSourceMapping('ewf-sqs-mapping', {
  functionName: sqsHandler.arn,
  eventSourceArn: queue.arn,
  batchSize: 1,
});

export const queueUrl = queue.url;
export const queueArn = queue.arn;
export const sqsHandlerName = sqsHandler.name;
export const httpHandlerName = httpHandler.name;
