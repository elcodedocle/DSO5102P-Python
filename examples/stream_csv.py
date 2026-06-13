#! /usr/bin/python3

import time
import sys
from dso5102p.DSO5102P import DSO5102P


def main():
    # Initialize connection to DSO5102P (VID, PID, debug_mode)
    # Using default values (0x049f, 0x505a)
    print("Connecting to DSO5102P...", file=sys.stderr)
    try:
        dso = DSO5102P(0x049f, 0x505a, debug=False)
    except Exception as e:
        print(f"Error connecting to device: {e}", file=sys.stderr)
        sys.exit(1)

    print("\n--- Example 1: Stream CH1 to stdout for 3 seconds ---", file=sys.stderr)
    dso.start(file_handler=None, capture_duration_s=3.0, channel=0)
    
    # Wait for the background thread to finish or be stopped
    try:
        while getattr(dso, "_streaming", False):
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nStopping stream...", file=sys.stderr)
        dso.stop()

    print("\n--- Example 2: Stream CH1 to a file for 5 seconds ---", file=sys.stderr)
    output_file = "live_wave_data.csv"
    print(f"Writing stream to '{output_file}'...", file=sys.stderr)
    
    dso.start(file_handler=output_file, capture_duration_s=5.0, channel=0)
    
    try:
        while getattr(dso, "_streaming", False):
            time.sleep(0.1)
    except KeyboardInterrupt:
        print("\nStopping stream...", file=sys.stderr)
        dso.stop()

    print(f"\nDone! CSV stream data saved to '{output_file}'.", file=sys.stderr)


if __name__ == "__main__":
    main()
