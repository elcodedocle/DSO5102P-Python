#! /usr/bin/python3

import cv2
from dso5102p.DSO5102P import DSO5102P


def main():
    dso = DSO5102P(0x049f, 0x505a, False)

    print('Getting the screenshot')
    r = dso.screenshot()

    print('Saving ...')
    st = dso.read_system_time()
    cv2.imwrite('./screenshot/' + st + '.png', r)

    print('Press ESC to exit ...')
    cv2.imshow(st, r)
    while cv2.waitKey(5) != 27:
        pass
    cv2.destroyAllWindows()


# show time
main()
