"""Serve photos by their hash. Any branch can serve any photo, because they share the photo store."""
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import RedirectResponse

from .. import storage

router = APIRouter(tags=["photos"])


@router.get("/photos/{photo_hash}")
def get_photo(photo_hash: str):
    if not storage.is_valid_hash(photo_hash):
        raise HTTPException(404, "Photo not found")

    # Cloud storage: send the browser straight to the cloud's fast image server (CDN)
    if isinstance(storage.store, storage.CloudinaryStore):
        return RedirectResponse(storage.store.url(photo_hash), status_code=307,
                                headers={"Cache-Control": "public, max-age=86400"})

    try:
        found = storage.store.load(photo_hash)
    except storage.StorageError as exc:
        raise HTTPException(503, f"Photo storage is unavailable ({exc})")
    if found is None:
        raise HTTPException(404, "Photo not found")
    data, content_type = found
    # A hash-named file never changes, so browsers may cache it forever
    return Response(content=data, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})
