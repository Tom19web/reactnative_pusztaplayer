"""Auto-import wrapper: filmek + sorozatok egymas utan.
Cron-hoz optimalizalva.
"""

import sys; sys.path.insert(0, "/app")
import os, subprocess
from datetime import datetime

LOG_DIR = "/var/log/pusztaplayer"
SCRIPTS = [
    "/app/scripts/import_movies.py",
    "/app/scripts/import_series.py",
]


def main():
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = os.path.join(LOG_DIR, f"import_{datetime.now().strftime('%Y%m%d_%H%M')}.log")

    with open(log_file, "w") as log:
        log.write(f"[{datetime.now()}] PusztaPlayer auto-import started\n\n")

        for script in SCRIPTS:
            log.write(f"--- Running: {script} ---\n")
            result = subprocess.run(
                [sys.executable, script],
                capture_output=True, text=True, timeout=7200,
            )
            log.write(result.stdout)
            if result.stderr:
                log.write(f"STDERR:\n{result.stderr}\n")
            log.write(f"Exit code: {result.returncode}\n\n")

        log.write(f"[{datetime.now()}] Auto-import finished\n")


if __name__ == "__main__":
    main()
