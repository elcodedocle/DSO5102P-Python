import os
import sys
import time
import asyncio
import threading
import logging
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

logger = logging.getLogger("web_oscilloscope")

# Ensure we can import dso5102p
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../src")))
try:
    from dso5102p.DSO5102P import DSO5102P
except ImportError:
    DSO5102P = None

app = FastAPI(title="Hantek DSO5102P High-Performance Web Oscilloscope")

active_connections_ch1 = set()
active_connections_ch2 = set()

# Thread-safe stream handler to bridge DSO thread write() calls into ASGI WebSockets
class WebSocketStreamer:
    def __init__(self, loop, connections):
        self.loop = loop
        self.connections = connections

    def write(self, data: str):
        if not data or not self.connections:
            return
        # Thread-safely push CSV data chunk to all connected WebSocket clients
        for ws in self.connections:
            asyncio.run_coroutine_threadsafe(self.send_text_safe(ws, data), self.loop)

    async def send_text_safe(self, ws: WebSocket, data: str):
        try:
            await ws.send_text(data)
        except Exception:
            self.connections.discard(ws)

    def flush(self):
        pass

    def close(self):
        pass


# Global state
dso: Optional[DSO5102P] = None
live_streamer_ch1: Optional[WebSocketStreamer] = None
live_streamer_ch2: Optional[WebSocketStreamer] = None
mock_thread: Optional[threading.Thread] = None
mock_active = False

# Lock to serialize stream start/stop and session management
state_lock = asyncio.Lock()
stream_id = 0

# Simulated/Mock waveform generator for fallback mode
def run_mock_generator(streamer_ch1: WebSocketStreamer, streamer_ch2: WebSocketStreamer):
    global mock_active
    logger.info("Mock Waveform Generator Thread Started (WebSockets).")
    import math
    
    # We will simulate a standard 40K buffer capture every 0.15s
    size = 4000
    timebase_ps = 2000000000 # 2ms / DIV
    voltbase_uV = 5000000    # 5V / DIV
    
    timebase_s = timebase_ps * 1e-12
    samples_per_div = 200
    dt = timebase_s / samples_per_div
    
    t_accumulator = 0.0
    frequency1 = 100.0  # 100 Hz signal for CH1 (sine)
    frequency2 = 150.0  # 150 Hz signal for CH2 (cosine)
    
    while mock_active:
        # CH1 Stream
        if streamer_ch1 and streamer_ch1.connections:
            chunk_lines = [
                f"#timebase={timebase_ps}(ps)",
                f",#voltbase={voltbase_uV}(uV)",
                f"#size={size}"
            ]
            t_max = t_accumulator + size * dt
            exp = math.floor(math.log10(t_max)) if t_max > 0 else 0
            t_decimals = min(15, max(6, math.ceil(exp - math.log10(dt)))) if dt > 0 else 6
            t = t_accumulator
            for _ in range(size):
                t += dt
                v = 12.0 * math.sin(2 * 3.14159 * frequency1 * t)
                v_mv = v * 1000.0
                chunk_lines.append(f"{t:.{t_decimals}E},{v_mv:.3f}")
            streamer_ch1.write("\n".join(chunk_lines) + "\n")
            
        # CH2 Stream
        if streamer_ch2 and streamer_ch2.connections:
            chunk_lines = [
                f"#timebase={timebase_ps}(ps)",
                f",#voltbase={voltbase_uV}(uV)",
                f"#size={size}"
            ]
            t_max = t_accumulator + size * dt
            exp = math.floor(math.log10(t_max)) if t_max > 0 else 0
            t_decimals = min(15, max(6, math.ceil(exp - math.log10(dt)))) if dt > 0 else 6
            t = t_accumulator
            for _ in range(size):
                t += dt
                v = 8.0 * math.cos(2 * 3.14159 * frequency2 * t)
                v_mv = v * 1000.0
                chunk_lines.append(f"{t:.{t_decimals}E},{v_mv:.3f}")
            streamer_ch2.write("\n".join(chunk_lines) + "\n")
            
        t_accumulator += size * dt
        time.sleep(0.15)


@app.get("/", response_class=HTMLResponse)
def get_index():
    static_index = os.path.join(os.path.dirname(__file__), "static/index.html")
    if os.path.exists(static_index):
        return FileResponse(static_index)
    return "<h3>index.html not found.</h3>"


async def manage_ws_session(websocket: WebSocket, active_set: set, channel_id: int = 0):
    await websocket.accept()
    active_set.add(websocket)
    current_session_id = stream_id
    logger.info(f"WebSocket client connected. Total clients on this channel: {len(active_set)} (Stream Session: {current_session_id})")
    
    # Send current settings immediately as headers so the client doesn't miss them
    try:
        loop = asyncio.get_running_loop()
        global dso
        if dso is not None:
            def query_active():
                return dso.get_current_settings(channel=channel_id)
            settings = await loop.run_in_executor(None, query_active)
        else:
            settings = {"timebase": 2000000000, "voltbase": 5000000, "mock": True}
        
        if settings and "timebase" in settings:
            header_lines = [
                f"#timebase={settings['timebase']}(ps)",
                f",#voltbase={settings['voltbase']}(uV)",
                "#size=0"
            ]
            await websocket.send_text("\n".join(header_lines) + "\n")
    except Exception as e:
        logger.error(f"Failed to send initial settings header to WebSocket: {e}")

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        active_set.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients remaining on this channel: {len(active_set)}")
        # Trigger cleanup if both channels are empty and the stream session hasn't changed
        if len(active_connections_ch1) == 0 and len(active_connections_ch2) == 0:
            if current_session_id == stream_id:
                logger.info(f"All WebSocket clients disconnected for session {current_session_id}. Performing automatic stream cleanup.")
                try:
                    await live_stop(session_id=current_session_id)
                except Exception as e:
                    logger.error(f"Error during automatic stream cleanup: {e}")
            else:
                logger.info(f"WebSocket cleanup bypassed: current session {current_session_id} does not match active session {stream_id}")

@app.websocket("/ws/live/ch1")
async def websocket_endpoint_ch1(websocket: WebSocket):
    await manage_ws_session(websocket, active_connections_ch1, channel_id=0)

@app.websocket("/ws/live/ch2")
async def websocket_endpoint_ch2(websocket: WebSocket):
    await manage_ws_session(websocket, active_connections_ch2, channel_id=1)

# Fallback for old/generic connections
@app.websocket("/ws/live")
async def websocket_endpoint_legacy(websocket: WebSocket):
    await manage_ws_session(websocket, active_connections_ch1, channel_id=0)



@app.get("/api/settings")
async def get_settings(channel: int = 0):
    global dso
    loop = asyncio.get_running_loop()
    
    # If a physical DSO is active, query it thread-safely in executor
    if dso is not None:
        try:
            def query_active():
                return dso.get_current_settings(channel=channel)
            return await loop.run_in_executor(None, query_active)
        except Exception as e:
            logger.error(f"Error reading active DSO settings: {e}")
            return {"status": "error", "message": str(e)}
            
    # If no active physical DSO, try opening one temporarily to read the settings
    if DSO5102P is not None:
        try:
            def query_temp():
                try:
                    temp_dso = DSO5102P(0x049f, 0x505a, debug=False)
                    res = temp_dso.get_current_settings(channel=channel)
                    temp_dso.close()
                    return res
                except Exception as ex:
                    return {"status": "error", "message": str(ex)}
            res = await loop.run_in_executor(None, query_temp)
            if isinstance(res, dict) and res.get("status") == "error":
                # Fallback to mock settings if hardware not found/busy
                return {"timebase": 2000000000, "voltbase": 5000000, "mock": True}
            return res
        except Exception as e:
            logger.error(f"Error querying temporary DSO settings: {e}")
            
    # Mock fallback settings
    return {"timebase": 2000000000, "voltbase": 5000000, "mock": True}


async def _live_stop_internal():
    global dso, live_streamer_ch1, live_streamer_ch2, mock_thread, mock_active
    
    # Stop physical DSO
    if dso is not None:
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, dso.stop)
            if hasattr(dso, 'close'):
                await loop.run_in_executor(None, dso.close)
        except Exception as e:
            logger.error(f"Error stopping DSO: {e}")
        dso = None
        
    # Stop mock thread
    if mock_active:
        mock_active = False
        if mock_thread is not None:
            try:
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, mock_thread.join, 1.0)
            except Exception:
                pass
            mock_thread = None
            
    live_streamer_ch1 = None
    live_streamer_ch2 = None


@app.post("/api/live/start")
async def live_start():
    global dso, live_streamer_ch1, live_streamer_ch2, mock_thread, mock_active, stream_id
    
    async with state_lock:
        # If a streamer is already running, stop it first
        if live_streamer_ch1 is not None or live_streamer_ch2 is not None:
            logger.info("Streamer already running during start. Stopping old stream first...")
            await _live_stop_internal()

        stream_id += 1
        current_session_id = stream_id

        # Grab the running asyncio loop to allow threads to write to WebSockets
        loop = asyncio.get_running_loop()
        live_streamer_ch1 = WebSocketStreamer(loop, active_connections_ch1)
        live_streamer_ch2 = WebSocketStreamer(loop, active_connections_ch2)
        
        # Attempt physical DSO connection
        if DSO5102P is not None:
            try:
                # Initialize physical DSO in executor to avoid blocking the FastAPI event loop
                def create_dso():
                    return DSO5102P(0x049f, 0x505a, debug=False)
                
                dso = await loop.run_in_executor(None, create_dso)
                logger.info(f"Physical DSO5102P Connected for session {current_session_id}. Starting streaming...")
                # Start streaming both channels
                dso.start(file_handler={0: live_streamer_ch1, 1: live_streamer_ch2}, channel=[0, 1])
                mock_active = False
                return {"status": "connected", "mock": False, "session_id": current_session_id}
            except Exception as e:
                logger.warning(f"Physical DSO failed to initialize ({e}). Falling back to Simulated Mock Mode.")
                dso = None
        else:
            logger.warning("DSO5102P module not found. Starting in Simulated Mock Mode.")
            dso = None

        # Fallback to mock streaming thread
        mock_active = True
        mock_thread = threading.Thread(target=run_mock_generator, args=(live_streamer_ch1, live_streamer_ch2), daemon=True)
        mock_thread.start()
        return {"status": "connected", "mock": True, "session_id": current_session_id}


@app.post("/api/live/stop")
async def live_stop(session_id: Optional[int] = None):
    global stream_id
    async with state_lock:
        if session_id is not None and session_id != stream_id:
            logger.info(f"Stop request bypassed: session ID mismatch (requested {session_id}, active {stream_id}).")
            return {"status": "bypassed"}
        await _live_stop_internal()
        return {"status": "stopped"}


# Serve static frontend folder (style.css, app.js, index.html)
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

if __name__ == "__main__":
    import uvicorn
    from uvicorn.config import LOGGING_CONFIG

    # Prepend human-readable timestamps to uvicorn formatters
    LOGGING_CONFIG["formatters"]["default"]["fmt"] = "%(asctime)s - %(levelprefix)s %(message)s"
    LOGGING_CONFIG["formatters"]["access"]["fmt"] = '%(asctime)s - %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s'

    # Route our application and driver logging through the default handler
    LOGGING_CONFIG["loggers"]["web_oscilloscope"] = {
        "handlers": ["default"],
        "level": "INFO",
        "propagate": False
    }
    LOGGING_CONFIG["loggers"]["DSO5102P"] = {
        "handlers": ["default"],
        "level": "INFO",
        "propagate": False
    }

    uvicorn.run(app, host="0.0.0.0", port=8000, log_config=LOGGING_CONFIG)
