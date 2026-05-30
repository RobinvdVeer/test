const { sendEmail, formatEmailBody, createTransporter } = require('../services/emailService');

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(async ({ to, subject }) => ({ messageId: 'mock-msg-id' })),
  })),
}));

describe('emailService', () => {
  const mockConfig = {
    host: 'smtp.example.com',
    port: 587,
    user: 'user@example.com',
    password: 'secret',
    from: 'alerts@example.com',
    secure: false,
  };

  describe('sendEmail', () => {
    test('returns error when email is not configured', async () => {
      const result = await sendEmail({}, 'to@example.com', 'Subject', 'Body');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Email not configured');
    });

    test('returns error when host is missing', async () => {
      const result = await sendEmail(
        { ...mockConfig, host: undefined },
        'to@example.com',
        'Subject',
        'Body'
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Email not configured');
    });

    test('sends email successfully when configured', async () => {
      const result = await sendEmail(
        mockConfig,
        'user@example.com',
        'Test subject',
        'Test body'
      );
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('mock-msg-id');
    });

    test('uses from address when configured', async () => {
      const nodemailer = require('nodemailer');
      const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-2' });
      const mockTransporter = { sendMail: mockSendMail };
      nodemailer.createTransport.mockReturnValue(mockTransporter);

      await sendEmail(mockConfig, 'user@example.com', 'Subject', 'Body');

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('"Metrics Todo App" <alerts@example.com>');
    });

    test('falls back to user email when from is not configured', async () => {
      const nodemailer = require('nodemailer');
      const { createTransporter } = require('../services/emailService');
      const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-3' });
      const mockTransporter = { sendMail: mockSendMail };
      nodemailer.createTransport.mockReturnValue(mockTransporter);

      const configNoFrom = { ...mockConfig, from: undefined };
      await sendEmail(configNoFrom, 'user@example.com', 'Subject', 'Body');

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('"Metrics Todo App" <user@example.com>');
    });
  });

  describe('formatEmailBody', () => {
    test('formats a single todo', () => {
      const body = formatEmailBody([
        {
          title: 'Complete report',
          description: 'Monthly report due Friday',
          category: 'work',
          priority: 'high',
        },
      ]);
      expect(body).toContain('Complete report');
      expect(body).toContain('Monthly report due Friday');
      expect(body).toContain('category: work');
      expect(body).toContain('priority: high');
      expect(body).toContain('1 upcoming task');
    });

    test('formats multiple todos', () => {
      const body = formatEmailBody([
        { title: 'Task 1' },
        { title: 'Task 2' },
      ]);
      expect(body).toContain('2 upcoming tasks');
      expect(body).toContain('Task 1');
      expect(body).toContain('Task 2');
    });

    test('omits optional fields when not present', () => {
      const body = formatEmailBody([{ title: 'Simple task' }]);
      expect(body).toContain('Simple task');
      expect(body).not.toContain('category:');
      expect(body).not.toContain('priority:');
    });

    test('uses custom user name in greeting', () => {
      const body = formatEmailBody([{ title: 'Task' }], 'Alice');
      expect(body).toContain('Hello Alice,');
    });
  });

  describe('createTransporter', () => {
    test('returns null when host is missing', () => {
      const result = createTransporter({ user: 'test', password: 'test' });
      expect(result).toBeNull();
    });

    test('returns null when user is missing', () => {
      const result = createTransporter({ host: 'smtp.example.com', password: 'test' });
      expect(result).toBeNull();
    });

    test('returns null when password is missing', () => {
      const result = createTransporter({ host: 'smtp.example.com', user: 'test' });
      expect(result).toBeNull();
    });

    test('creates transporter when all required fields are present', () => {
      const result = createTransporter(mockConfig);
      expect(result).not.toBeNull();
    });
  });
});
