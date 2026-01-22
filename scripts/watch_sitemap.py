import os
import time
import subprocess

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
DOCS_DIR = os.path.join(os.path.dirname(SCRIPTS_DIR), "docs")
GEN_SCRIPT = os.path.join(SCRIPTS_DIR, "generate_sitemap.py")

def get_state(directory):
    files_info = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".html") and file not in ["sitemap.xml", "sitemap.json"]:
                path = os.path.join(root, file)
                files_info.append((path, os.path.getmtime(path)))
    return hash(tuple(sorted(files_info)))

def watch():
    print(f"Watching {DOCS_DIR} for changes...")
    last_state = get_state(DOCS_DIR)
    
    while True:
        try:
            current_state = get_state(DOCS_DIR)
            if current_state != last_state:
                print("Change detected (add/delete/modify), regenerating sitemap...")
                subprocess.run(["python3", GEN_SCRIPT])
                last_state = current_state
            time.sleep(5)
        except KeyboardInterrupt:
            print("Stopping sitemap watcher...")
            break
        except Exception as e:
            print(f"Error in watcher: {e}")
            time.sleep(5)

if __name__ == "__main__":
    watch()
