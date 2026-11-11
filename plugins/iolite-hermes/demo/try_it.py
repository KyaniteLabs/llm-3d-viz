"""Try Iolite in 30 seconds on the bundled catalog. No Hermes, no network.

    python3 plugins/iolite-hermes/demo/try_it.py "shortlist"
"""
import importlib.util
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("iolite_demo", HERE.parent / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


class Ctx:
    def __init__(self):
        self.commands = {}

    def get_config(self, key, default=None):
        return {"measure_speed": False}.get(key, default)

    def register_tool(self, **kwargs):
        pass

    def register_command(self, name, handler, **kwargs):
        self.commands[name] = handler


ctx = Ctx()
plugin.register(ctx)
out = ctx.commands["iolite"](" ".join(sys.argv[1:]) or "shortlist 60 cheap")
# Chat output escapes markdown characters; a terminal shows them raw, so undo that here.
print(re.sub(r"\\([\\*_~|\[\]()#])", r"\1", out))
