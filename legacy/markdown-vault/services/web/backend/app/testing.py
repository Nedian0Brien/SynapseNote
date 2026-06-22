from __future__ import annotations

import asyncio
from contextlib import contextmanager
from typing import Any

import httpx


class SyncASGITestClient:
    def __init__(self, app, *, base_url: str = "http://testserver") -> None:
        self.app = app
        self.base_url = base_url
        self.cookies = httpx.Cookies()

    async def _request_async(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        transport = httpx.ASGITransport(app=self.app, raise_app_exceptions=True)
        async with httpx.AsyncClient(
            transport=transport,
            base_url=self.base_url,
            cookies=self.cookies,
            follow_redirects=True,
        ) as client:
            response = await client.request(method, url, **kwargs)
        self.cookies.update(response.cookies)
        return response

    def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        return asyncio.run(self._request_async(method, url, **kwargs))

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("POST", url, **kwargs)

    def put(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("PUT", url, **kwargs)

    def delete(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("DELETE", url, **kwargs)

    @contextmanager
    def stream(self, method: str, url: str, **kwargs: Any):
        yield self.request(method, url, **kwargs)


def create_sync_test_client(app) -> SyncASGITestClient:
    return SyncASGITestClient(app)
