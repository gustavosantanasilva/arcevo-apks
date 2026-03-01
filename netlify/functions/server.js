const serverless = require('serverless-http');
const { app, init } = require('../../server');

const handler = serverless(app);

exports.handler = async (event, context) => {
  await init();
  return handler(event, context);
};
