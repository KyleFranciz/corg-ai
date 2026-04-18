from pathlib import Path
from sqlmodel import SQLModel, create_engine
from database.models import Session, Messages, Documents, Chunks, Settings

# goes to root of backend
BASE_DIR = Path(__file__).resolve().parent.parent

DATABASE_URL = f"sqlite:///{BASE_DIR}/corg.db"

# turn of echo later on (prints to console)
engine = create_engine(DATABASE_URL, echo=True)


# function to create a database
def create_database():
    # adds the tables I made to the database
    SQLModel.metadata.create_all(engine)
