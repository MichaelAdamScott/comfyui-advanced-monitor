"""Hardware stats collection and websocket broadcasting for Advanced Monitor."""

import json
import logging
import os
import threading
import time

import psutil

from server import PromptServer
from aiohttp import web

EVENT_NAME = "cam.monitor"
DEFAULT_RATE = 1.0

log = logging.getLogger("AdvancedMonitor")


class GPUCollector:
    """NVML-based GPU stats. Degrades gracefully when no NVIDIA GPU/driver."""

    def __init__(self):
        self.available = False
        self.pynvml = None
        self.handles = []
        self.names = []
        try:
            import pynvml

            pynvml.nvmlInit()
            self.pynvml = pynvml
            count = pynvml.nvmlDeviceGetCount()
            for i in range(count):
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                name = pynvml.nvmlDeviceGetName(handle)
                if isinstance(name, bytes):
                    name = name.decode("utf-8", errors="replace")
                self.handles.append(handle)
                self.names.append(name)
            self.available = count > 0
        except Exception as e:
            log.info("Advanced Monitor: NVML unavailable, GPU monitors disabled (%s)", e)

    def sample(self):
        gpus = []
        if not self.available:
            return gpus
        nv = self.pynvml
        for i, handle in enumerate(self.handles):
            entry = {
                "index": i,
                "name": self.names[i],
                "utilization": -1,
                "temperature": -1,
                "vram_used": 0,
                "vram_total": 0,
                "vram_percent": -1,
            }
            try:
                entry["utilization"] = nv.nvmlDeviceGetUtilizationRates(handle).gpu
            except Exception:
                pass
            try:
                mem = nv.nvmlDeviceGetMemoryInfo(handle)
                entry["vram_used"] = mem.used
                entry["vram_total"] = mem.total
                if mem.total:
                    entry["vram_percent"] = mem.used / mem.total * 100
            except Exception:
                pass
            try:
                entry["temperature"] = nv.nvmlDeviceGetTemperature(
                    handle, nv.NVML_TEMPERATURE_GPU
                )
            except Exception:
                pass
            gpus.append(entry)
        return gpus


class Monitor:
    def __init__(self):
        self.rate = DEFAULT_RATE
        self.gpu = GPUCollector()
        # Disk usage of the partition ComfyUI lives on
        self.disk_path = os.path.dirname(os.path.abspath(__file__))
        self._thread = None
        # Prime cpu_percent so the first real sample isn't 0
        psutil.cpu_percent(interval=None)

    def snapshot(self):
        vm = psutil.virtual_memory()
        data = {
            "cpu": psutil.cpu_percent(interval=None),
            "ram": {
                "percent": vm.percent,
                "used": vm.total - vm.available,
                "total": vm.total,
            },
            "gpus": self.gpu.sample(),
        }
        try:
            disk = psutil.disk_usage(self.disk_path)
            data["hdd"] = {
                "percent": disk.percent,
                "used": disk.used,
                "total": disk.total,
            }
        except Exception:
            data["hdd"] = None
        return data

    def start(self):
        if self._thread is not None:
            return
        self._thread = threading.Thread(
            target=self._loop, name="AdvancedMonitor", daemon=True
        )
        self._thread.start()

    def _loop(self):
        while True:
            rate = self.rate
            if rate <= 0:
                time.sleep(0.5)
                continue
            try:
                # Skip sampling while nothing is listening
                sockets = getattr(PromptServer.instance, "sockets", None)
                if sockets is not None and len(sockets) == 0:
                    time.sleep(0.5)
                    continue
                PromptServer.instance.send_sync(EVENT_NAME, self.snapshot())
            except Exception as e:
                log.warning("Advanced Monitor: sampling failed: %s", e)
                time.sleep(2.0)
            time.sleep(rate)


monitor = Monitor()

routes = PromptServer.instance.routes


@routes.get("/advanced_monitor/status")
async def get_status(request):
    return web.json_response(
        {
            "rate": monitor.rate,
            "gpu_available": monitor.gpu.available,
            "gpu_names": monitor.gpu.names,
            "snapshot": monitor.snapshot(),
        }
    )


@routes.patch("/advanced_monitor/config")
async def patch_config(request):
    try:
        body = json.loads(await request.text())
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)
    rate = body.get("rate")
    if rate is not None:
        try:
            monitor.rate = max(0.0, min(30.0, float(rate)))
        except (TypeError, ValueError):
            return web.json_response({"error": "invalid rate"}, status=400)
    return web.json_response({"rate": monitor.rate})
