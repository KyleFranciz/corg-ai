from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from sqlmodel import Field, SQLModel


# enum for messages
class MessageRole(str, Enum):
    user = "user"
    agent = "agent"


# enum for Document status
class DocumentStatus(str, Enum):
    pending = "pending"
    ingesting = "ingesting"
    failed = "failed"


# Yap sessions with the agent
class Session(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    summary: Optional[str] = None  # summary about the session (gen summary with smaller agent)


# Messages from agent or user
class Messages(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id")
    role: MessageRole
    content: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )  # manually make time when a new row is added
    audio_path: Optional[str]


# User Uploaded docs
class Documents(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    file_path: str  # file on disk location
    file_type: str
    ingested_at: datetime
    chunk_count: int  # chunks the Document was split into for chroma
    status: DocumentStatus  # [pending, ingesting, failed]


# Chunking of words for vectoring in chroma
class Chunks(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    document_id: int = Field(foreign_key="documents.id")
    chroma_id: str  # NOTE: might switch to UUID or chunk id and turn it into a string when adding it to chroma
    content: str
    chunk_idx: int


# settings for the application, ill save things like the username, darkmode prefferences etc.. in here
class Settings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str
    value: str
    last_changed: datetime
