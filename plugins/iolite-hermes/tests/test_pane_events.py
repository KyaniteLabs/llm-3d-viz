"""Agent-to-pane contract: bounded payloads, real receipts, and safe offline use."""
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("iolite_pane_events", ROOT / "__init__.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


@pytest.fixture
def bridge(monkeypatch):
    calls = []
    hermes = ModuleType("hermes_cli")
    events = ModuleType("hermes_cli.plugin_events")
    events.broadcast_plugin_event = lambda *args: calls.append(args)
    monkeypatch.setitem(sys.modules, "hermes_cli", hermes)
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", events)
    monkeypatch.setattr(plugin, "_ctx", None)
    monkeypatch.setattr(plugin, "PANE_RECEIPT_TIMEOUT", 0.01, raising=False)
    return events, calls


@pytest.mark.parametrize("slash", [False, True])
def test_shortlist_broadcasts_only_visual_state(bridge, slash, monkeypatch):
    _, calls = bridge
    monkeypatch.setattr(plugin, "_cfg", lambda k: False if k == "remember_shortlist" else plugin.DEFAULTS[k])
    if slash:
        plugin._slash("shortlist 60 cheap")
    else:
        assert json.loads(plugin.iolite_shortlist({"floor": 60, "objective": "min_cost", "prompt": "private"}))["ok"]
    assert len(calls) == 1
    name, event, payload = calls[0]
    assert (name, event) == ("iolite", "shortlist.updated")
    assert set(payload) == {"floor", "objective", "picks"}
    assert payload["floor"] == 60 and payload["objective"] == "min_cost"
    assert payload["picks"] and all(isinstance(s, str) for s in payload["picks"])
    assert "private" not in json.dumps(payload)


@pytest.mark.parametrize("slash", [False, True])
def test_model_broadcasts_catalog_slug(bridge, slash):
    _, calls = bridge
    if slash:
        plugin._slash("model GPT-6.1 Terra")
    else:
        plugin.iolite_model({"query": "GPT-6.1 Terra"})
    assert calls == [("iolite", "model.focused", {"focus_model": "gpt-6.1-terra"})]


def test_failed_calls_do_not_broadcast(bridge):
    _, calls = bridge
    plugin.iolite_shortlist({"objective": "invalid"})
    plugin.iolite_model({"query": ""})
    assert calls == []


def test_without_hermes_tools_and_status_still_work(monkeypatch):
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", None)
    monkeypatch.setattr(plugin, "_ctx", None)
    assert json.loads(plugin.iolite_shortlist({"floor": 60}))["ok"]
    assert json.loads(plugin.iolite_model({"query": "GPT-6.1 Terra"}))["matches"]
    out = json.loads(plugin.iolite_show({"view": "2d"}))
    assert out["ok"] and out["desktop_listening"] is False
    assert "no Desktop window is listening; ask the user to open the Iolite pane" in out["message"]
    status = plugin._slash("status")
    assert "no Desktop window is listening" in status
    assert 'Capabilities -> Plugins -> search "Iolite" -> switch on' in status
    assert 'composer button "Iolite"' in status


@pytest.mark.parametrize("args,field", [
    (None, "view"), ([], "arguments"), ({}, "view"), ({"view": "4d"}, "view"),
    ({"view": 3}, "view"), ({"view": "3d", "floor": -1}, "floor"),
    ({"view": "3d", "floor": 101}, "floor"), ({"view": "3d", "floor": float("nan")}, "floor"),
    ({"view": "3d", "floor": True}, "floor"), ({"view": "3d", "floor": None}, "floor"),
    ({"view": "3d", "reset_camera": "true"}, "reset_camera"),
    ({"view": "3d", "focus_model": ""}, "focus_model"),
    ({"view": "3d", "focus_model": 4}, "focus_model"),
    ({"view": "3d", "focus_model": "gpt"}, "focus_model"),
    ({"view": "3d", "focus_model": "does not exist"}, "focus_model"),
    ({"view": "3d", "prompt": "private"}, "arguments"),
])
def test_show_refuses_invalid_input_without_broadcast(bridge, args, field):
    _, calls = bridge
    out = json.loads(plugin.iolite_show(args))
    assert not out["ok"] and field in out["error"]
    assert calls == []


def test_show_resolves_name_and_reports_no_listener(bridge):
    _, calls = bridge
    out = json.loads(plugin.iolite_show({"view": "2d", "focus_model": "GPT-6.1 Terra", "floor": 0, "reset_camera": False}))
    assert out["ok"] and out["desktop_listening"] is False
    assert "no Desktop window is listening; ask the user to open the Iolite pane" in out["message"]
    name, event, payload = calls[0]
    assert (name, event) == ("iolite", "view.set")
    assert {k: v for k, v in payload.items() if k != "receipt"} == {
        "view": "2d", "focus_model": "gpt-6.1-terra", "floor": 0, "reset_camera": False,
    }
    assert not list(plugin._data_dir().glob(".pane-*.receipt"))


def test_show_requires_an_actual_receipt(bridge):
    events, _ = bridge
    def receive(name, event, payload):
        assert plugin.receive_pane_receipt({"receipt": payload["receipt"]})["ok"]
    events.broadcast_plugin_event = receive
    out = json.loads(plugin.iolite_show({"view": "3d", "reset_camera": True}))
    assert out["ok"] and out["desktop_listening"] is True
    assert not list(plugin._data_dir().glob(".pane-*.receipt"))
    assert "Desktop pane is listening" in plugin._slash("status")


def test_dashboard_receipts_cross_independently_loaded_modules(bridge):
    events, _ = bridge
    # Like plugin_api._load_agent_half: its module instance is separate from the tool's.
    api_spec = importlib.util.spec_from_file_location("iolite_receipt_agent_half", ROOT / "__init__.py")
    api = importlib.util.module_from_spec(api_spec)
    api_spec.loader.exec_module(api)
    def receive(name, event, payload):
        assert api.receive_pane_receipt({"receipt": payload["receipt"]})["ok"]
    events.broadcast_plugin_event = receive
    assert json.loads(plugin.iolite_show({"view": "2d"}))["desktop_listening"] is True


def test_receipts_reject_unknown_or_unsafe_ids(bridge):
    for value in (None, [], {}, {"receipt": "../private"}, {"receipt": "a" * 32}):
        assert not plugin.receive_pane_receipt(value)["ok"]
    assert not plugin._data_dir().exists()


def test_bridge_failure_never_breaks_tools(bridge):
    events, _ = bridge
    def broken(*args):
        raise RuntimeError("transport unavailable")
    events.broadcast_plugin_event = broken
    assert json.loads(plugin.iolite_shortlist({}))["ok"]
    assert json.loads(plugin.iolite_model({"query": "GPT-6.1 Terra"}))["ok"]
    assert json.loads(plugin.iolite_show({"view": "3d"}))["desktop_listening"] is False


def test_show_still_broadcasts_when_receipt_storage_is_unavailable(bridge, monkeypatch):
    _, calls = bridge
    def unavailable():
        raise OSError("read-only plugin data")
    monkeypatch.setattr(plugin, "_data_dir", unavailable)
    out = json.loads(plugin.iolite_show({"view": "2d"}))
    assert out["ok"] and not out["desktop_listening"]
    assert calls == [("iolite", "view.set", {"view": "2d"})]
