const nodemailer = require('nodemailer');
const { getBranding } = require('../config/branding');

let cachedTransporter = null;

const branding = getBranding();
const DEFAULT_FROM = process.env.MAIL_FROM || `${branding.orgName} Volunteers <no-reply@example.org>`;
const DEFAULT_REPLY_TO = process.env.MAIL_REPLY_TO || 'volunteers@example.org';

function createTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const {
    MAIL_SERVICE,
    MAIL_HOST,
    MAIL_PORT,
    MAIL_SECURE,
    MAIL_USER,
    MAIL_PASS
  } = process.env;

  const baseConfig = {};

  if (MAIL_SERVICE) {
    baseConfig.service = MAIL_SERVICE;
  } else if (MAIL_HOST && MAIL_PORT) {
    baseConfig.host = MAIL_HOST;
    baseConfig.port = Number(MAIL_PORT);
    baseConfig.secure = MAIL_SECURE === 'true';
  }

  if (MAIL_USER && MAIL_PASS) {
    baseConfig.auth = { user: MAIL_USER, pass: MAIL_PASS };
  }

  if (Object.keys(baseConfig).length > 0) {
    cachedTransporter = nodemailer.createTransport(baseConfig);
    cachedTransporter.__defaultFrom = DEFAULT_FROM;
    cachedTransporter.__defaultReplyTo = DEFAULT_REPLY_TO;
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true
  });
  cachedTransporter.__defaultFrom = DEFAULT_FROM;
  cachedTransporter.__defaultReplyTo = DEFAULT_REPLY_TO;
  return cachedTransporter;
}

async function sendMail({ to, subject, text, html, from, replyTo }) {
  const transporter = createTransporter();
  const message = {
    from: from || transporter.__defaultFrom,
    to,
    subject,
    text,
    html,
    replyTo: replyTo || transporter.__defaultReplyTo
  };

  const info = await transporter.sendMail(message);

  if (info && info.message && transporter.options.streamTransport) {
    console.log('Email (stream transport):\n', info.message.toString());
  }

  return info;
}

module.exports = { sendMail };
