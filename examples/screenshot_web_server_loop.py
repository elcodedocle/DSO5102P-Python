#! /usr/bin/python3

import sys

import cv2

import http.server
import socketserver

from dso5102p.DSO5102P import DSO5102P


class Streamer(http.server.SimpleHTTPRequestHandler):
    dso = None

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "multipart/x-mixed-replace; boundary=--boundary")
        self.end_headers()
        while True:
            try:
                img = self.dso.screenshot()
                # img = cv2.applyColorMap( img, cv2.COLORMAP_HOT )
                _, data = cv2.imencode('.JPEG', img, (cv2.IMWRITE_JPEG_QUALITY, 80))
                self.wfile.write(b"--boundary\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(b"Content-length: " + bytes(str(len(data)).encode()))
                self.wfile.write(b"\r\n")
                self.end_headers()
                self.wfile.write(data)
                self.wfile.write(b"\r\n\r\n\r\n")
            except Exception as ex:
                print(ex)
                break


# show time
if __name__ == '__main__':
    try:
        print("Initialising DSO5102P...")
        Streamer.dso = DSO5102P(0x049f, 0x505a, False)
        print("DSO5102P successfully initialised.")

        print("Starting HTTP server...")
        port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
        # noinspection PyTypeChecker
        server = socketserver.TCPServer(('', port), Streamer)
        print(f"HTTP server running on port {port}.")
        server.serve_forever()
    except Exception as e:
        print(e)
