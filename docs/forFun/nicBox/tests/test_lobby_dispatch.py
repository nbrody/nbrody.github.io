from pathlib import Path


LOBBY_JS = Path(__file__).resolve().parents[1] / "js" / "lobby.js"


def test_wingspan_picker_dispatch_is_wired():
    source = LOBBY_JS.read_text(encoding="utf-8")

    assert "wingspan: '" in source
    assert "case 'wingspan':" in source
    assert "new WingspanGame(currentRoom, players, gameArea)" in source


if __name__ == "__main__":
    test_wingspan_picker_dispatch_is_wired()
