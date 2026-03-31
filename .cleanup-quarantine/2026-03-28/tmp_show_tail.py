from pathlib import Path

lines = Path('AGENT_HISTORY.md').read_text(encoding='utf-8').splitlines()
for line in lines[-8:]:
    print(repr(line))
