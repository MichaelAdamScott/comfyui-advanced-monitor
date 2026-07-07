"""ComfyUI Advanced Monitor

Sleek, modern resource monitors (CPU / RAM / GPU / VRAM / Temp / Disk)
for the ComfyUI toolbar. No workflow nodes — this package only adds the
toolbar UI and the backend stats stream.
"""

from .monitor import monitor

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

monitor.start()
