# Email Reminders for Todos

This document describes the email reminder feature for todos due within 2 days.

## Features

- Automatically sends emails for todos with due dates less than 2 days away
- Users can configure the maximum frequency of email notifications (default: 24 hours)
- Users can enable/disable reminders globally
- Open source implementation using only native tools

## Architecture

The email reminder system consists of two services:

1. **App Service**: Handles API endpoints for managing email reminders settings
2. **Email Worker Service**: Independent worker that periodically checks for due todos and sends emails

## Setup

### 1. Database Migrations

Run migrations to add required tables and columns:

```bash
# Using postgres console
psql -U todouser -d tododb -f migrations/001_add_email_reminders.sql
```


Add the following to your `.env` file:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@your-app.com
EMAIL_DEFAULT_FREQUENCY_HOURS=24
EMAIL_CHECK_INTERVAL=3600000  # 1 hour in milliseconds
EMAIL_SECURE=false

# Frontend URL (for links in emails)
FRONTEND_URL=http://localhost:3000
```

**Note:** For Gmail, you need an App Password from https://myaccount.google.com/apppasswords

### 3. Docker Compose

The email worker service is included in `docker-compose.yml`. Start it with:

```bash
docker-compose up -d
```

The email worker runs continuously and will:
- Check every 1 hour (configurable via `EMAIL_CHECK_INTERVAL`)
- Send emails to users whose todos are due within 2 days
- Respect the maximum frequency setting per user

## API Endpoints

### Get Current User's Email Reminder Configuration

```http
GET /api/me/email-reminders/config
Authorization: Bearer <jwt-token>
```

Response:
```json
{
  "active": true,
  "frequency_millis": 86400000,
  "frequency_hours": 24
}
```

### Update Email Reminder Configuration

```http
PUT /api/me/email-reminders/config
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "frequency_hours": 12,
  "active": true
}
```

### Get Last Email Status

```http
GET /api/me/email-reminders/last-sent
Authorization: Bearer <jwt-token>
```

Response:
```json
{
  "last_email_sent": "2024-01-15T10:30:00Z",
  "last_checked_at": "2024-01-15T10:30:00Z"
}
```

### Get Due Todos (Debug/Test)

```http
GET /api/me/email-reminders/due-todos
Authorization: Bearer <jwt-token>
```

### Manual Trigger (Admin Only)

```http
POST /api/email-reminders/send-all
Authorization: Bearer <jwt-token>
```

This endpoint sends emails to all users with due todos immediately.

## Database Schema

### email_reminders_config

Stores user preferences for email reminders:

| Column | Type | Description |
|--------|------|-------------|
| user_id | VARCHAR(255) | User identifier (PK) |
| frequency_millis | BIGINT | Minimum time between emails in milliseconds |
| active | BOOLEAN | Enable/disable reminders |
| created_at | TIMESTAMP | Creation timestamp |

### email_reminder_status

Tracks when each user was last emailed:

| Column | Type | Description |
|--------|------|-------------|
| user_id | VARCHAR(255) | User identifier (PK) |
| last_email_sent | TIMESTAMP | Last time email was sent |
| last_checked_at | TIMESTAMP | Last time status was updated |

### todos (modified)

| Column | Type | Description |
|--------|------|-------------|
| due_date | TIMESTAMP | Due date (now included) |

## Frequency Settings

The `frequency_millis` field controls how often users receive reminder emails. The default is 86400000 milliseconds (24 hours).

Common values:
- 3600000 = 1 hour
- 7200000 = 2 hours
- 86400000 = 24 hours (default)
- 43200000 = 12 hours

## Testing

To test the email reminders manually:

1. Create a todo with a due date in the future:
```bash
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test task due tomorrow",
    "due_date": "TOMORROW"
  }'
```

2. Check the configuration:
```bash
curl http://localhost:3000/api/me/email-reminders/config \
  -H "Authorization: Bearer <jwt-token>"
```

3. Update frequency (optional):
```bash
curl -X PUT http://localhost:3000/api/me/email-reminders/config \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"frequency_hours": 1}'
```

4. Manually trigger if needed (optional):
```bash
curl -X POST http://localhost:3000/api/email-reminders/send-all \
  -H "Authorization: Bearer <admin-jwt-token>"
```

## Open Source Tools Used

- **Nodemailer**: SMTP email sending library
- **Node.js**: Runtime environment
- **PostgreSQL**: Database storage

All dependencies are open source and maintained.
