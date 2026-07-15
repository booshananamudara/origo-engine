import uuid
from pydantic import BaseModel

from app.models.run import GenerationStatus, RunStatus
from app.schemas.common import ORMBase


class RunCreate(BaseModel):
    client_id: uuid.UUID


class RunRead(ORMBase):
    client_id: uuid.UUID
    status: RunStatus
    # Lets the UI label the post-monitoring phase: progress full + status
    # running + generation pending → "Analyzing"; generation running →
    # "Generating recommendations". Nullable: unflushed ORM rows carry None.
    generation_status: GenerationStatus | None = GenerationStatus.pending
    display_id: str | None = None
    total_prompts: int
    completed_prompts: int
    error_message: str | None = None
