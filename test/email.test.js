const nodemailer = jest.requireActual('nodemailer');
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-1' });
const mockTransport = { sendMail: mockSendMail };
const mockCreateTransport = jest.fn().mockImplementation((cfg) => mockTransport);

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.dontMock('nodemailer');
});

function captureEnvVars() {
  return {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  };
}

function restoreEnvVars(env) {
  if (env.SMTP_HOST !== undefined) {
    process.env.SMTP_HOST = env.SMTP_HOST;
  } else {
    delete process.env.SMTP_HOST;
  }
  if (env.SMTP_PORT !== undefined) {
    process.env.SMTP_PORT = env.SMTP_PORT;
  } else {
    delete process.env.SMTP_PORT;
  }
  if (env.SMTP_SECURE !== undefined) {
    process.env.SMTP_SECURE = env.SMTP_SECURE;
  } else {
    delete process.env.SMTP_SECURE;
  }
  if (env.SMTP_USER !== undefined) {
    process.env.SMTP_USER = env.SMTP_USER;
  } else {
    delete process.env.SMTP_USER;
  }
  if (env.SMTP_PASS !== undefined) {
    process.env.SMTP_PASS = env.SMTP_PASS;
  } else {
    delete process.env.SMTP_PASS;
  }
  if (env.SMTP_FROM !== undefined) {
    process.env.SMTP_FROM = env.SMTP_FROM;
  } else {
    delete process.env.SMTP_FROM;
  }
}

describe('sendTodoReminder', () => {
  test('returns false when SMTP_HOST is not configured', async () => {
    const saved = captureEnvVars();
    delete process.env.SMTP_HOST;

    const { sendTodoReminder } = require('../src/email/service');
    const result = await sendTodoReminder({
      to: 'user@example.com',
      todos: [{ title: 'Test', due_date: '2024-01-15' }],
      dueSoonThresholdDays: 2,
    });

    restoreEnvVars(saved);
    expect(result).toBe(false);
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  test('returns false when no recipients provided', async () => {
    const saved = captureEnvVars();
    process.env.SMTP_HOST = 'smtp.example.com';

    const { sendTodoReminder } = require('../src/email/service');
    const result = await sendTodoReminder({
      todos: [{ title: 'Test', due_date: '2024-01-15' }],
      dueSoonThresholdDays: 2,
    });

    restoreEnvVars(saved);
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('returns false when todos list is empty', async () => {
    const saved = captureEnvVars();
    process.env.SMTP_HOST = 'smtp.example.com';

    const { sendTodoReminder } = require('../src/email/service');
    const result = await sendTodoReminder({
      to: 'user@example.com',
      todos: [],
      dueSoonThresholdDays: 2,
    });

    restoreEnvVars(saved);
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  test('sends email with correct subject and body when SMTP is configured', async () => {
    const saved = captureEnvVars();
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_FROM = 'alerts@myapp.com';

    const { sendTodoReminder } = require('../src/email/service');

    const todos = [
      {
        title: 'Submit report',
        description: 'Quarterly report due',
        due_date: '2024-01-15',
      },
      {
        title: 'Update docs',
        description: null,
        due_date: '2024-01-16',
      },
    ];

    const result = await sendTodoReminder({
      to: 'user@example.com',
      todos,
      dueSoonThresholdDays: 2,
    });

    restoreEnvVars(saved);
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);

    const [mailOptions] = mockSendMail.mock.calls[0];
    expect(mailOptions.from).toBe('"Todo App" <alerts@myapp.com>');
    expect(mailOptions.to).toBe('user@example.com');
    expect(mailOptions.subject).toBe('Todo Reminder: Upcoming Due Dates');
    expect(mailOptions.html).toContain('Submit report');
    expect(mailOptions.html).toContain('Quarterly report due');
    expect(mailOptions.html).toContain('Update docs');
    expect(mailOptions.html).toContain('2');
  });

  test('escapes HTML special characters in todo titles', async () => {
    const saved = captureEnvVars();
    process.env.SMTP_HOST = 'smtp.example.com';

    const { sendTodoReminder } = require('../src/email/service');

    const todos = [
      {
        title: 'Fix <script> tags & "quotes"',
        description: 'Use &lt; in output',
        due_date: '2024-01-15',
      },
    ];

    await sendTodoReminder({
      to: 'user@example.com',
      todos,
      dueSoonThresholdDays: 2,
    });

    restoreEnvVars(saved);

    const [mailOptions] = mockSendMail.mock.calls[0];
    expect(mailOptions.html).toContain('&lt;script&gt;');
    expect(mailOptions.html).toContain('&amp;');
    expect(mailOptions.html).toContain('&quot;');
  });

  test('uses default port when SMTP_PORT is not set', async () => {
    const saved = captureEnvVars();
    process.env.SMTP_HOST = 'smtp.example.com';

    const { sendTodoReminder } = require('../src/email/service');

    await sendTodoReminder({
      to: 'user@example.com',
      todos: [{ title: 'Test', due_date: '2024-01-15' }],
      dueSoonThresholdDays: 2,
    });

    restoreEnvVars(saved);

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 587,
      })
    );
  });

  test('handles SMTP send failure gracefully', async () => {
    const saved = captureEnvVars();
    process.env.SMTP_HOST = 'smtp.example.com';

    mockSendMail.mockRejectedValueOnce(new Error('Connection refused'));

    const { sendTodoReminder } = require('../src/email/service');

    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const result = await sendTodoReminder({
      to: 'user@example.com',
      todos: [{ title: 'Test', due_date: '2024-01-15' }],
      dueSoonThresholdDays: 2,
    });

    consoleErrorSpy.mockRestore();

    expect(result).toBe(false);
  });

  test('includes due date in readable format in email body', async () => {
    const saved = captureEnvVars();
    process.env.SMTP_HOST = 'smtp.example.com';

    const { sendTodoReminder } = require('../src/email/service');

    const dueDate = new Date('2024-01-15T00:00:00Z');

    await sendTodoReminder({
      to: 'user@example.com',
      todos: [{ title: 'Test', due_date: dueDate.toISOString() }],
      dueSoonThresholdDays: 2,
    });

    restoreEnvVars(saved);

    const [mailOptions] = mockSendMail.mock.calls[0];
    expect(mailOptions.html).toContain('Due:');
  });
});
