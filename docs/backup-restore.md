# Database Backup & Restore Runbook

## Overview

This document describes how to set up automated PostgreSQL backups on your production VPS using cron-based `pg_dump`. This approach is recommended over a separate backup container because:

1. **Simplicity**: No additional container to manage or monitor
2. **Reliability**: Native PostgreSQL tools are battle-tested
3. **Flexibility**: Easy to customize retention, compression, and offsite sync
4. **Resource efficiency**: Runs only when needed, not as a long-running service

## Prerequisites

- SSH access to your production VPS
- PostgreSQL client tools installed (`pg_dump`, `pg_restore`)
- Sufficient disk space (rule of thumb: 3x your current database size for 30-day retention)

## Backup Strategy

| Component | Method | Frequency | Retention |
|-----------|--------|-----------|-----------|
| PostgreSQL | pg_dump (custom format) | Daily at 02:00 UTC | 30 days |
| MinIO/S3 data | Volume backup or S3 replication | Daily | 30 days |

---

## Setup Instructions

### 1. Create Backup Directory

```bash
sudo mkdir -p /var/backups/ugcvideo/postgres
sudo chown $(whoami):$(whoami) /var/backups/ugcvideo/postgres
chmod 700 /var/backups/ugcvideo/postgres
```

### 2. Install the Backup Script

Copy the script from `scripts/backup-postgres.sh` to your VPS:

```bash
sudo cp scripts/backup-postgres.sh /usr/local/bin/ugcvideo-backup
sudo chmod +x /usr/local/bin/ugcvideo-backup
```

Or create it manually - see the script in `scripts/backup-postgres.sh`.

### 3. Configure Environment

Create a secure credentials file:

```bash
sudo touch /etc/ugcvideo-backup.env
sudo chmod 600 /etc/ugcvideo-backup.env
sudo chown root:root /etc/ugcvideo-backup.env
```

Add your database credentials:

```bash
# /etc/ugcvideo-backup.env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=app
POSTGRES_USER=app
POSTGRES_PASSWORD=your_secure_password_here
BACKUP_DIR=/var/backups/ugcvideo/postgres
RETENTION_DAYS=30
```

### 4. Set Up Cron Job

```bash
# Edit root's crontab
sudo crontab -e

# Add this line (runs daily at 02:00 UTC):
0 2 * * * /usr/local/bin/ugcvideo-backup >> /var/log/ugcvideo-backup.log 2>&1
```

### 5. Verify Setup

Run a manual backup to verify everything works:

```bash
sudo /usr/local/bin/ugcvideo-backup
ls -la /var/backups/ugcvideo/postgres/
```

---

## Backup Script Details

The backup script (`scripts/backup-postgres.sh`) performs:

1. Creates a timestamped backup using `pg_dump` in custom format
2. Compresses the backup with gzip
3. Validates the backup file is not empty
4. Removes backups older than RETENTION_DAYS
5. Logs all operations with timestamps

**Custom format** is used because it:
- Supports parallel restore
- Allows selective table restore
- Compresses efficiently
- Handles large objects properly

---

## Restore Procedures

### Full Database Restore

**Warning**: This will overwrite your current database!

```bash
# 1. Stop the API to prevent new connections
docker-compose -f docker-compose.prod.yml stop api

# 2. Find the backup to restore
ls -la /var/backups/ugcvideo/postgres/

# 3. Restore the backup (replace DATE with actual date)
docker exec -i ugcvideo-db-1 pg_restore \
  -U app \
  -d app \
  --clean \
  --if-exists \
  --no-owner \
  < /var/backups/ugcvideo/postgres/ugcvideo_YYYYMMDD_HHMMSS.dump.gz

# Alternative if using host PostgreSQL client:
gunzip -c /var/backups/ugcvideo/postgres/ugcvideo_YYYYMMDD_HHMMSS.dump.gz | \
  pg_restore -h localhost -U app -d app --clean --if-exists --no-owner

# 4. Restart the API
docker-compose -f docker-compose.prod.yml start api

# 5. Verify the application works
curl https://api.ugcvideo.cloud/healthz
```

### Restore to a Different Database (Testing)

```bash
# Create a test database
docker exec ugcvideo-db-1 psql -U app -c "CREATE DATABASE app_restore_test;"

# Restore to test database
gunzip -c /var/backups/ugcvideo/postgres/ugcvideo_YYYYMMDD_HHMMSS.dump.gz | \
  docker exec -i ugcvideo-db-1 pg_restore -U app -d app_restore_test --no-owner

# Verify data
docker exec ugcvideo-db-1 psql -U app -d app_restore_test -c "SELECT COUNT(*) FROM \"Tenant\";"

# Clean up test database when done
docker exec ugcvideo-db-1 psql -U app -c "DROP DATABASE app_restore_test;"
```

### Restore a Single Table

```bash
# List contents of backup
pg_restore --list /var/backups/ugcvideo/postgres/ugcvideo_YYYYMMDD_HHMMSS.dump.gz

# Restore only the Job table
gunzip -c /var/backups/ugcvideo/postgres/ugcvideo_YYYYMMDD_HHMMSS.dump.gz | \
  pg_restore -h localhost -U app -d app --table=Job --data-only
```

---

## Disk Space Considerations

### Estimating Backup Size

```bash
# Check current database size
docker exec ugcvideo-db-1 psql -U app -c "SELECT pg_size_pretty(pg_database_size('app'));"

# Check backup directory usage
du -sh /var/backups/ugcvideo/postgres/
```

### Space Requirements

| Database Size | Daily Backup (compressed) | 30-Day Retention |
|---------------|---------------------------|------------------|
| 1 GB          | ~100-200 MB               | ~3-6 GB          |
| 5 GB          | ~500 MB - 1 GB            | ~15-30 GB        |
| 10 GB         | ~1-2 GB                   | ~30-60 GB        |

**Recommendation**: Reserve at least 3x your database size for backups.

### Monitoring Disk Space

Add a disk space check to your monitoring:

```bash
# Alert if backup directory exceeds 80% of allocated space
df -h /var/backups/ugcvideo/postgres/
```

---

## Offsite Backup (Recommended)

### Option 1: Sync to S3/Backblaze B2

Install and configure rclone:

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure remote (interactive)
rclone config

# Add to cron (runs after backup at 03:00)
0 3 * * * rclone sync /var/backups/ugcvideo/postgres/ remote:ugcvideo-backups/postgres/ --log-file=/var/log/rclone-backup.log
```

### Option 2: SCP to Another Server

```bash
# Add to cron
0 3 * * * rsync -avz /var/backups/ugcvideo/postgres/ backup-user@backup-server:/backups/ugcvideo/
```

### Option 3: Use MinIO Client (mc)

If you're already using MinIO:

```bash
# Configure mc
mc alias set backup https://backup-s3.example.com ACCESS_KEY SECRET_KEY

# Sync backups
mc mirror /var/backups/ugcvideo/postgres/ backup/ugcvideo-backups/postgres/
```

---

## Monitoring & Alerting

### Check Last Backup

```bash
# Show most recent backup
ls -lt /var/backups/ugcvideo/postgres/ | head -2

# Check backup log
tail -50 /var/log/ugcvideo-backup.log
```

### Simple Alert Script

Add to cron to alert if no backup in 25 hours:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/ugcvideo/postgres"
MAX_AGE_HOURS=25
ALERT_EMAIL="admin@example.com"

LATEST=$(find "$BACKUP_DIR" -name "*.dump.gz" -mmin -$((MAX_AGE_HOURS * 60)) | head -1)
if [ -z "$LATEST" ]; then
  echo "ALERT: No PostgreSQL backup found in the last $MAX_AGE_HOURS hours" | \
    mail -s "[UGC Video] Backup Alert" "$ALERT_EMAIL"
fi
```

---

## Troubleshooting

### Backup Fails with "connection refused"

```bash
# Check if PostgreSQL is running
docker-compose -f docker-compose.prod.yml ps db

# Check PostgreSQL logs
docker-compose -f docker-compose.prod.yml logs db --tail=50
```

### Backup File is Empty or Very Small

```bash
# Check disk space
df -h

# Run pg_dump manually to see errors
docker exec ugcvideo-db-1 pg_dump -U app -Fc app > /tmp/test.dump
```

### Restore Fails with "role does not exist"

Use `--no-owner` flag to skip ownership restoration:

```bash
pg_restore -h localhost -U app -d app --no-owner backup.dump.gz
```

### Restore Fails with "table already exists"

Use `--clean` to drop objects before creating:

```bash
pg_restore -h localhost -U app -d app --clean --if-exists backup.dump.gz
```

---

## Security Notes

1. **Credentials file**: Keep `/etc/ugcvideo-backup.env` with mode 600, owned by root
2. **Backup directory**: Keep `/var/backups/ugcvideo` with mode 700
3. **Offsite encryption**: Consider encrypting backups before offsite sync using `gpg`
4. **Access logs**: Monitor who accesses backup files

### Encrypting Backups (Optional)

```bash
# Encrypt
gpg --symmetric --cipher-algo AES256 backup.dump.gz

# Decrypt
gpg --decrypt backup.dump.gz.gpg > backup.dump.gz
```
