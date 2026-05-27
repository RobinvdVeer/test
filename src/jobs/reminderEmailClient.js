async function sendReminderEmail({ fetchImpl, sendUrl, apiKey, from, to, subject, text }) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
  };

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const response = await fetchImpl(sendUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send reminder email: ${response.status}`);
  }
}

module.exports = { sendReminderEmail };
