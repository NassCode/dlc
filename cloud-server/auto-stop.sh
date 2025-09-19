#!/bin/bash

# Auto-stop script to save costs
# Usage: ./auto-stop.sh [hours]

HOURS=${1:-1}
MINUTES=$((HOURS * 60))

echo "🕐 Auto-stop scheduled in $HOURS hour(s)"
echo "💰 This will save you ~\$0.54 per hour when stopped"
echo ""
echo "⚠️  Server will shutdown in $HOURS hour(s) at $(date -d "+$HOURS hours" '+%H:%M')"
echo ""
echo "To cancel: sudo shutdown -c"

# Schedule shutdown
sudo shutdown -h +$MINUTES

echo "✅ Auto-stop scheduled!"
echo ""
echo "💡 To extend time:"
echo "   sudo shutdown -c          # Cancel current shutdown"
echo "   ./auto-stop.sh 2          # Schedule 2 more hours"