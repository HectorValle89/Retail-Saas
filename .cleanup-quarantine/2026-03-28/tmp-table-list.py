import pathlib
import re

root = pathlib.Path("src")
pattern = re.compile(r"\.from\((?:'|\")([^'\"]+)(?:'|\")")
tables = set()

for path in root.rglob("*.ts*"):
    text = path.read_text(encoding="utf-8", errors="ignore")
    for match in pattern.finditer(text):
        tables.add(match.group(1))

for table in sorted(tables):
    print(table)
