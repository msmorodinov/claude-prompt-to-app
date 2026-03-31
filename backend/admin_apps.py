"""Admin API router for app CRUD and prompt versioning."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

from backend.db import (
    create_app,
    get_all_apps_admin,
    get_app_by_id,
    get_app_versions,
    get_version_by_id,
    update_app,
    validate_app_fields,
)

# SECURITY: no auth — localhost only
router = APIRouter(prefix="/admin/apps", tags=["admin-apps"])


@router.get("")
async def list_apps() -> list:
    return await get_all_apps_admin()


@router.post("", status_code=201)
async def create_app_endpoint(request: Request) -> dict:
    body = await request.json()
    slug = body.get("slug", "")
    title = body.get("title", "")
    subtitle = body.get("subtitle", "")
    prompt_body = body.get("body", "")

    errors = validate_app_fields(slug=slug, title=title, body=prompt_body)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})

    try:
        return await create_app(slug, title, subtitle, prompt_body)
    except Exception as e:
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=409, detail="Slug already exists")
        logger.exception("Failed to create app")
        raise HTTPException(status_code=500, detail="Failed to create app")


@router.get("/{app_id}")
async def get_app_detail(app_id: int) -> dict:
    app_row = await get_app_by_id(app_id)
    if not app_row:
        raise HTTPException(status_code=404, detail="App not found")

    result = dict(app_row)
    # Attach current version body
    if app_row["current_version_id"]:
        version = await get_version_by_id(app_id, app_row["current_version_id"])
        result["current_version"] = version
    else:
        result["current_version"] = None
    return result


@router.put("/{app_id}")
async def update_app_endpoint(app_id: int, request: Request) -> dict:
    body = await request.json()
    title = body.get("title")
    subtitle = body.get("subtitle")
    prompt_body = body.get("body")
    change_note = body.get("change_note", "")
    is_active = body.get("is_active")

    errors = validate_app_fields(title=title, body=prompt_body)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})

    try:
        return await update_app(
            app_id,
            title=title,
            subtitle=subtitle,
            body=prompt_body,
            change_note=change_note,
            is_active=is_active,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="App not found")


@router.get("/{app_id}/versions")
async def list_versions(app_id: int) -> list:
    app_row = await get_app_by_id(app_id)
    if not app_row:
        raise HTTPException(status_code=404, detail="App not found")
    return await get_app_versions(app_id)


@router.get("/{app_id}/versions/{version_id}")
async def get_version(app_id: int, version_id: int) -> dict:
    version = await get_version_by_id(app_id, version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version
