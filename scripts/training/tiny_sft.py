"""Generate a 10-sample text-only SFT tiny JSONL for pipeline dry-run.

Per docs/training/RUNBOOK.md §1.2, SFT JSONL shape is:
  {"messages": [{"role": "user", "content": "..."},
                {"role": "assistant", "content": "..."}],
   "images": [...]   # optional — text-only samples omit it}

This generator emits 10 alpaca-style Chinese Q&A pairs (no images) so
ms-swift can run end-to-end without needing real image files. The point
is to prove the SFT pipeline runs (model loads, LoRA adapter gets
created, checkpoint written) — not to produce a useful model.
"""
import json
from pathlib import Path


SAMPLES = [
    ("中国的首都是哪里？", "中国的首都是北京。"),
    ("1 + 1 等于多少？", "1 + 1 等于 2。"),
    ("用一句话介绍长城。", "长城是中国古代的伟大工程，是中华民族的象征。"),
    ("Python 是什么？", "Python 是一种广泛使用的高级编程语言，以简洁易读著称。"),
    ("太阳从哪个方向升起？", "太阳从东方升起。"),
    ("水的化学式是什么？", "水的化学式是 H₂O。"),
    ("一年有哪四个季节？", "一年有春、夏、秋、冬四个季节。"),
    ("什么是人工智能？", "人工智能（AI）是让机器模拟人类智能行为的技术。"),
    ("光速大约是多少？", "光速大约是每秒 30 万公里（3×10⁸ 米/秒）。"),
    ("红楼梦的作者是谁？", "《红楼梦》的作者是曹雪芹。"),
]


def main() -> None:
    out = Path(__file__).resolve().parent / "tiny_sft.jsonl"
    with out.open("w", encoding="utf-8") as f:
        for q, a in SAMPLES:
            f.write(json.dumps(
                {"messages": [
                    {"role": "user", "content": q},
                    {"role": "assistant", "content": a},
                ]},
                ensure_ascii=False,
            ) + "\n")
    print(f"wrote {len(SAMPLES)} samples → {out}")


if __name__ == "__main__":
    main()
