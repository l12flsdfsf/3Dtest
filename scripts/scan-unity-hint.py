# 扫描 Unity Version.data 里的 Texture2D/Sprite 名称与尺寸，找「点击查看更多」悬停提示与放大镜图标
import UnityPy

env = UnityPy.load(r"D:\3Dtest\models-src\Version.data")

keywords = ["查看", "更多", "点击", "放大", "镜", "magnif", "search", "zoom", "look", "glass", "fangda", "tip", "hint", "cursor", "指针"]
rows = []
total = 0
for obj in env.objects:
    if obj.type.name not in ("Texture2D", "Sprite"):
        continue
    total += 1
    try:
        data = obj.read()
    except Exception as e:
        continue
    name = getattr(data, "m_Name", "") or ""
    if obj.type.name == "Texture2D":
        w = getattr(getattr(data, "m_Width", 0), "value", getattr(data, "m_Width", 0))
        h = getattr(getattr(data, "m_Height", 0), "value", getattr(data, "m_Height", 0))
    else:
        rt = getattr(data, "m_Rect", None)
        w = int(getattr(rt, "width", 0) or 0)
        h = int(getattr(rt, "height", 0) or 0)
    if any(k.lower() in name.lower() for k in keywords):
        rows.append((obj.type.name, name, w, h))

print(f"Texture2D/Sprite 总数: {total}, 命中关键词: {len(rows)}")
for t, n, w, h in sorted(rows, key=lambda r: -r[2] * r[3]):
    print(f"{t:10s} {n!r:40s} {w}x{h}")
