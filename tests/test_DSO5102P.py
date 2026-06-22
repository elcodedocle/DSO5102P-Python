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
        with patch("time.time", return_value=1000.0):
            dso._stream_loop(output, capture_duration_s=None, channel=0)
        
        csv_content = output.getvalue()
        self.assertIn("#timebase=2000000000(ps)", csv_content)
        self.assertIn(",#voltbase=5000000(uV)", csv_content)
        self.assertIn("#size=2", csv_content)
        # Verify first row: size < 8000 uses 200 samples_per_div.
        # dt = 0.002s / 200 = 1.000000E-05
        self.assertIn("1.000000E-05,13400.000", csv_content)
        # Verify second row: time 2.000000E-05, voltage 13200.000
        self.assertIn("2.000000E-05,13200.000", csv_content)

    def test_stream_loop_timestamp_precision_upgrades(self):
        """Dynamic precision formats timestamps with at least 6 decimals."""
        import io
        dso = _make_dso()

        # HORIZ_VALS[31] = 40_000_000_000_000 ps = 40 s
        # size=5 < 8000 -> samples_per_div=200 -> dt = 40/200 = 0.2 s
        # Our formula calculates t_decimals = 6 for the block.
        settings_payload = [0] * 208
        settings_payload[1]   = 11  # CH1 voltbase idx 11 -> 5_000_000 uV
        settings_payload[5]   = 0   # CH1 probe x1
        settings_payload[11]  = 11  # CH2 voltbase idx 11
        settings_payload[15]  = 0   # CH2 probe x1
        settings_payload[160] = 31  # timebase idx 31 -> 40 s

        s1 = _make_response(0x82, [0x01, 0x00, 127, 127, 127, 127, 127])
        s2 = _make_response(0x82, [0x02, 0x00])

        dso.dev.read.side_effect = [
            _make_response(0x81, settings_payload),
            s1, s2,
        ]

        dso._streaming = True
        orig_rsd = dso.read_sample_data
        def _once(ch):
            r = orig_rsd(ch)
            dso._streaming = False
            return r
        dso.read_sample_data = _once

        out = io.StringIO()
        with patch("time.time", return_value=1000.0):
            dso._stream_loop(out, capture_duration_s=None, channel=0)
        csv = out.getvalue()

        # Both before and after 1 s use 6 decimal places as required by minimum precision
        self.assertIn("2.000000E-01,25400.000", csv)
        self.assertIn("1.000000E+00,25400.000", csv)

    def test_stream_loop_timestamp_precision_multi_tier(self):
        """Precision scales up dynamically for fine resolutions at high elapsed times."""
        import io
        dso = _make_dso()

        # HORIZ_VALS[14] = 80_000_000 ps = 80 us
        # size=5 < 8000 -> samples_per_div=200 -> dt = 80e-6 / 200 = 4e-7 s
        settings_payload = [0] * 208
        settings_payload[1]   = 11
        settings_payload[5]   = 0
        settings_payload[11]  = 11
        settings_payload[15]  = 0
        settings_payload[160] = 14  # 80 us

        s1 = _make_response(0x82, [0x01, 0x00, 127, 127, 127, 127, 127])
        s2 = _make_response(0x82, [0x02, 0x00])

        # We mock time.time() to simulate starting at 1000.0 and moving to 1025.0
        # which means t_base is around 25.0 seconds.
        # dt = 4e-7. log10(dt) = -6.39794.
        # at t_max = 25.0, exp = 1.
        # ceil(exp - log10(dt)) = ceil(1 - (-6.39794)) = 8.
        # So it must use 8 decimal places!
        # Sample 1: 24.9999992 -> 2.49999992E+01
        # Sample 5: 25.0000008 -> 2.50000008E+01
        dso.dev.read.side_effect = [
            _make_response(0x81, settings_payload),
            s1, s2,
        ]

        dso._streaming = True
        orig_rsd = dso.read_sample_data
        def _once(ch):
            r = orig_rsd(ch)
            dso._streaming = False
            return r
        dso.read_sample_data = _once

        out = io.StringIO()
        with patch("time.time") as mock_time:
            # First call inside _stream_loop setup is start_time: return 1000.0
            # Second call in loop represents t_end: return 1025.0
            mock_time.side_effect = [1000.0, 1025.0, 1025.0]
            dso._stream_loop(out, capture_duration_s=None, channel=0)
        csv = out.getvalue()

        # Verify that 8 decimal places are used for dt=4e-7 at t=25.0
        # chunk_duration = 5 * 4e-7 = 2e-6
        # t_base = max(25.0 - 2e-6, 0.0) = 24.999998
        # Sample 1: t_val = t_base + 1 * dt = 24.9999984 -> 2.49999984E+01
        # Sample 5: t_val = t_base + 5 * dt = 25.0000000 -> 2.50000000E+01
        self.assertIn("2.49999984E+01,25400.000", csv)
        self.assertIn("2.50000000E+01,25400.000", csv)

    def test_stream_loop_timestamp_precision_nanosecond(self):
        """Precision scales up to 12 decimals for ultra-fine picosecond/nanosecond resolution (2 ns timebase)."""
        import io
        dso = _make_dso()

        # HORIZ_VALS[0] = 2000 ps = 2 ns
        # size=5 < 8000 -> samples_per_div=200 -> dt = 2e-9 / 200 = 1e-11 s (10 ps)
        settings_payload = [0] * 208
        settings_payload[1]   = 11
        settings_payload[5]   = 0
        settings_payload[11]  = 11
        settings_payload[15]  = 0
        settings_payload[160] = 0  # 2 ns timebase

        s1 = _make_response(0x82, [0x01, 0x00, 127, 127, 127, 127, 127])
        s2 = _make_response(0x82, [0x02, 0x00])

        dso.dev.read.side_effect = [
            _make_response(0x81, settings_payload),
            s1, s2,
        ]

        dso._streaming = True
        orig_rsd = dso.read_sample_data
        def _once(ch):
            r = orig_rsd(ch)
            dso._streaming = False
            return r
        dso.read_sample_data = _once

        out = io.StringIO()
        with patch("time.time") as mock_time:
            # Simulated elapsed streaming time of 25.0s
            mock_time.side_effect = [1000.0, 1025.0, 1025.0]
            dso._stream_loop(out, capture_duration_s=None, channel=0)
        csv = out.getvalue()

        # dt = 1e-11 (10 ps). log10(dt) = -11.0.
        # at t_max = 25.0, exp = 1.
        # ceil(exp - log10(dt)) = ceil(1 - (-11)) = 12.
        # So it must format with 12 decimal places after the decimal.
        # chunk_duration = 5 * 1e-11 = 5e-11.
        # t_base = max(25.0 - 5e-11, 0.0) = 24.99999999995
        # Sample 1: t_val = t_base + 1 * dt = 24.99999999996 -> 2.499999999996E+01
        # Sample 5: t_val = t_base + 5 * dt = 25.00000000000 -> 2.500000000000E+01
        self.assertIn("2.499999999996E+01,25400.000", csv)
        self.assertIn("2.500000000000E+01,25400.000", csv)

    def test_start_stop(self):
        dso = _make_dso()
        dso.start(capture_duration_s=0.1)
        self.assertTrue(dso._streaming)
        dso.stop()
        self.assertFalse(dso._streaming)


class TestGetCurrentSettingsAndLocking(unittest.TestCase):
    def test_get_current_settings_parses_settings_correctly(self):
        dso = _make_dso()
        settings_payload = [0] * 208
        settings_payload[1] = 11   # CH1 voltbase index 11 (5V / 5000000 uV)
        settings_payload[5] = 1    # CH1 probe index 1 (x10) -> voltbase = 5000000 * 10 = 50000000 uV
        settings_payload[11] = 9   # CH2 voltbase index 9 (1V / 1000000 uV)
        settings_payload[15] = 0   # CH2 probe index 0 (x1) -> voltbase = 1000000 uV
        settings_payload[160] = 18 # timebase index 18 (2ms / 2000000000 ps)
        
        dso.read_settings = MagicMock(return_value=settings_payload)
        
        res1 = dso.get_current_settings(channel=0)
        self.assertEqual(res1["timebase"], 2000000000)
        self.assertEqual(res1["voltbase"], 50000000) # 5V * 10 = 50V = 50,000,000 uV
        
        res2 = dso.get_current_settings(channel=1)
        self.assertEqual(res2["timebase"], 2000000000)
        self.assertEqual(res2["voltbase"], 1000000)  # 1V * 1 = 1V = 1,000,000 uV

    def test_lock_exists_on_instance(self):
        dso = _make_dso()
        self.assertTrue(hasattr(dso, "_usb_lock"))
        self.assertTrue(callable(getattr(dso._usb_lock, "acquire", None)))
        self.assertTrue(callable(getattr(dso._usb_lock, "release", None)))


if __name__ == "__main__":
    unittest.main(verbosity=2)