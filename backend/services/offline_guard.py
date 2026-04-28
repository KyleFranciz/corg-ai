from __future__ import annotations

from urllib.parse import urlparse

_ALLOWED_LOCAL_HOSTS = {'localhost', '127.0.0.1', '::1', 'host.docker.internal'}


def require_local_service_url(name: str, raw_url: str) -> str:
    """Validate that a configured service URL resolves to a local host only."""
    cleaned_url = raw_url.strip()
    if not cleaned_url:
        raise RuntimeError(f'{name} must be set to a local URL')

    parsed = urlparse(cleaned_url)
    if parsed.scheme not in {'http', 'https'}:
        raise RuntimeError(f'{name} must use http:// or https:// (received: {cleaned_url})')

    if not parsed.hostname:
        raise RuntimeError(f'{name} must include a hostname (received: {cleaned_url})')

    hostname = parsed.hostname.strip().lower()
    if hostname not in _ALLOWED_LOCAL_HOSTS:
        raise RuntimeError(
            f'{name} must point to localhost/loopback only for offline mode (received: {cleaned_url})'
        )

    return cleaned_url
