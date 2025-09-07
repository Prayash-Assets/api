import awsLambdaFastify from '@fastify/aws-lambda';
import { createApp } from './app';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

let fastifyHandler: any;

const init = async () => {
  if (!fastifyHandler) {
    const app = await createApp();
    fastifyHandler = awsLambdaFastify(app);
  }
  return fastifyHandler;
};

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // Strip /dev prefix from path if present
  if (event.path && event.path.startsWith('/dev')) {
    event.path = event.path.substring(4);
  }
  
  const lambdaHandler = await init();
  return lambdaHandler(event, context);
};
