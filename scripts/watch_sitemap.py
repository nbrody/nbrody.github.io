import os
import time
import subprocess

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(SCRIPTS_DIR), "docs")
GEN_SCRIPT = os.path.join(SCRIPTS_DIR, "generate_sitemap.py")

def get_last_mtime(directory):
    max_mtime = 0
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".html") and file != "sitemap.xml":
                mtime = os.path.getmtime(os.path.join(root, file))
                if mtime > max_mtime:
                    max_mtime = mtime
    return max_mtime

def watch():
    print(f"Watching {DOCS_DIR} for changes...")
    last_mtime = get_last_mtime(DOCS_DIR)
    
    while True:
        try:
            current_mtime = get_last_mtime(DOCS_DIR)
            if current_mtime > last_mtime:
                print("Change detected, regenerating sitemap...")
                subprocess.run(["python3", GEN_SCRIPT])
                last_mtime = current_mtime
            time.sleep(5)
        except KeyboardInterrupt:
            print("Stopping sitemap watcher...")
            break
        except Exception as e:
            print(f"Error in watcher: {e}")
            time.sleep(5)

if __name__ == "__main__":
    watch()
