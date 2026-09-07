"""Reward functions for Image GRPO dry-run (per docs/training/RUNBOOK.md §1.4).

Two simple rewards, matching the first-version spec:
  - accuracy_reward: 1.0 if prediction.strip() == solution.strip(), else 0.0
  - format_reward:   1.0 if model output contains <answer>...</answer>, else 0.0

Both are wired into ms-swift via --reward_funcs accuracy format. The
import path ms-swift uses for custom rewards is the file path passed via
--external_plugins or similar — for a built-in reward_funcs name
('accuracy', 'format'), ms-swift looks up a registered plugin.

For the dry-run we keep these as plain module-level functions so the
pipeline at least *loads* them; the ms-swift `accuracy`/`format` reward
plugins are bundled with ms-swift 4.5.2 itself (see swift/rewards/),
so we don't need to register anything custom here.

This file exists so:
  1. The reward function shape is documented in-repo.
  2. Future SFT/GRPO work has a concrete starting point to fork.
"""
from __future__ import annotations

import re


def accuracy_reward(prediction: str, solution: str) -> float:
    """Exact-match reward: 1.0 if normalized strings match, else 0.0.

    ms-swift calls this as reward_func(completions, solution, **kwargs)
    where `completions` is a list[str] and `solution` is a list[str].
    The signature below matches the per-sample variant; the bundled
    plugin wraps it with the list-level wrapper.
    """
    return 1.0 if prediction.strip() == solution.strip() else 0.0


def format_reward(text: str) -> float:
    """Format reward: 1.0 if output contains <answer>...</answer>, else 0.0."""
    return 1.0 if re.search(r"<answer>.*?</answer>", text, re.S) else 0.0
