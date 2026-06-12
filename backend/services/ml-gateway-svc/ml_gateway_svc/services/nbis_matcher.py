"""NBIS mindtct/bozorth3 matching via iip-nbis-matcher Docker container."""

from __future__ import annotations

import asyncio
import base64
import json
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from iip_core.logging import get_logger
from ml_gateway_svc.settings import MlGatewaySettings, get_ml_settings

logger = get_logger(__name__)


class NbisMatcher:
    def __init__(self, settings: MlGatewaySettings | None = None) -> None:
        self._settings = settings or get_ml_settings()
        self._xyt_dir = Path(self._settings.nbis_xyt_dir)
        self._images_dir = Path(self._settings.nbis_images_dir)
        self._xyt_dir.mkdir(parents=True, exist_ok=True)
        self._images_dir.mkdir(parents=True, exist_ok=True)

    def _container_available(self) -> bool:
        if not shutil.which("docker"):
            return False
        try:
            proc = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Running}}", self._settings.nbis_container],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            return proc.returncode == 0 and proc.stdout.strip() == "true"
        except Exception:
            return False

    def _docker_exec(self, args: list[str]) -> dict:
        cmd = ["docker", "exec", self._settings.nbis_container, "iip-nbis-cli", *args]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=120)
        if proc.returncode != 0:
            err = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(err or f"NBIS CLI failed ({proc.returncode})")
        try:
            return json.loads(proc.stdout.strip().splitlines()[-1])
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Invalid NBIS CLI output: {proc.stdout[:500]}") from exc

    def _local_cli(self, args: list[str]) -> dict:
        cli = (self._settings.nbis_cli_path or "").strip()
        if not cli or not Path(cli).is_file():
            raise RuntimeError("NBIS container not running and nbis_cli_path not configured")
        proc = subprocess.run(
            [cli, *args],
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or proc.stdout or "").strip())
        return json.loads(proc.stdout.strip().splitlines()[-1])

    async def _run_cli(self, args: list[str]) -> dict:
        def _run() -> dict:
            if self._container_available():
                return self._docker_exec(args)
            return self._local_cli(args)

        return await asyncio.to_thread(_run)

    async def enroll_image(
        self,
        print_id: str,
        image_bytes: bytes,
        *,
        width: int,
        height: int,
        dpi: int = 500,
    ) -> bool:
        """Generate and store gallery .xyt for print_id."""
        if not image_bytes or width < 8 or height < 8:
            return False
        meta_path = self._images_dir / f"{print_id}.json"
        raw_path = self._images_dir / f"{print_id}.raw"
        xyt_path = self._xyt_dir / f"{print_id}.xyt"

        await asyncio.to_thread(raw_path.write_bytes, image_bytes)
        meta = {"width": width, "height": height, "dpi": dpi, "bytes": len(image_bytes)}
        await asyncio.to_thread(meta_path.write_text, json.dumps(meta))

        image_b64 = base64.b64encode(image_bytes).decode("ascii")
        if self._container_available():
            # docker cp raw file into container, then use --image-file to avoid
            # 'argument list too long' with large base64 strings via docker exec
            container_raw = f"/tmp/iip-nbis-{uuid.uuid4().hex}.raw"
            with tempfile.TemporaryDirectory(prefix="iip-nbis-host-") as tmp:
                host_raw = Path(tmp) / "probe.raw"
                host_raw.write_bytes(image_bytes)
                cp = subprocess.run(
                    ["docker", "cp", str(host_raw), f"{self._settings.nbis_container}:{container_raw}"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if cp.returncode != 0:
                    logger.warning("nbis_docker_cp_failed", print_id=print_id, stderr=cp.stderr[:200])
                    return False
            proc = subprocess.run(
                [
                    "docker",
                    "exec",
                    self._settings.nbis_container,
                    "iip-nbis-cli",
                    "enroll",
                    "--print-id",
                    print_id,
                    "--image-file",
                    container_raw,
                    "--width",
                    str(width),
                    "--height",
                    str(height),
                    "--dpi",
                    str(dpi),
                    "--output-dir",
                    "/data/xyt",
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=120,
            )
            subprocess.run(
                ["docker", "exec", self._settings.nbis_container, "rm", "-f", container_raw],
                capture_output=True,
                check=False,
            )
            if proc.returncode != 0:
                logger.warning(
                    "nbis_enroll_failed",
                    print_id=print_id,
                    stderr=(proc.stderr or proc.stdout or "")[:300],
                )
                return False
            if not xyt_path.is_file():
                logger.warning("nbis_xyt_missing_after_enroll", print_id=print_id)
                return False
        else:
            result = await self._run_cli(
                [
                    "enroll",
                    "--print-id",
                    print_id,
                    "--image-b64",
                    image_b64,
                    "--width",
                    str(width),
                    "--height",
                    str(height),
                    "--dpi",
                    str(dpi),
                    "--output-dir",
                    str(self._xyt_dir),
                ]
            )
            if not result.get("ok"):
                return False

        logger.info("nbis_print_enrolled", print_id=print_id, xyt=str(xyt_path))
        return xyt_path.is_file()

    async def identify(
        self,
        image_bytes: bytes,
        *,
        width: int,
        height: int,
        dpi: int = 500,
        min_score: int | None = None,
        top_k: int = 10,
        finger_position: str | None = None,
        eligible_print_ids: set[str] | None = None,
    ) -> list[tuple[str, int]]:
        if not image_bytes or width < 8 or height < 8:
            return []
        threshold = min_score if min_score is not None else self._settings.nbis_min_score
        image_b64 = base64.b64encode(image_bytes).decode("ascii")

        if self._container_available():
            with tempfile.TemporaryDirectory(prefix="iip-nbis-probe-") as tmp:
                host_raw = Path(tmp) / "probe.raw"
                host_raw.write_bytes(image_bytes)
                container_raw = f"/tmp/iip-nbis-probe-{uuid.uuid4().hex}.raw"
                subprocess.run(
                    ["docker", "cp", str(host_raw), f"{self._settings.nbis_container}:{container_raw}"],
                    capture_output=True,
                    check=False,
                )
                proc = subprocess.run(
                    [
                        "docker",
                        "exec",
                        self._settings.nbis_container,
                        "iip-nbis-cli",
                        "identify",
                        "--image-file",
                        container_raw,
                        "--width",
                        str(width),
                        "--height",
                        str(height),
                        "--dpi",
                        str(dpi),
                        "--gallery-dir",
                        "/data/xyt",
                        "--min-score",
                        str(threshold),
                        "--top-k",
                        str(top_k * 3),
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                    timeout=180,
                )
                subprocess.run(
                    ["docker", "exec", self._settings.nbis_container, "rm", "-f", container_raw],
                    capture_output=True,
                    check=False,
                )
                if proc.returncode != 0:
                    raise RuntimeError((proc.stderr or proc.stdout or "")[:500])
                data = json.loads(proc.stdout.strip().splitlines()[-1])
        else:
            data = await self._run_cli(
                [
                    "identify",
                    "--image-b64",
                    image_b64,
                    "--width",
                    str(width),
                    "--height",
                    str(height),
                    "--dpi",
                    str(dpi),
                    "--gallery-dir",
                    str(self._xyt_dir),
                    "--min-score",
                    str(threshold),
                    "--top-k",
                    str(top_k * 3),
                ]
            )

        hits: list[tuple[str, int]] = []
        for row in data.get("hits") or []:
            pid = str(row.get("print_id") or "")
            if not pid:
                continue
            if eligible_print_ids is not None and pid not in eligible_print_ids:
                continue
            hits.append((pid, int(row.get("score") or 0)))
        hits.sort(key=lambda x: x[1], reverse=True)
        return hits[:top_k]

    async def delete_print(self, print_id: str) -> None:
        for path in (
            self._xyt_dir / f"{print_id}.xyt",
            self._images_dir / f"{print_id}.raw",
            self._images_dir / f"{print_id}.json",
        ):
            if path.is_file():
                await asyncio.to_thread(path.unlink)

    def has_gallery_entry(self, print_id: str) -> bool:
        return (self._xyt_dir / f"{print_id}.xyt").is_file()
