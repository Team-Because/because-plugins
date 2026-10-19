"""Where the studio lives and where its keys are, the same way on Mac and Windows."""
import os
from pathlib import Path

STUDIO = Path(__file__).resolve().parent.parent
ENV_FILE = STUDIO / '.env'


def env(name):
    """A key from the environment first, then from the studio's .env file."""
    if os.environ.get(name):
        return os.environ[name]
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            k, _, v = line.partition('=')
            if k.strip() == name:
                return v.strip().strip('"').strip("'")
    return None
