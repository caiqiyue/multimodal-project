"""Generate a 4-sample GRPO tiny JSONL + a single test image for pipeline dry-run.

Per docs/training/RUNBOOK.md §1.3, GRPO JSONL shape is:
  {"messages": [{"role": "user", "content": "<image>..."}],
   "images": ["/abs/path/img.jpg"],
   "solution": "<ground truth answer>"}

We generate 4 samples all pointing at the same synthetic red-bg/blue-sq
image so ms-swift GRPO can run end-to-end without needing real datasets.
"""
import json
import subprocess
from pathlib import Path


def make_image(out: Path) -> None:
    """Create a tiny synthetic image (no PIL dep needed)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    # 32x32 PPM is trivial to write by hand and Pillow-free.
    # But for ms-swift we want jpeg/png. Use the python -c trick.
    py = (
        "from PIL import Image, ImageDraw\n"
        "img = Image.new('RGB', (64, 64), color=(200, 30, 30))\n"
        "d = ImageDraw.Draw(img)\n"
        "d.rectangle([10, 10, 54, 54], fill=(40, 80, 200))\n"
        "img.save(r'" + str(out) + "', 'JPEG', quality=85)\n"
    )
    subprocess.run(["python3", "-c", py], check=True)


def main() -> None:
    base = Path(__file__).resolve().parent
    img = base / "tiny_grpo_image.jpg"
    jsonl = base / "tiny_grpo.jsonl"

    make_image(img)
    print(f"wrote {img}")

    samples = [
        ("这张图的主色调是什么颜色？一个词回答。", "红色"),
        ("这张图里的方块是什么颜色？一个词回答。", "蓝色"),
        ("图片的尺寸是多少？一个词回答。", "64"),
        ("图中方块大约多少像素宽？一个词回答。", "44"),
    ]
    with jsonl.open("w", encoding="utf-8") as f:
        for q, sol in samples:
            f.write(json.dumps(
                {"messages": [{"role": "user", "content": f"<image>{q}"}],
                 "images": [str(img)],
                 "solution": sol},
                ensure_ascii=False,
            ) + "\n")
    print(f"wrote {len(samples)} samples → {jsonl}")


if __name__ == "__main__":
    main()
