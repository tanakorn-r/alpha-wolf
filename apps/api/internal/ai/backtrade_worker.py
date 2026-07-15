from __future__ import annotations

import os
import socket
import time
from uuid import uuid4

from internal.ai.backtrade import run_next_backtrade_job
from internal.store.db import migrate


def main() -> None:
    migrate()
    worker_id = f"{socket.gethostname()}-{os.getpid()}-{uuid4().hex[:8]}"
    while True:
        if not run_next_backtrade_job(worker_id):
            time.sleep(2)


if __name__ == "__main__":
    main()
