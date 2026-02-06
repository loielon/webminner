import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = "dist"

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Serve index.html for known SPA paths if file doesn't exist
        # Check if the requested file exists in the directory
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            # If file doesn't exist, serve index.html (SPA routing)
            self.path = '/index.html'
        return super().do_GET()

def run_server():
    # Change into the dist directory if it exists
    if os.path.exists(DIRECTORY):
        os.chdir(DIRECTORY)
        print(f"Serving from {DIRECTORY} directory")
    else:
        print(f"Warning: '{DIRECTORY}' directory not found. Serving current directory.")

    with socketserver.TCPServer(("", PORT), SPAHandler) as httpd:
        print(f"Serving at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping server...")
            httpd.shutdown()

if __name__ == "__main__":
    run_server()
