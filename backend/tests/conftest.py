"""Test setup: use an isolated temp SQLite DB so tests never touch a real pm.db.

PM_DB_PATH must be set before app.db is imported (it reads the path at import
time), so this runs at collection time via a fresh temp directory per session.
"""

import os
import tempfile
from pathlib import Path

_tmp_dir = tempfile.mkdtemp(prefix="pm-test-db-")
os.environ["PM_DB_PATH"] = str(Path(_tmp_dir) / "test.db")
