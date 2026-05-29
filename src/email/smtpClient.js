const net = require('net');
const tls = require('tls');

function dotStuff(text) {
  return text.replace(/^\./gm, '..');
}

function buildMessage({ from, to, subject, text }) {
  const dateHeader = new Date().toUTCString();
  const body = dotStuff(String(text || '').replace(/\r?\n/g, '\r\n'));

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Date: ${dateHeader}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
    '',
  ].join('\r\n');
}

function createLineReader(socket) {
  let buffer = '';
  const queue = [];
  let pending = null;
  let closed = false;
  let error = null;

  function flush() {
    if (!pending) return;

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    while (lines.length) {
      const line = lines.shift();
      if (!line) continue;
      queue.push(line);
    }

    while (queue.length && pending) {
      const line = queue.shift();
      pending.resolve(line);
      pending = null;
    }

    if (closed && pending) {
      pending.reject(error || new Error('SMTP connection closed'));
      pending = null;
    }
  }

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    flush();
  });
  socket.on('close', () => {
    closed = true;
    flush();
  });
  socket.on('error', (err) => {
    error = err;
    if (pending) {
      pending.reject(err);
      pending = null;
    }
  });

  return {
    readLine() {
      if (queue.length) {
        return Promise.resolve(queue.shift());
      }
      if (closed) {
        return Promise.reject(error || new Error('SMTP connection closed'));
      }
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
      });
    },
  };
}

async function readResponse(reader) {
  const lines = [];
  let code = null;

  while (true) {
    const line = await reader.readLine();
    lines.push(line);
    const match = line.match(/^(\d{3})([ -])(.*)$/);
    if (!match) continue;
    code = Number(match[1]);
    if (match[2] === ' ') break;
  }

  return { code, lines };
}

async function sendCommand(socket, reader, command, expectedCodes = [250]) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(reader);
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed: ${command} (${response.lines.join(' | ')})`);
  }
  return response;
}

async function sendEmail({ host, port, secure, username, password, from, to, subject, text, timeoutMs = 10_000 }) {
  const connectOptions = { host, port };
  const socket = secure ? tls.connect(connectOptions) : net.createConnection(connectOptions);
  socket.setTimeout(timeoutMs);

  const reader = createLineReader(socket);

  const socketReady = new Promise((resolve, reject) => {
    socket.once(secure ? 'secureConnect' : 'connect', resolve);
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('SMTP connection timed out')));
  });

  await socketReady;
  const greeting = await readResponse(reader);
  if (greeting.code !== 220) {
    throw new Error(`SMTP greeting failed: ${greeting.lines.join(' | ')}`);
  }

  await sendCommand(socket, reader, 'EHLO localhost');

  if (username) {
    await sendCommand(socket, reader, 'AUTH LOGIN', [334]);
    await sendCommand(socket, reader, Buffer.from(username).toString('base64'), [334]);
    await sendCommand(socket, reader, Buffer.from(password || '').toString('base64'), [235]);
  }

  await sendCommand(socket, reader, `MAIL FROM:<${from}>`);
  await sendCommand(socket, reader, `RCPT TO:<${to}>`);
  await sendCommand(socket, reader, 'DATA', [354]);
  socket.write(`${buildMessage({ from, to, subject, text })}.\r\n`);

  const dataResponse = await readResponse(reader);
  if (dataResponse.code !== 250) {
    throw new Error(`SMTP data failed: ${dataResponse.lines.join(' | ')}`);
  }

  await sendCommand(socket, reader, 'QUIT', [221]);
  socket.end();
}

module.exports = { sendEmail, buildMessage };
