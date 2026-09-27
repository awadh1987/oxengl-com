#!/bin/bash
# Monolith Infrastructure Sanitization & Binary Recovery Script

echo "======================================================================"
echo "🧹 STARTING REPOSITORY SANITIZATION SWEEP"
echo "======================================================================"

# 1. Clean up broken virtual environments
if [ -d "/root/oxen-gl/backend/.venv" ]; then
    echo "⚠️ Removing corrupted virtual environment trackers..."
    rm -rf /root/oxen-gl/backend/.venv
fi

if [ -d "/root/oxen-gl/venv" ]; then
    echo "⚠️ Removing duplicate root level environment folders..."
    rm -rf /root/oxen-gl/venv
fi

# 2. Re-create a pristine virtual environment partition
echo "⚙️ Building clean Python virtual environment container..."
python3 -m venv /root/oxen-gl/backend/.venv

# 3. Scan for any temporary or lock files created by the agent loop
echo "🔍 Purging temporary agent cache arrays and lock layers..."
find /root/oxen-gl/ -type f -name "*.shadow" -delete
find /root/oxen-gl/ -type f -name "*.tmp" -delete
find /root/oxen-gl/ -type f -name ".DS_Store" -delete

# 4. Flush VS Code workspace cache settings that cause the interpreter spinner to hang
echo "🧹 Flushing local VS Code state buffers..."
rm -rf /root/oxen-gl/.vscode/.suo 2>/dev/null || true
rm -rf /root/oxen-gl/.vscode/browse.vc.db 2>/dev/null || true

echo "======================================================================"
echo "✅ SANITIZATION COMPLETE: Workspace environments are completely clean."
echo "======================================================================"
