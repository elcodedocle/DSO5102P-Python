import os
import sys
import time
import asyncio
import threading
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

# Ensure we can import dso5102p
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../src")))
try:
    from dso5102p.DSO5102P import DSO5102P
except ImportError:
    DSO5102P = None

app = FastAPI(title="Hantek DSO5102P High-Performance Web Oscilloscope")

active_connections = set()

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
live_streamer: Optional[WebSocketStreamer] = None
mock_thread: Optional[threading.Thread] = None
mock_active = False

# Simulated/Mock waveform generator for fallback mode
def run_mock_generator(streamer: WebSocketStreamer):
    global mock_active
    print("Mock Waveform Generator Thread Started (WebSockets).", flush=True)
    
    # We will simulate a standard 40K buffer capture every 0.15s
    size = 4000
    timebase_ps = 2000000000 # 2ms / DIV
    voltbase_uV = 5000000    # 5V / DIV
    
    timebase_s = timebase_ps * 1e-12
    samples_per_div = 80
    dt = timebase_s / samples_per_div
    
    t_accumulator = 0.0
    frequency = 100.0  # 100 Hz signal
    
    while mock_active:
        # Construct CSV chunk
        chunk_lines = [
            f"#timebase={timebase_ps}(ps)",
            f",#voltbase={voltbase_uV}(uV)",
            f"#size={size}"
        ]
        
        # Generate sine wave with slight noise
        for _ in range(size):
            t_accumulator += dt
            v = 12.0 * math_sine(2 * 3.14159 * frequency * t_accumulator)
            v_mv = v * 1000.0
            chunk_lines.append(f"{t_accumulator:.5E},{v_mv:.3f}")
            
        streamer.write("\n".join(chunk_lines) + "\n")
        time.sleep(0.15)


def math_sine(x):
    import math
    return math.sin(x)


@app.get("/", response_class=HTMLResponse)
def get_index():
    static_index = os.path.join(os.path.dirname(__file__), "static/index.html")
    if os.path.exists(static_index):
        return FileResponse(static_index)
    return "<h3>index.html not found.</h3>"


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    # Capture the streamer instance active at the time of connection
    my_streamer = live_streamer
    print(f"WebSocket client connected. Total clients: {len(active_connections)}", flush=True)
    try:
        while True:
            # Keep socket open and receive heartbeat/messages from client if any
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        active_connections.discard(websocket)
        print(f"WebSocket client disconnected. Total clients: {len(active_connections)}", flush=True)
        # Only perform automatic stream cleanup if:
        # 1. This disconnect belongs to the currently active stream session
        # 2. There are no remaining active connections
        if len(active_connections) == 0 and live_streamer is not None and live_streamer is my_streamer:
            print("Last WebSocket client of the current session disconnected. Performing automatic stream cleanup.", flush=True)
            try:
                await live_stop()
            except Exception as e:
                print(f"Error during automatic stream cleanup: {e}", flush=True)


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
            print(f"Error reading active DSO settings: {e}", flush=True)
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
            print(f"Error querying temporary DSO settings: {e}", flush=True)
            
    # Mock fallback settings
    return {"timebase": 2000000000, "voltbase": 5000000, "mock": True}


@app.post("/api/live/start")
async def live_start(channel: int = 0):
    global dso, live_streamer, mock_thread, mock_active
    
    # If a streamer is already running (e.g. from an old reloaded session), stop it first
    if live_streamer is not None:
        print("Streamer already running during start. Stopping old stream first...", flush=True)
        await live_stop()

    # Grab the running asyncio loop to allow threads to write to WebSockets
    loop = asyncio.get_running_loop()
    live_streamer = WebSocketStreamer(loop, active_connections)
    
    # Attempt physical DSO connection
    if DSO5102P is not None:
        try:
            # Initialize physical DSO in executor to avoid blocking the FastAPI event loop
            def create_dso():
                return DSO5102P(0x049f, 0x505a, debug=False)
            
            dso = await loop.run_in_executor(None, create_dso)
            print("Physical DSO5102P Connected. Starting streaming...", flush=True)
            dso.start(file_handler=live_streamer, channel=channel)
            mock_active = False
            return {"status": "connected", "mock": False}
        except Exception as e:
            print(f"Physical DSO failed to initialize ({e}). Falling back to Simulated Mock Mode.", flush=True)
            dso = None
    else:
        print("DSO5102P module not found. Starting in Simulated Mock Mode.", flush=True)
        dso = None

    # Fallback to mock streaming thread
    mock_active = True
    mock_thread = threading.Thread(target=run_mock_generator, args=(live_streamer,), daemon=True)
    mock_thread.start()
    return {"status": "connected", "mock": True}


@app.post("/api/live/stop")
async def live_stop():
    global dso, live_streamer, mock_thread, mock_active
    
    # Stop physical DSO
    if dso is not None:
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, dso.stop)
            if hasattr(dso, 'close'):
                await loop.run_in_executor(None, dso.close)
        except Exception as e:
            print(f"Error stopping DSO: {e}", flush=True)
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
            
    live_streamer = None
    return {"status": "stopped"}


# Serve static frontend folder (style.css, app.js, index.html)
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
