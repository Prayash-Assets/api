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
  // Strip /dev prefix from multiple event properties
  if (event.resource && event.resource.startsWith('/dev')) {
    event.resource = event.resource.substring(4) || '/';
  }
  
  if (event.path && event.path.startsWith('/dev')) {
    event.path = event.path.substring(4) || '/';
  }
  
  if (event.requestContext && event.requestContext.resourcePath && event.requestContext.resourcePath.startsWith('/dev')) {
    event.requestContext.resourcePath = event.requestContext.resourcePath.substring(4) || '/';
  }
  
  const lambdaHandler = await init();
  return lambdaHandler(event, context);
};
