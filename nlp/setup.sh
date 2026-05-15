#!/bin/bash
# Setup script for NLP Event Extraction service

set -e

echo "Setting up NLP Event Extraction service..."

# Check Python version
python_version=$(python --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
echo "Python version: $python_version"

# Create virtual environment
echo "Creating virtual environment..."
python -m venv venv

# Activate virtual environment
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate 2>/dev/null || true

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Download spaCy English model
echo "Downloading spaCy English model (en_core_web_sm)..."
python -m spacy download en_core_web_sm

echo ""
echo "Setup complete!"
echo ""
echo "To start the service, run:"
echo "  ./run_service.sh"
echo ""
echo "Or manually:"
echo "  source venv/bin/activate  # or venv\\Scripts\\activate on Windows"
echo "  python -m nlp.service --port 5001"