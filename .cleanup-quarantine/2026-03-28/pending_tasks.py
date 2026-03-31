from pathlib import Path


def list_pending():
    path = Path(".kiro/specs/field-force-platform/tasks.md")
    content = path.read_text(encoding="utf-8").splitlines()
    sections = {}
    current = "General"
    for line in content:
        stripped = line.strip()
        if stripped.startswith("## "):
            current = stripped[3:].strip() or current
            sections.setdefault(current, [])
            continue
        if stripped.startswith("- [ ]"):
            sections.setdefault(current, []).append(stripped[6:].strip())
    return sections


def main():
    pending = list_pending()
    total_pending = sum(len(items) for items in pending.values())
    print(f"Pending tasks total: {total_pending}")
    for name in sorted(pending):
        items = pending[name]
        if not items:
            continue
        print(f"{name}: {len(items)} pendientes")
        for task in items[:3]:
            print(f"  - {task}")
        if len(items) > 3:
            print(f"  ... {len(items) - 3} pendientes más")


if __name__ == "__main__":
    main()
