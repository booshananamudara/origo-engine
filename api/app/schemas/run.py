import uuid
from pydantic import BaseModel

from app.models.run import RunStatus
from app.schemas.common import ORMBase


class RunCreate(BaseModel):
    client_id: uuid.UUID


class RunRead(ORMBase):
    client_id: uuid.UUID
    status: RunStatus
    display_id: str | None = None
    total_prompts: int
    completed_prompts: int
    error_message: str | None = None
