#!/bin/sh

# Check current Bluetooth state using bluetoothctl
BT_STATE=$(bluetoothctl show | grep -o -m 1 'Powered: .*$' | awk -F: '{print $2}')

# If Bluetooth is powered on, turn it off
if [ "$BT_STATE" = "on" ] ; then
  bluetoothctl power off
  echo "Bluetooth disabled."
else
  # Otherwise, turn it on
  bluetoothctl power on
  echo "Bluetooth enabled."
fi