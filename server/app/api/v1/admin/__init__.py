from fastapi import APIRouter

from .stats import router as stats_router
from .logos import router as logos_router
from .channels import router as channels_router
from .imports import router as imports_router
from .docker import router as docker_router
from .scripts import router as scripts_router
from .radio import router as radio_router
from .tags import router as tags_router

router = APIRouter(tags=["admin"])
router.include_router(stats_router)
router.include_router(logos_router)
router.include_router(channels_router)
router.include_router(imports_router)
router.include_router(docker_router)
router.include_router(scripts_router)
router.include_router(radio_router)
router.include_router(tags_router)
