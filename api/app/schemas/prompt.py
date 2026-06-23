import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field

# Categories are admin-managed (see app.services.prompt_categories), not a fixed
# enum. They are optional on a prompt: an unknown / blank category is coerced to
# "" in the service layer rather than rejected here.


class PromptCreate(BaseModel):
    text: Annotated[str, Field(min_length=10, max_length=500)]
    category: Annotated[str, Field(max_length=100)] = ""


class PromptUpdate(BaseModel):
    text: Annotated[str, Field(min_length=10, max_length=500)] | None = None
    category: Annotated[str, Field(max_length=100)] | None = None
    is_active: bool | None = None


class PromptRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    client_id: uuid.UUID
    text: str
    category: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PromptBulkCreate(BaseModel):
    prompts: Annotated[list[PromptCreate], Field(max_length=200)]


class PromptBulkResult(BaseModel):
    created: int
    skipped: int
    errors: list[str]


class PromptListResponse(BaseModel):
    items: list[PromptRead]
    total: int
    page: int
    per_page: int


class AuditLogRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    client_id: uuid.UUID
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    actor: str
    details: dict | None
    created_at: datetime
