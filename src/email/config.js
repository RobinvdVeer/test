const nodemailer = require('nodemailer');

function createTransporter(config) {
  if (!config || (!config.host || !config.port || !config.user || !config.pass)) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure !== false,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

module.exports = { createTransporter };
