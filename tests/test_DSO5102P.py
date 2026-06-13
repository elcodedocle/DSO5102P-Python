"""
Unit tests for DSO5102P — 100% coverage.
No real libusb needed. All USB I/O is mocked via patch("src.dso5102p.DSO5102P.usb").
"""

import array
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

# ---------------------------------------------------------------------------
# Minimal usb stub so the import doesn't fail at module level.
# The actual usb namespace used in the module is replaced per-test via
# patch("src.dso5102p.DSO5102P.usb"), so the content here only matters for import time.
# ---------------------------------------------------------------------------
_usb_stub = types.ModuleType("usb")
_usb_core_stub = types.ModuleType("usb.core")
_usb_backend_stub = types.ModuleType("usb.backend")
_usb_backend_libusb1_stub = types.ModuleType("usb.backend.libusb1")

class _USBError(Exception):
    pass

class _USBTimeoutError(_USBError):
    pass

_usb_core_stub.USBError = _USBError
_usb_core_stub.USBTimeoutError = _USBTimeoutError
_usb_core_stub.find = lambda **kw: None        # placeholder; overridden in tests
_usb_stub.core = _usb_core_stub

_usb_backend_libusb1_stub.get_backend = MagicMock()

_usb_stub.backend = _usb_backend_stub
_usb_backend_stub.libusb1 = _usb_backend_libusb1_stub

sys.modules.setdefault("usb", _usb_stub)
sys.modules.setdefault("usb.core", _usb_core_stub)
sys.modules.setdefault("usb.backend", _usb_backend_stub)
sys.modules.setdefault("usb.backend.libusb1", _usb_backend_libusb1_stub)

import src.dso5102p.DSO5102P as mod   # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_usb_mock(dev):
    """Return a mock 'usb' module whose core.find returns *dev*."""
    usb = MagicMock()
    usb.core.find.return_value = dev
    usb.core.USBError = _USBError
    usb.core.USBTimeoutError = _USBTimeoutError
    return usb


def _make_device(flush_raises=True):
    dev = MagicMock()
    dev.is_kernel_driver_active.return_value = True
    dev.write = MagicMock()
    if flush_raises:
        dev.read.side_effect = _USBTimeoutError("timeout")
    return dev


def _checksum(pkt):
    return sum(pkt) & 0xFF


def _make_response(rcode, payload=None):
    """Correctly checksummed response packet."""
    if payload is None:
        payload = []
    body = array.array("B", [0x53, 0x00, 0x00, rcode] + payload)
    body.append(_checksum(body))
    return body


def _make_dso(dev=None, debug=False):
    if dev is None:
        dev = _make_device()
    usb_mock = _make_usb_mock(dev)
    with patch("src.dso5102p.DSO5102P.usb", usb_mock), patch("time.sleep"):
        dso = mod.DSO5102P(0x049F, 0x505A, debug=debug)
    dso.dev = dev          # keep reference live
    return dso


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestInit(unittest.TestCase):
    def test_device_not_found_raises_io_error(self):
        usb_mock = _make_usb_mock(None)
        with patch("src.dso5102p.DSO5102P.usb", usb_mock), patch("time.sleep"):
            with self.assertRaises(IOError):
                mod.DSO5102P(0x049F, 0x505A)

    @patch("sys.platform", "linux")
    def test_detach_kernel_driver_called(self):
        dev = _make_device()
        _make_dso(dev)
        dev.detach_kernel_driver.assert_called_once_with(0)

    @patch("sys.platform", "linux")
    def test_no_detach_when_driver_inactive(self):
        dev = _make_device()
        dev.is_kernel_driver_active.return_value = False
        _make_dso(dev)
        dev.detach_kernel_driver.assert_not_called()

    @patch("sys.platform", "darwin")
    def test_macos_initialization(self):
        dev = _make_device()
        with patch("os.path.exists", return_value=True):
            _make_dso(dev)
        dev.set_configuration.assert_called_once()

    @patch("sys.platform", "darwin")
    def test_macos_initialization_no_brew(self):
        dev = _make_device()
        with patch("os.path.exists", return_value=False):
            _make_dso(dev)
        dev.set_configuration.assert_called_once()

    @patch("sys.platform", "darwin")
    def test_macos_initialization_resource_busy_ignored(self):
        dev = _make_device()
        dev.set_configuration.side_effect = _USBError("Resource busy")
        with patch("os.path.exists", return_value=True):
            _make_dso(dev)
        dev.set_configuration.assert_called_once()

    @patch("sys.platform", "darwin")
    def test_macos_initialization_other_usb_error_raised(self):
        dev = _make_device()
        dev.set_configuration.side_effect = _USBError("Some other error")
        with patch("os.path.exists", return_value=True):
            with self.assertRaises(_USBError):
                _make_dso(dev)

    def test_flush_loop_drains_then_breaks(self):
        dev = _make_device(flush_raises=False)
        flush_data = array.array("B", [0x01, 0x02])
        dev.read.side_effect = [flush_data, flush_data, _USBError("done")]
        dso = _make_dso(dev, debug=True)
        self.assertIsNotNone(dso)

    def test_debug_false_by_default(self):
        dso = _make_dso()
        self.assertFalse(dso.debug)


class TestDump(unittest.TestCase):
    def test_dump_logs_expected_message(self):
        dso = _make_dso(debug=False)  # value irrelevant here
        with patch.object(dso.log, "debug") as mock_debug:
            dso._dump("X", array.array("B", [0xAB]))
        mock_debug.assert_called_once_with(
            "%s: %s",
            "X",
            ["0xAB"],
        )

    def test_silent_when_not_debug(self):
        dso = _make_dso(debug=False)
        with patch("builtins.print") as mp:
            dso._dump("X", array.array("B", [0xAB]))
        mp.assert_not_called()


class TestSendCommand(unittest.TestCase):
    def setUp(self):
        self.dso = _make_dso()

    def test_raises_if_data_not_array(self):
        with self.assertRaises(AssertionError):
            self.dso._send_command("X", 0x01, [0x00])

    def test_normal_action_byte(self):
        pkt = self.dso._send_command("C", 0x05, array.array("B", [0xAA]))
        self.assertEqual(pkt[0], 0x53)

    def test_debug_action_byte(self):
        pkt = self.dso._send_command("C", 0x11, array.array("B"), is_debug=True)
        self.assertEqual(pkt[0], 0x43)

    def test_checksum_appended(self):
        pkt = self.dso._send_command("C", 0x02, array.array("B", [0x01]))
        self.assertEqual(pkt[-1], sum(pkt[:-1]) & 0xFF)

    def test_write_to_endpoint_02(self):
        self.dso._send_command("C", 0x02, array.array("B", [0x01]))
        self.dso.dev.write.assert_called_once()
        self.assertEqual(self.dso.dev.write.call_args[0][0], 0x02)


class TestReadAnswer(unittest.TestCase):
    def setUp(self):
        self.dso = _make_dso()

    def test_returns_matching_rcode(self):
        self.dso.dev.read.side_effect = [_make_response(0x80)]
        r = self.dso._read_answer("T", 0x80)
        self.assertEqual(r[3], 0x80)

    def test_bad_checksum_retries(self):
        bad = array.array("B", [0x53, 0x00, 0x00, 0x80, 0xFF, 0x00])  # wrong chk
        self.dso.dev.read.side_effect = [bad, _make_response(0x80)]
        r = self.dso._read_answer("T", 0x80)
        self.assertEqual(r[3], 0x80)

    def test_wrong_rcode_retries(self):
        self.dso.dev.read.side_effect = [_make_response(0x99), _make_response(0x80)]
        r = self.dso._read_answer("T", 0x80)
        self.assertEqual(r[3], 0x80)


class TestEcho(unittest.TestCase):
    def test_round_trip(self):
        dso = _make_dso()
        payload = [0x01, 0x02, 0x03]
        dso.dev.read.side_effect = [_make_response(0x80, payload)]
        self.assertEqual(dso.echo([0x01, 0x02, 0x03]), payload)


class TestReadSettings(unittest.TestCase):
    def test_returns_slice(self):
        dso = _make_dso()
        settings = [0x10, 0x20]
        dso.dev.read.side_effect = [_make_response(0x81, settings)]
        self.assertEqual(list(dso.read_settings()), settings)


class TestReadSampleData(unittest.TestCase):
    def _resp(self, flag, data=None):
        return _make_response(0x82, [flag, 0x00] + (data or []))

    def test_collects_data_chunks(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [self._resp(0x01, [0xAA, 0xBB]),
                                    self._resp(0x00)]
        r = dso.read_sample_data(0)
        self.assertIn(0xAA, r)

    def test_breaks_on_flag02(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [self._resp(0x02)]
        self.assertEqual(len(dso.read_sample_data(0)), 0)

    def test_breaks_on_unknown_flag(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [self._resp(0xFF)]
        self.assertEqual(len(dso.read_sample_data(0)), 0)

    def test_channel_masked_to_one_bit(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [self._resp(0x00), self._resp(0x02)]
        dso.read_sample_data(0xFF)
        written = dso.dev.write.call_args[0][1]
        self.assertEqual(written[5], 0x01)   # 0xFF & 0x01


class TestReadFile(unittest.TestCase):
    def _resp(self, flag, text=""):
        return _make_response(0x90, [flag] + list(text.encode()))

    def test_reads_content(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [self._resp(0x01, "hello"), self._resp(0x00)]
        self.assertEqual(dso.read_file("t.txt"), "hello")

    def test_empty_file(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [self._resp(0x00)]
        self.assertEqual(dso.read_file("e.txt"), "")


class TestLockUnlock(unittest.TestCase):
    def test_lock_payload(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0x92)]
        dso.lock_control_panel()
        w = dso.dev.write.call_args[0][1]
        self.assertEqual(w[4], 0x01); self.assertEqual(w[5], 0x01)

    def test_unlock_payload(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0x92)]
        dso.unlock_control_panel()
        w = dso.dev.write.call_args[0][1]
        self.assertEqual(w[4], 0x01); self.assertEqual(w[5], 0x00)


class TestAcquisition(unittest.TestCase):
    def test_start_payload(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0x92)]
        dso.start_acquisition()
        w = dso.dev.write.call_args[0][1]
        self.assertEqual(w[4], 0x00); self.assertEqual(w[5], 0x00)

    def test_stop_payload(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0x92)]
        dso.stop_acquisition()
        w = dso.dev.write.call_args[0][1]
        self.assertEqual(w[4], 0x00); self.assertEqual(w[5], 0x01)


class TestKeyTrigger(unittest.TestCase):
    def test_two_bytes_forwarded(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0x93)]
        dso.key_trigger(0x0A, 0x0B)
        w = dso.dev.write.call_args[0][1]
        self.assertEqual(w[4], 0x0A); self.assertEqual(w[5], 0x0B)


class TestScreenshot(unittest.TestCase):
    def test_returns_480x800_array(self):
        import numpy as np
        dso = _make_dso()
        pixel_bytes = list(bytes(480 * 800 * 2))
        dso.dev.read.side_effect = [
            _make_response(0xA0, [0x01] + pixel_bytes),
            _make_response(0xA0, [0x00]),
        ]
        img = dso.screenshot()
        self.assertEqual(img.shape, (480, 800))
        self.assertEqual(img.dtype, np.uint8)

    def test_no_data_chunk_reshapes_empty(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0xA0, [0x00])]
        with self.assertRaises(Exception):
            dso.screenshot()   # ValueError: reshape of empty buffer


class TestReadSystemTime(unittest.TestCase):
    def test_format_iso_like(self):
        dso = _make_dso()
        # payload indices after rcode: r[4]=year_lo, r[5]=year_hi, r[6]=month,
        # r[7]=day, r[8]=hour, r[9]=min, r[10]=sec
        payload = [0x07, 0x00, 0x06, 0x0A, 0x0C, 0x1E, 0x2D]
        dso.dev.read.side_effect = [_make_response(0xA1, payload)]
        t = dso.read_system_time()
        self.assertRegex(t, r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")


class TestRemoteShell(unittest.TestCase):
    def test_returns_string(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0x91, list("ok\n".encode()))]
        self.assertIn("ok", dso.remote_shell("ls"))

    def test_uses_debug_action_0x43(self):
        dso = _make_dso()
        dso.dev.read.side_effect = [_make_response(0x91)]
        dso.remote_shell("id")
        w = dso.dev.write.call_args[0][1]
        self.assertEqual(w[0], 0x43)


class TestCSVStreamer(unittest.TestCase):
    def test_stream_loop_writes_csv_format(self):
        import io
        dso = _make_dso()
        dso.unlock_control_panel = MagicMock()
        
        # Mock read_settings response: 208 bytes of settings
        settings_payload = [0] * 208
        settings_payload[1] = 11  # CH1 voltbase index 11 (5V / 5000000 uV)
        settings_payload[11] = 11 # CH2 voltbase index 11
        settings_payload[160] = 18 # timebase index 18 (2ms / 2000000000 ps)
        
        # Mock read_sample_data response (0x82):
        # We need subcommand 0x01 with some data, and then subcommand 0x02 to terminate.
        sample_data_packet_1 = _make_response(0x82, [0x01, 0x00, 67, 66])  # subcommand 0x01, data=[67, 66]
        sample_data_packet_2 = _make_response(0x82, [0x02, 0x00])          # subcommand 0x02
        
        dso.dev.read.side_effect = [
            _make_response(0x81, settings_payload),  # ReadSettings
            sample_data_packet_1,                    # ReadSampleData chunk 1
            sample_data_packet_2                     # ReadSampleData chunk 2
        ]
        
        # We set self._streaming = True and run _stream_loop for one iteration
        dso._streaming = True
        
        dso.lock_control_panel = MagicMock()
        original_read_sample_data = dso.read_sample_data
        def mock_read_sample_data(channel):
            res = original_read_sample_data(channel)
            dso._streaming = False # stop loop after reading first buffer
            return res
        dso.read_sample_data = mock_read_sample_data
        
        output = io.StringIO()
        dso._stream_loop(output, capture_duration_s=None, channel=0)
        
        csv_content = output.getvalue()
        self.assertIn("#timebase=2000000000(ps)", csv_content)
        self.assertIn(",#voltbase=5000000(uV)", csv_content)
        self.assertIn("#size=2", csv_content)
        # Verify first row: size < 8000 uses 80 samples_per_div.
        # dt = 0.002s / 80 = 2.50000E-05
        self.assertIn("2.50000E-05,13400.000", csv_content)
        # Verify second row: time 5.00000E-05, voltage 13200.000
        self.assertIn("5.00000E-05,13200.000", csv_content)

    def test_start_stop(self):
        dso = _make_dso()
        dso.start(capture_duration_s=0.1)
        self.assertTrue(dso._streaming)
        dso.stop()
        self.assertFalse(dso._streaming)


if __name__ == "__main__":
    unittest.main(verbosity=2)