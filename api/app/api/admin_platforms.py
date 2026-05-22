"""
Platform-level admin endpoints.

GET /admin/platforms/models  — available AI models per platform
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.admin_dependencies import get_current_admin
from app.models.admin_user import AdminUser
from app.platforms.model_registry import AVAILABLE_MODELS, DEFAULT_MODELS

router = APIRouter(prefix="/admin/platforms", tags=["admin-platforms"])


class AvailableModelsResponse(BaseModel):
    platforms: dict[str, list[str]]
    defaults: dict[str, str]


@router.get("/models", response_model=AvailableModelsResponse)
async def get_available_models(
    admin: AdminUser = Depends(get_current_admin),
) -> AvailableModelsResponse:
    return AvailableModelsResponse(platforms=AVAILABLE_MODELS, defaults=DEFAULT_MODELS)
