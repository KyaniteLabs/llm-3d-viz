"""Keep every test off the real Hermes profile: speed samples go to a temp HERMES_HOME."""
import pytest


@pytest.fixture(autouse=True)
def _isolated_hermes_home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
