# Email Reminder Deployment Guide

## Quick Start

### 1. Build Images

```bash
# Build the main app
docker build -t ghcr.io/robinvdveer/metrics-server:latest .

# Build the email worker
docker build -f Dockerfile.email-worker -t ghcr.io/robinvdveer/metrics-email-worker:latest .
```

### 2. Deploy to Kubernetes (Production)

```bash
# Use Helm with production values
helm upgrade --install metrics-server ./deploy/chart \
  --namespace metrics-server \
  --values deploy/values-prod.yaml \
  --set smtp.createSecrets=true
```

### 3. Deploy to Kubernetes (Staging)

```bash
# Use Helm with staging values
helm upgrade --install metrics-server ./deploy/chart \
  --namespace metrics-server \
  --values deploy/values-staging.yaml
```

### 4. Start with docker-compose

```bash
# Set required environment variables
export SMTP_HOST=smtp.gmail.com
export SMTP_USER=your-email@gmail.com
export SMTP_PASS=your-app-password
export FRONTEND_URL=http://localhost:3000
export FROM_EMAIL=noreply@your-app.com

# Start all services
docker-compose up -d

# Check worker status
docker-compose ps email-worker
```

## Required Environment Variables

### SMTP Configuration
- `SMTP_HOST` - SMTP server hostname (required)
- `SMTP_PORT` - SMTP server port (default: 587 for TLS, 465 for SSL)
- `SMTP_USER` - SMTP username (required)
- `SMTP_PASS` - SMTP password (required)
- `SMTP_SECURE` - Use SSL/TLS (default: false)

### Email Reminder Configuration
- `EMAIL_DEFAULT_FREQUENCY_HOURS` - Default frequency in hours (default: 24)
- `EMAIL_CHECK_INTERVAL` - Seconds between checks (default: 3600 = 1 hour)
- `FROM_EMAIL` - Sender email address (default: SMTP_USER)
- `FRONTEND_URL` - Frontend URL for links (default: http://localhost:3000)

## Database Setup

### Option 1: Run from existing database
```bash
# Apply migrations manually
psql -U todouser -d tododb -f migrations/001_add_email_reminders.sql
```

### Option 2: Use Docker volume with existing init script
```bash
# The init-db.sql is included in migrations/001_add_email_reminders.sql
docker-compose up
```

## API Quick Reference

### Get Email Settings
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/me/email-reminders/config
```

### Update Email Settings
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"frequency_hours": 12, "active": true}' \
  http://localhost:3000/api/me/email-reminders/config
```

### Trigger Emails Manually
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/email-reminders/send-all
```

## Email Service Configuration Options

### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop  # App password, not normal password
FROM_EMAIL=your-email@gmail.com
```

### Outlook
```env
SMTP_HOSTsmtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
FROM_EMAIL=your-email@outlook.com
```

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=YOUR_SENDGRID_API_KEY
FROM_EMAIL=noreply@yourdomain.com
```

### Custom SMTP (e.g., AWS SES)
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=AKIAIOSFODNN7EXAMPLE
SMTP_PASS=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SMTP_SECURE=true
FROM_EMAIL=test@example.com
```

## Testing

### Test 1: Create a due todo

```bash
# Create a todo due tomorrow
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test task due tomorrow",
    "due_date": "tomorrow"
  }'
```

### Test 2: Update alert frequency

```bash
curl -X PUT http://localhost:3000/api/me/email-reminders/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"frequency_hours": 1, "active": true}'
```

### Test 3: Trigger emails manually

```bash
curl -X POST http://localhost:3000/api/email-reminders/send-all \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Monitoring

### Check worker health
```bash
docker-compose exec email-worker curl http://localhost:3001/health
```

### Check email delivery logs
```bash
# For nodemailer with debug enabled:
export NODemailer_DEBUG=1
docker-compose restart email-worker
```

### View sent emails (with debug)
```bash
# In development, nodemailer can log to console
docker-compose logs email-worker | grep "Sent mail"
```

## Troubleshooting

### Email not being sent
1. Check email worker is running: `docker-compose ps email-worker`
2. Check logs: `docker-compose logs email-worker`
3. Verify SMTP configuration
4. Check email reminder config is enabled: `GET /api/me/email-reminders/config`

### Database migration errors
1. Check if migrations directory exists
2. Manually apply migration: `psql -U todouser -d tododb -f migrations/001_add_email_reminders.sql`
3. Check database connection

### Nodemailer debug
For development, add this to .env:
```env
NODE_DEBUG=nodemailer
```

## Security

- SMTP credentials are never stored in config files
- Always use environment variables for production
- Use Kubernetes secrets in production (already configured in Helm chart)
- Set `smtp.createSecrets=true` in values file for automatic secret generation (development only)
- Set `smtp.createSecrets=false` and use EXTERNAL_SECRETS for production

## Cost Considerations

- Free SMTP options: Gmail (465/day sent limit), Zoho Mail, Postmark
- Paid SMTP options: SendGrid, Mailgun, AWS SES (pay per email)
- Monitor email volume to avoid hitting limits

## Next Steps

1. Configure your SMTP server
2. Set environment variables
3. Test with sample emails
4. Monitor email deliverability
5. Adjust frequency settings as needed
