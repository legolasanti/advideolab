#!/bin/bash
#
# VPS Initial Setup Script for UGC Video SaaS (AdVideoLab)
#
# Usage: Run on a fresh Ubuntu 22.04/24.04 VPS
# curl -sL <url-to-this-script> | bash
# OR
# ./vps-setup.sh
#
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  log_error "Please run as root (sudo ./vps-setup.sh)"
  exit 1
fi

log_info "Starting VPS setup for AdVideoLab..."

# 1. Update system
log_info "Updating system packages..."
apt-get update
apt-get upgrade -y

# 2. Install essential packages
log_info "Installing essential packages..."
apt-get install -y \
  curl \
  wget \
  git \
  vim \
  htop \
  ufw \
  fail2ban \
  unzip \
  ca-certificates \
  gnupg \
  lsb-release

# 3. Install Docker
log_info "Installing Docker..."
if ! command -v docker &> /dev/null; then
  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Add Docker repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Start and enable Docker
  systemctl start docker
  systemctl enable docker

  log_info "Docker installed successfully"
else
  log_info "Docker already installed"
fi

# 4. Configure firewall
log_info "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

log_info "Firewall configured (SSH, HTTP, HTTPS allowed)"

# 5. Configure fail2ban
log_info "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl restart fail2ban
systemctl enable fail2ban

# 6. Create app directory
log_info "Creating application directory..."
mkdir -p /opt/advideolab
mkdir -p /var/backups/advideolab/postgres
chown -R root:root /opt/advideolab

# 7. Set up automatic security updates
log_info "Configuring automatic security updates..."
apt-get install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

# 8. Configure Docker logging
log_info "Configuring Docker logging limits..."
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

# 9. Set up backup cron job
log_info "Setting up daily backup cron job..."
cat > /etc/cron.d/advideolab-backup << 'EOF'
# Daily PostgreSQL backup at 3:00 AM
0 3 * * * root /opt/advideolab/scripts/backup-postgres.sh >> /var/log/advideolab-backup.log 2>&1
EOF

# 10. Create backup configuration
log_info "Creating backup configuration..."
cat > /etc/advideolab-backup.env << 'EOF'
# PostgreSQL Backup Configuration
DOCKER_CONTAINER=advideolab-db-1
POSTGRES_USER=app
POSTGRES_DB=app
BACKUP_DIR=/var/backups/advideolab/postgres
RETENTION_DAYS=30
EOF

# 11. Increase system limits for production
log_info "Configuring system limits..."
cat >> /etc/sysctl.conf << 'EOF'

# AdVideoLab production tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
vm.overcommit_memory = 1
EOF
sysctl -p

# 12. Create swap file if not exists (for smaller VPS)
if [ ! -f /swapfile ]; then
  log_info "Creating 2GB swap file..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log_info "========================================="
log_info "VPS setup completed successfully!"
log_info "========================================="
log_info ""
log_info "Next steps:"
log_info "1. Upload your project to /opt/advideolab"
log_info "2. Create .env file from .env.example"
log_info "3. Run: cd /opt/advideolab && docker compose -f docker-compose.prod.yml up -d"
log_info ""
log_info "Security notes:"
log_info "- Firewall is active (SSH, HTTP, HTTPS only)"
log_info "- Fail2ban is protecting SSH"
log_info "- Daily backups scheduled at 3:00 AM"
log_info "- Change your SSH password immediately!"
log_info ""
