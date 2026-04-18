from pathlib import Path
from sqlmodel import SQLModel, create_engine

# imports for metadata when creating the database
from database.models import Session, Messages, Documents, Chunks, Settings

# goes to root of backend
BASE_DIR = Path(__file__).resolve().parent.parent
DB_DIR = BASE_DIR / "data" / "sqlite"
DB_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = f"sqlite:///{DB_DIR / 'corg.db'}"

# turn of echo later on (prints to console)
engine = create_engine(
    DATABASE_URL, echo="debug"
)  # True or "debug" - shows the full output


# function to create a database
def create_database():
    # adds the tables I made to the database
    SQLModel.metadata.create_all(engine)
