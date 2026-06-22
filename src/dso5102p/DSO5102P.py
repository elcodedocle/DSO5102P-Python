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
import math
import os
import sys
import threading

import usb
import time
import array
import numpy as np
import usb.backend.libusb1

class DSO5102P:
    def __init__(self, id_vendor=0x049f, id_product=0x505a, debug=False):
        self.log = logging.getLogger("DSO5102P")
        self.debug = debug
        self._usb_lock = threading.Lock()
        if self.debug:
            self.log.setLevel(logging.DEBUG)
        else:
            self.log.setLevel(logging.INFO)
        if sys.platform.startswith('darwin'):
            backend = self.get_macos_backend()
            self.dev = usb.core.find(backend=backend, idVendor=id_vendor, idProduct=id_product)
        else:
            self.dev = usb.core.find(idVendor=id_vendor, idProduct=id_product)

        if self.dev is None:
            raise IOError('DSO5102P Not found')

        if sys.platform.startswith('darwin'):
            try:
                # Called with no arguments, it sets the first configuration found
                self.dev.set_configuration()
            except usb.core.USBError as e:
                # Suppress if already set or busy, otherwise raise
                if "Resource busy" not in str(e):
                    raise
        else:
            # unload 'cdc_subset'
            if self.dev.is_kernel_driver_active(0):
                self.dev.detach_kernel_driver(0)

        # clean buffers
        while True:
            try:
                r = self.dev.read(0x81, 512, 1000)
                self._dump('FLUSH', r)
            except usb.core.USBTimeoutError:
                self.log.debug("Buffer empty, continuing...")
                break
            except usb.core.USBError as e:
                self.log.exception('FLUSH:', exc_info=e)
                break

    def _dump(self, origin, data):
        self.log.debug("%s: %s", origin, ['0x%02X' % h for h in data])

    @staticmethod
    def get_macos_backend():
        # Common Homebrew path for Apple Silicon
        brew_lib_path = "/opt/homebrew/lib/libusb-1.0.dylib"

        if os.path.exists(brew_lib_path):
            return usb.backend.libusb1.get_backend(find_library=lambda x: brew_lib_path)
        return usb.backend.libusb1.get_backend()

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
        with self._usb_lock:
            self._send_command('ReadSettings', 0x01, array.array('B'))
            r = self._read_answer('ReadSettings', 0x81)
            return r[4:-1]

    def read_sample_data(self, channel):
        with self._usb_lock:
            self._send_command('ReadSampleData', 0x02, array.array('B', [0x01, channel & 0x01]))
            r = array.array('B')
            has_data = False
            while True:
                d = self._read_answer('ReadSampleData', 0x82)
                subcmd = d[4]
                if subcmd == 0x00:
                    if has_data:
                        # Legacy behavior/test support
                        break
                    else:
                        # Real protocol header, skip/ignore
                        continue
                elif subcmd == 0x01:
                    r = r + d[6:-1]
                    has_data = True
                elif subcmd in (0x02, 0x03):
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

    def get_current_settings(self, channel=0):
        settings = self.read_settings()
        ch1_voltbase = 5000000
        ch2_voltbase = 5000000
        timebase = 2000000000
        
        VERT_VALS = [
            1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000,
            1000000, 2000000, 5000000, 10000000
        ]
        HORIZ_VALS = [
            2000, 4000, 8000, 20000, 40000, 80000, 200000, 400000, 800000,
            2000000, 4000000, 8000000, 20000000, 40000000, 80000000, 200000000, 400000000, 800000000,
            2000000000, 4000000000, 8000000000, 20000000000, 40000000000, 80000000000, 200000000000, 400000000000, 800000000000,
            2000000000000, 4000000000000, 8000000000000, 20000000000000, 40000000000000
        ]
        PROBE_MULTIPLIERS = [1, 10, 100, 1000]
        
        if len(settings) >= 161:
            ch1_vb_idx = settings[1]
            ch1_probe_idx = settings[5]
            ch2_vb_idx = settings[11]
            ch2_probe_idx = settings[15]
            tb_idx = settings[160]
            
            ch1_probe_mult = PROBE_MULTIPLIERS[ch1_probe_idx] if ch1_probe_idx < len(PROBE_MULTIPLIERS) else 1
            ch2_probe_mult = PROBE_MULTIPLIERS[ch2_probe_idx] if ch2_probe_idx < len(PROBE_MULTIPLIERS) else 1
            
            if ch1_vb_idx < len(VERT_VALS):
                ch1_voltbase = VERT_VALS[ch1_vb_idx] * ch1_probe_mult
            if ch2_vb_idx < len(VERT_VALS):
                ch2_voltbase = VERT_VALS[ch2_vb_idx] * ch2_probe_mult
            if tb_idx < len(HORIZ_VALS):
                timebase = HORIZ_VALS[tb_idx]
                
        voltbase = ch2_voltbase if (channel & 0x01) == 1 else ch1_voltbase
        return {"timebase": timebase, "voltbase": voltbase}

    def start(self, file_handler=None, capture_duration_s=None, channel=0):
        """
        Starts streaming raw samples to a CSV format in a background thread.
        If file_handler is None, outputs to stdout.
        """
        if hasattr(self, "_streaming") and self._streaming:
            self.log.warning("Already streaming.")
            return

        self._streaming = True
        self._stream_thread = threading.Thread(
            target=self._stream_loop,
            args=(file_handler, capture_duration_s, channel),
            daemon=True
        )
        self._stream_thread.start()

    def stop(self):
        """
        Stops the streaming thread.
        """
        self._streaming = False
        if hasattr(self, "_stream_thread") and self._stream_thread:
            self._stream_thread.join(timeout=2.0)
            self._stream_thread = None

    def close(self):
        """
        Explicitly releases and disposes the USB device resources.
        """
        if hasattr(self, 'dev') and self.dev is not None:
            try:
                # To avoid making 'usb' a local variable, we import with an alias
                try:
                    import usb.util as usb_util
                    usb_util.dispose_resources(self.dev)
                except (ImportError, AttributeError):
                    # Fall back to using the global 'usb' module if it has the util
                    # (this happens when 'usb' is a mock during unit tests)
                    g_usb = globals().get('usb')
                    if g_usb is not None and hasattr(g_usb, "util") and hasattr(g_usb.util, "dispose_resources"):
                        g_usb.util.dispose_resources(self.dev)
            except Exception as e:
                self.log.warning(f"Error during USB resource disposal: {e}")
            self.dev = None

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass

    def _stream_loop(self, file_handler, capture_duration_s, channel):
        # Normalize channel(s) and handler(s)
        if isinstance(channel, int):
            channels = [channel]
            handlers = {channel: file_handler}
        elif isinstance(channel, (list, tuple)):
            channels = list(channel)
            if isinstance(file_handler, dict):
                handlers = file_handler
            elif isinstance(file_handler, (list, tuple)):
                handlers = {ch: file_handler[i] for i, ch in enumerate(channels)}
            else:
                handlers = dict.fromkeys(channels, file_handler)
        elif isinstance(channel, dict):
            channels = list(channel.keys())
            handlers = channel
        else:
            channels = [0]
            handlers = {0: file_handler}

        # Setup real file objects if paths are passed as handlers
        opened_handlers = {}
        normalized_handlers = {}
        for ch in channels:
            handler_val = handlers.get(ch, None)
            if handler_val is None:
                normalized_handlers[ch] = sys.stdout
            elif isinstance(handler_val, str):
                f = open(handler_val, 'w', encoding='utf-8')
                opened_handlers[ch] = f
                normalized_handlers[ch] = f
            else:
                normalized_handlers[ch] = handler_val

        start_time = time.time()
        
        # Read settings right before starting capture (avoiding lock/unlock panel as recommended)
        try:
            settings = self.read_settings()
        except Exception as e:
            self.log.error("Failed to read settings: %s", e)
            for f in opened_handlers.values():
                f.close()
            self._streaming = False
            return
        
        # Parse settings using standard 1-2-5 lists
        ch1_voltbase = 5000000
        ch2_voltbase = 5000000
        timebase = 2000000000
        
        VERT_VALS = [
            1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000,
            1000000, 2000000, 5000000, 10000000
        ]
        HORIZ_VALS = [
            2000, 4000, 8000, 20000, 40000, 80000, 200000, 400000, 800000,
            2000000, 4000000, 8000000, 20000000, 40000000, 80000000, 200000000, 400000000, 800000000,
            2000000000, 4000000000, 8000000000, 20000000000, 40000000000, 80000000000, 200000000000, 400000000000, 800000000000,
            2000000000000, 4000000000000, 8000000000000, 20000000000000, 40000000000000
        ]
        PROBE_MULTIPLIERS = [1, 10, 100, 1000]
        
        if len(settings) >= 161:
            ch1_vb_idx = settings[1]
            ch1_probe_idx = settings[5]
            ch2_vb_idx = settings[11]
            ch2_probe_idx = settings[15]
            tb_idx = settings[160]
            
            ch1_probe_mult = PROBE_MULTIPLIERS[ch1_probe_idx] if ch1_probe_idx < len(PROBE_MULTIPLIERS) else 1
            ch2_probe_mult = PROBE_MULTIPLIERS[ch2_probe_idx] if ch2_probe_idx < len(PROBE_MULTIPLIERS) else 1
            
            if ch1_vb_idx < len(VERT_VALS):
                ch1_voltbase = VERT_VALS[ch1_vb_idx] * ch1_probe_mult
            if ch2_vb_idx < len(VERT_VALS):
                ch2_voltbase = VERT_VALS[ch2_vb_idx] * ch2_probe_mult
            if tb_idx < len(HORIZ_VALS):
                timebase = HORIZ_VALS[tb_idx]
                
        voltbases = {
            0: ch1_voltbase,
            1: ch2_voltbase
        }
        
        is_header_written = dict.fromkeys(channels, False)
        total_samples_written = dict.fromkeys(channels, 0)
        dt = dict.fromkeys(channels, 0.0)
        size_pos = dict.fromkeys(channels, None)
        _prec_steps = {ch: [] for ch in channels}
        _prec_idx = dict.fromkeys(channels, 0)
        _t_decimals = dict.fromkeys(channels, 5)
        last_timestamp_written = dict.fromkeys(channels, 0.0)


        try:
            while self._streaming:
                if capture_duration_s is not None and (time.time() - start_time) >= capture_duration_s:
                    break
                
                # Fetch data alternately/interpolate to prevent USB collision
                for ch in channels:
                    if not self._streaming:
                        break
                    
                    try:
                        samples = self.read_sample_data(ch)
                    except Exception as e:
                        self.log.error("Failed to read sample data for channel %d: %s", ch, e)
                        time.sleep(0.05)
                        continue
                    
                    size = len(samples)
                    if size == 0:
                        time.sleep(0.05)
                        continue
                    
                    handler = normalized_handlers[ch]
                    
                    # Write header, just once
                    if not is_header_written[ch]:
                        header_lines = [
                            f"#timebase={timebase}(ps)",
                            f",#voltbase={voltbases.get(ch, 5000000)}(uV)"
                        ]
                        handler.write("\n".join(header_lines) + "\n")
                        
                        if hasattr(handler, "seekable") and handler.seekable():
                            try:
                                size_pos[ch] = handler.tell()
                                handler.write(f"#size={size:<10}\n")
                            except Exception:
                                handler.write(f"#size={size}\n")
                        else:
                            handler.write("#size=0\n")
                            
                        is_header_written[ch] = True
                        
                        # Determine dt based on the first buffer size
                        if size < 8000:
                            samples_per_div = 200
                        elif size < 80000:
                            samples_per_div = 2000
                        elif size < 800000:
                            samples_per_div = 25000
                        else:
                            samples_per_div = 100000
                        
                        timebase_s = timebase * 1e-12
                        dt[ch] = timebase_s / samples_per_div
                        if dt[ch] > 0:
                            t_thr, k = 1.0, 0
                            while True:
                                n = math.ceil(t_thr / dt[ch])
                                _prec_steps[ch].append((n, k + 6))
                                if n > 10 ** 15:
                                    break
                                t_thr *= 10.0
                                k += 1
                    
                    # Write samples with continuously increasing timestamps
                    t_end = time.time() - start_time
                    chunk_duration = size * dt[ch]
                    t_base = max(t_end - chunk_duration, last_timestamp_written[ch])

                    chunk_lines = []
                    for i, val in enumerate(samples):
                        total_samples_written[ch] += 1
                        signed_val = val if val < 128 else val - 256
                        t_val = t_base + (i + 1) * dt[ch]
                        while _prec_idx[ch] < len(_prec_steps[ch]) and total_samples_written[ch] >= _prec_steps[ch][_prec_idx[ch]][0]:
                            _t_decimals[ch] = _prec_steps[ch][_prec_idx[ch]][1]
                            _prec_idx[ch] += 1
                        t_str = f"{t_val:.{_t_decimals[ch]}E}"
                        v_val = (signed_val / 25.0) * (voltbases.get(ch, 5000000) / 1000.0)
                        v_str = f"{v_val:.3f}"
                        chunk_lines.append(f"{t_str},{v_str}")

                    last_timestamp_written[ch] = t_base + size * dt[ch]
                    
                    # Execute a single consolidated write call per capture
                    handler.write("\n".join(chunk_lines) + "\n")
                    if hasattr(handler, "flush"):
                        handler.flush()
                
                # Sleep a tiny bit to avoid hammering the device too aggressively
                time.sleep(0.05)
                
        finally:
            for ch in channels:
                handler = normalized_handlers[ch]
                if size_pos[ch] is not None:
                    try:
                        handler.seek(size_pos[ch])
                        handler.write(f"#size={total_samples_written[ch]:<10}\n")
                        handler.flush()
                    except Exception as e:
                        self.log.error("Failed to update CSV size header for channel %d: %s", ch, e)
            
            for f in opened_handlers.values():
                f.close()
                
            self._streaming = False

