# 从包含「点击查看更多」的 MonoBehaviour 出发，挖出其 GameObject 与子层级 RectTransform，
# 还原原版悬停提示的布局（字号/颜色从 Text 序列化字节手动解码）
import struct
import UnityPy

env = UnityPy.load(r"D:\3Dtest\models-src\Version.data")
by_path = {obj.path_id: obj for obj in env.objects}

mb = by_path[13315]
raw = mb.get_raw_data()

# MonoBehaviour: m_GameObject PPtr{fileID i32, pathID i64}
go_pid = struct.unpack_from('<q', raw, 8)[0]
go_obj = by_path.get(go_pid)
go = go_obj.read() if go_obj else None
print('GameObject:', getattr(go, 'm_Name', None), '(path_id', go_pid, ')')

# GameObject 组件表 -> 找 RectTransform
transforms = {}
for obj in env.objects:
    if obj.type.name in ('Transform', 'RectTransform'):
        try:
            transforms[obj.path_id] = (obj.type.name, obj.read())
        except Exception:
            pass

def tr_of_go(go_data):
    for comp in getattr(go_data, 'm_Components', []):
        pid = comp.component.path_id
        if pid in transforms:
            return pid, transforms[pid]
    return None, None

root_tid, _ = tr_of_go(go)
print('根 RectTransform path_id:', root_tid)

def go_name_of(tr_data):
    ref = getattr(tr_data, 'm_GameObject', None)
    if not ref:
        return '?'
    g = by_path.get(ref.path_id)
    if not g:
        return '?'
    try:
        return getattr(g.read(), 'm_Name', '?')
    except Exception:
        return '?'

def dump(tid, depth=0):
    t, d = transforms.get(tid, (None, None))
    if d is None:
        return
    name = go_name_of(d)
    pad = '  ' * depth
    extra = ''
    if t == 'RectTransform':
        sd, ap = d.sizeDelta, d.anchoredPosition
        extra = (f"size=({sd.x:.0f},{sd.y:.0f}) pos=({ap.x:.0f},{ap.y:.0f}) "
                 f"pivot=({d.pivot.x:.1f},{d.pivot.y:.1f}) scale=({d.localScale.x:.2f},{d.localScale.y:.2f})")
    print(f"{pad}{name} [{t}] {extra}")
    for c in getattr(d, 'm_Children', []):
        dump(c.path_id, depth + 1)

if root_tid:
    dump(root_tid)

# 解码 Text 组件：m_Text 之后是 m_FontData{Font PPtr, FontSize i32, ...}，末尾 m_Color
idx = raw.find('点击查看更多'.encode('utf-8'))
after = raw[idx + len('点击查看更多'.encode('utf-8')) + 1:]
# Font PPtr = fileID i32 + (pad4) + pathID i64 = 16 字节对齐结构，之后 FontSize i32
font_size = struct.unpack_from('<i', after, 16)[0]
min_size, max_size = struct.unpack_from('<ii', after, 24)
# 对齐字段后取颜色：直接在尾部 16 字节找 4 个 float
color = struct.unpack_from('<4f', raw, len(raw) - 16)
print(f'\n字号={font_size} min={min_size} max={max_size} color RGBA={[round(c, 3) for c in color]}')
