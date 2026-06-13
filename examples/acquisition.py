#! /usr/bin/python3

import time
from dso5102p.DSO5102P import DSO5102P


def main():
    dso = DSO5102P(0x049f, 0x505a, True)

    r = dso.echo([1, 2, 3, 4, 5, 6])
    print('Echo:', r)

    r = dso.read_system_time()
    print(r)

    # see inf/keyprotocol.inf
    #   [FN-0-KEY] is 0x00, [MENU-ACQUIRE-KEY] is 0x0D and so on
    dso.key_trigger(0x0C, 0x01)  # MENU-MEASURE-KEY
    time.sleep(4)
    dso.key_trigger(0x0D, 0x01)  # MENU-ACQUIRE-KEY

    print('Lock Panel')
    dso.lock_control_panel()
    time.sleep(2)
    print('Unlock Panel')
    dso.unlock_control_panel()

    print('Start Acquisition')
    dso.start_acquisition()
    time.sleep(2)
    print('Stop Acquisition')
    dso.stop_acquisition()
    time.sleep(2)
    print('Start Acquisition')
    dso.start_acquisition()


# show time
main()
