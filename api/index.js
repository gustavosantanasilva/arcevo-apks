const { app, init } = require('../server');

module.exports = async (req, res) => {
  await init();
  return app(req, res);
};
