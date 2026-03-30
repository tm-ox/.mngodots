#!/bin/bash

# Configuration
REPO="/mnt/nvme/backups/t480s_remote"
REMOTE_USER="tm-serve"
REMOTE_IP="100.65.133.78"
MOUNT_POINT="$HOME/mnt/t480s_remote"
PW_FILE="$HOME/.restic_pw"
EXCLUDES="/home/tm/.mngodots/scripts/.config/scripts/restic-excludes.txt"

# 1. Ensure Local Mount Point
mkdir -p "$MOUNT_POINT"

# 2. Check if NVMe is mounted
if ! mountpoint -q /mnt/nvme; then
    echo "Error: NVMe backup drive not mounted at /mnt/nvme."
    exit 1
fi

# 3. Mount Remote Server via SSHFS
# -o reconnect ensures stability over Tailscale
sshfs $REMOTE_USER@$REMOTE_IP:/home/tm-serve/ "$MOUNT_POINT" -o reconnect

# 4. Freeze Remote State (Optional but safer for Docker DBs)
ssh $REMOTE_USER@$REMOTE_IP "docker stop \$(docker ps -q)"

# 5. Execute Real Backup (No dry-run)
restic -r "$REPO" --password-file "$PW_FILE" \
    backup "$MOUNT_POINT" \
    --exclude-file "$EXCLUDES" \
    --verbose

# 6. Resume Remote State
ssh $REMOTE_USER@$REMOTE_IP "cd ~ && docker compose up -d"

# 7. Cleanup
# Unmount the remote filesystem
fusermount -u "$MOUNT_POINT"

# Keep last 7 daily snapshots and prune old data
restic -r "$REPO" --password-file "$PW_FILE" forget --keep-daily 7 --prune

echo "Backup of T480s complete."
