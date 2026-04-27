import os
import tempfile
from pathlib import Path

from platformdirs import user_data_dir
from sqlmodel import SQLModel, create_engine

# imports for metadata when creating the database
from database.models import Session, Messages, Documents, Chunks, Settings

# goes to root of backend
BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_DATA_DIR = Path(user_data_dir('corg-ai', 'corg'))
DATA_DIR = Path(os.getenv('CORG_DATA_DIR', str(DEFAULT_DATA_DIR))).expanduser()

db_path_override = os.getenv('CORG_DB_PATH')
DB_PATH = Path(db_path_override).expanduser() if db_path_override else DATA_DIR / 'sqlite' / 'corg.db'
DB_DIR = DB_PATH.parent
DB_DIR.mkdir(parents=True, exist_ok=True)

audio_dir_override = os.getenv('CORG_AUDIO_DIR')
AUDIO_DIR = (
    Path(audio_dir_override).expanduser() if audio_dir_override else DATA_DIR / 'audio'
)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def _ensure_writable(directory: Path, name: str) -> None:
    try:
        file_descriptor, temp_path = tempfile.mkstemp(
            dir=str(directory),
            prefix='.corg_write_check_'
        )
        os.close(file_descriptor)
        os.unlink(temp_path)
    except Exception as exc:
        raise RuntimeError(
            f'{name} directory is not writable: {directory}. '
            f'Set a writable path with CORG_DATA_DIR, CORG_DB_PATH, or CORG_AUDIO_DIR.'
        ) from exc


_ensure_writable(DB_DIR, 'Database')
_ensure_writable(AUDIO_DIR, 'Audio')

DATABASE_URL = f"sqlite:///{DB_PATH}"

# turn of echo later on (prints to console)
engine = create_engine(
    DATABASE_URL, echo="debug"
)  # True or "debug" - shows the full output


# function to create a database
def create_database() -> None:
    # adds the tables I made to the database
    SQLModel.metadata.create_all(engine)
