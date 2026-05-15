#!/bin/bash
# Run script for NLP Event Extraction service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Virtual environment not found. Running setup..."
    bash setup.sh
fi

# Activate virtual environment
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate 2>/dev/null

# Default port
PORT=${1:-5001}
HOST=${2:-127.0.0.1}

echo "Starting NLP service on $HOST:$PORT..."
python -m nlp.service --port $PORT --host $HOST