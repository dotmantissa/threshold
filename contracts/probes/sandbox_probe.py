# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from datetime import date, timedelta

class SandboxProbe(gl.Contract):
    deadline: str
    def __init__(self):
        self.deadline = ""
    @gl.public.write
    def check(self, departure: str) -> None:
        def calculate():
            return (date.fromisoformat(departure) + timedelta(days=21)).isoformat()
        self.deadline = gl.vm.unpack_result(gl.vm.spawn_sandbox(calculate))
    @gl.public.view
    def get_deadline(self) -> str:
        return self.deadline
