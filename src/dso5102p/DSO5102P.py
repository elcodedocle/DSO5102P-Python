#
# Thanks to:
#   https://web.archive.org/web/20241012215844/https://elinux.org/Das_Oszi_Protocol (protocol)
#   https://web.archive.org/web/20221013121459/https://randomprojects.org/wiki/Voltcraft_DSO-3062C (usb)
#
# DSO5102P:
#  - idVendor=0x049f
#  - idProduct=0x505a
#  - EndpointAddress=0x81
#  - wMaxPacketSize=0x200
#

import logging
import usb
import time
import array
import numpy as np


class DSO5102P:
    def __init__(self, id_vendor=0x049f, id_product=0x505a, debug=False):
        self.log = logging.getLogger("DSO5102P")
        self.debug = debug
        if self.debug:
            self.log.setLevel(logging.DEBUG)
        else:
            self.log.setLevel(logging.INFO)
        self.dev = usb.core.find(idVendor=id_vendor, idProduct=id_product)
        if self.dev is None:
            raise IOError('DSO5102P Not found')

        # unload 'cdc_subset'
        if self.dev.is_kernel_driver_active(0):
            self.dev.detach_kernel_driver(0)

        # clean buffers
        while True:
            try:
                r = self.dev.read(0x81, 512, 1000)
                self._dump('FLUSH', r)
            except usb.core.USBError as e:
                self.log.exception('FLUSH:', exc_info=e)
                break

    def _dump(self, origin, data):
        self.log.debug("%s: %s", origin, ['0x%02X' % h for h in data])

    def _send_command(self, origin, cmd, data, is_debug=False):
        assert isinstance(data, array.array), '\'data\' must be array.array(\'B\')'

        time.sleep(0.1)
        action = 0x43 if is_debug else 0x53
        packet_len = 1 + len(data) + 1
        packet = array.array('B', [action, packet_len & 0xFF, (packet_len >> 8) & 0xFF, cmd]) + data
        packet = packet + array.array('B', [sum(packet) & 0xFF])
        self._dump(origin.upper(), packet[:5])
        self.dev.write(0x02, packet)
        return packet

    def _read_answer(self, origin, rcode):
        while True:
            r = self.dev.read(0x81, 1024 * 1024, 500)
            chksum = int(sum(r[:-1])) & 0xFF
            if chksum != r[-1]:
                self._dump('BADCHKSUM', r[:5])
            if r[3] == rcode:
                break
            else:
                self._dump('BADANSWER', r[:5])
        self._dump(origin, r[:5])
        return r

    def echo(self, data):
        data = array.array('B', data)
        self._send_command('Echo', 0x00, data)
        r = self._read_answer('Echo', 0x80)
        return list(r[4:-1])

    def read_settings(self):
        self._send_command('ReadSettings', 0x01, array.array('B'))
        r = self._read_answer('ReadSettings', 0x81)
        return r[4:-1]

    def read_sample_data(self, channel):
        self._send_command('ReadSampleData', 0x02, array.array('B', [0x01, channel & 0x01]))
        r = array.array('B')
        while True:
            d = self._read_answer('ReadSampleData', 0x82)
            if d[4] == 0x00:
                break
            elif d[4] == 0x01:
                r = r + d[6:-1]
            elif d[4] == 0x02:
                break
            else:
                break
        return r

    def read_file(self, fname):
        self._send_command('ReadFile', 0x10, array.array('B', bytearray('\x00' + fname, 'utf8')))
        r = array.array('B')
        while True:
            d = self._read_answer('ReadFile', 0x90)
            if d[4] == 0x01:
                r = r + d[5:-1]
            else:
                # checksum???
                break
        r = ''.join([chr(c) for c in r])
        return r

    def lock_control_panel(self):
        self._send_command('LockControlPanel', 0x12, array.array('B', [0x01, 0x01]))
        self._read_answer('LockControlPanel', 0x92)

    def unlock_control_panel(self):
        self._send_command('UnLockControlPanel', 0x12, array.array('B', [0x01, 0x00]))
        self._read_answer('UnLockControlPanel', 0x92)

    def start_acquisition(self):
        self._send_command('StartAcquisition', 0x12, array.array('B', [0x00, 0x00]))
        self._read_answer('StartAcquisition', 0x92)

    def stop_acquisition(self):
        self._send_command('StopAcquisition', 0x12, array.array('B', [0x00, 0x01]))
        self._read_answer('StopAcquisition', 0x92)

    def key_trigger(self, b1, b2):
        self._send_command('KeyTrigger', 0x13, array.array('B', [b1, b2]))
        self._read_answer('KeyTrigger', 0x93)

    def screenshot(self):
        self._send_command('Screenshot', 0x20, array.array('B'))
        bmp = array.array('B')
        while True:
            d = self._read_answer('Screenshot', 0xA0)
            if d[4] == 0x01:
                bmp = bmp + d[5:-1]
            else:
                # checksum???
                break
        img = np.frombuffer(bytearray(bmp), dtype=np.uint16).reshape(480, 800)
        img = img.astype(np.uint8)
        return img

    def read_system_time(self):
        self._send_command('ReadSystemTime', 0x21, array.array('B'))
        r = self._read_answer('ReadSystemTime', 0xA1)
        r = '%04d-%02d-%02d %02d:%02d:%02d' % (r[5] * 0xFF + r[4] + 7, r[6], r[7], r[8], r[9], r[10])
        return r

    def remote_shell(self, cmdline):
        self._send_command('RemoteShell', 0x11, array.array('B', bytearray(cmdline, 'utf8')), True)
        r = self._read_answer('RemoteShell', 0x91)
        r = ''.join([chr(c) for c in r])
        return r
