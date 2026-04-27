import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

VALID_CATEGORIES = frozenset({"awareness", "evaluation", "comparison", "recommendation", "brand"})


class PromptCreate(BaseModel):
    text: Annotated[str, Field(min_length=10, max_length=500)]
    category: str

    @field_validator("category")
    @classmethod
    def category_must_be_valid(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return v


class PromptUpdate(BaseModel):
    text: Annotated[str, Field(min_length=10, max_length=500)] | None = None
    category: str | None = None
    is_active: bool | None = None

    @field_validator("category")
    @classmethod
    def category_must_be_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(sorted(VALID_CATEGORIES))}")
        return v


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
