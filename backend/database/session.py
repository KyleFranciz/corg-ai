from sqlalchemy import engine
from sqlmodel import Session


# function for routes to get the session connection to the DB
def get_session():
    with Session(engine) as session:
        yield session
