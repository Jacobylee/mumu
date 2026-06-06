#!/usr/bin/env python3
"""
将桌面 ChatGPT.png 处理成 mumu 应用图标：
  1) 自动检测并裁掉外圈白边；
  2) 用纯黑铺满到正方形画布；
  3) 缩放/输出 1024x1024 PNG 到 assets/icon.png（iOS/Android 不允许透明，黑色不透明背景最稳）。

依赖：Pillow。
"""
import os
import sys
from PIL import Image

SRC = os.path.expanduser('~/Desktop/ChatGPT.png')
DST_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')
DST_ICON = os.path.normpath(os.path.join(DST_DIR, 'icon.png'))
DST_ADAPTIVE = os.path.normpath(os.path.join(DST_DIR, 'adaptive-icon.png'))
SIZE = 1024
WHITE_THRESHOLD = 240  # 灰度 ≥ 该阈值视为白边

def main() -> int:
    if not os.path.exists(SRC):
        print(f'[icon] source not found: {SRC}', file=sys.stderr)
        return 1
    os.makedirs(DST_DIR, exist_ok=True)

    src = Image.open(SRC).convert('RGB')
    gray = src.convert('L')
    # 反相后 getbbox 找到所有非白像素的最小外接矩形
    mask = gray.point(lambda p: 0 if p >= WHITE_THRESHOLD else 255)
    bbox = mask.getbbox()
    if not bbox:
        print('[icon] no non-white content found', file=sys.stderr)
        return 1
    cropped = src.crop(bbox)

    # 让黑色圆角溪出画布边缘，只保留中间纯黑部分；
    # iOS/Android 会再给图标加圆角，避免内/外双圆角调调。
    content_w, content_h = cropped.size
    side = max(content_w, content_h)
    scale = 1.10  # 放大超出，裁掉原始圆角弧线
    enlarged = cropped.resize((int(content_w * scale), int(content_h * scale)), Image.LANCZOS)
    canvas = Image.new('RGB', (side, side), (0, 0, 0))
    ew, eh = enlarged.size
    canvas.paste(enlarged, ((side - ew) // 2, (side - eh) // 2))

    out = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(DST_ICON, format='PNG', optimize=True)
    out.save(DST_ADAPTIVE, format='PNG', optimize=True)
    print(f'[icon] wrote {DST_ICON}')
    print(f'[icon] wrote {DST_ADAPTIVE}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
