"""Tool functions bound to the LangGraph Agent (feat-018).

Two tools today:
- `calculator` — safe arithmetic evaluator. Parses a math expression via `ast`,
  walks the tree, and only allows numeric literals and a hardcoded set of
  binary/unary operators. No `eval`, no function calls, no attribute access,
  no name lookups — the AST walker rejects anything else with `ValueError`.
- `server_info` — read-only diagnostics about the host running the API:
  hostname, uptime, root-disk usage, and `nvidia-smi` GPU snapshot (best-effort;
  returns `{"error": ...}` if nvidia-smi is missing or fails).

Both return plain `str`/`dict` — LangChain wraps these as `ToolMessage` content
automatically when the tool is invoked via `ToolNode`.

Why these two:
- calculator is the canonical "does tool-calling work?" smoke test —
  arithmetic is unambiguous, small models get it right, and the result is
  trivially verifiable.
- server_info exercises the multi-line / structured-output path —
  the agent has to emit a tool call with no parameters and the tool
  returns a dict, which the model has to summarize back into chat text.

Reference: docs/项目总执行计划.md §22.
"""
from __future__ import annotations

import ast
import logging
import operator
import os
import shutil
import subprocess
from typing import Annotated

from langchain_core.tools import tool


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# calculator — safe AST-walked arithmetic
# ---------------------------------------------------------------------------

# We intentionally do NOT support: function calls, attribute access, subscripts,
# comparisons, boolean ops, comprehensions, lambdas, starred expressions, etc.
# If a Qwen model ever tries to inject a clever expression like
# `__import__('os').system('rm -rf /')`, the AST walker rejects it.
_ALLOWED_BINOPS: dict[type[ast.operator], object] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

_ALLOWED_UNARYOPS: dict[type[ast.unaryop], object] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}

# Guard rails — prevent `2**10**10` style DOS-via-arithmetic or trivial `9**9` overflow.
_MAX_AST_DEPTH = 32
_MAX_RESULT_ABS = 10**18  # beyond float64 precision anyway


class _SafeMath(ast.NodeVisitor):
    """Walk an AST and evaluate only numeric constants + whitelisted ops."""

    def __init__(self) -> None:
        self._depth = 0

    def visit(self, node):  # type: ignore[override]
        self._depth += 1
        if self._depth > _MAX_AST_DEPTH:
            raise ValueError(f"expression exceeds max depth {_MAX_AST_DEPTH}")
        try:
            if isinstance(node, ast.Expression):
                return self.visit(node.body)
            if isinstance(node, ast.Constant):
                if not isinstance(node.value, (int, float)) or isinstance(node.value, bool):
                    raise ValueError(f"unsupported constant type: {type(node.value).__name__}")
                return node.value
            if isinstance(node, ast.BinOp):
                op_type = type(node.op)
                if op_type not in _ALLOWED_BINOPS:
                    raise ValueError(f"unsupported binary operator: {op_type.__name__}")
                left = self.visit(node.left)
                right = self.visit(node.right)
                return _ALLOWED_BINOPS[op_type](left, right)  # type: ignore[operator]
            if isinstance(node, ast.UnaryOp):
                op_type = type(node.op)
                if op_type not in _ALLOWED_UNARYOPS:
                    raise ValueError(f"unsupported unary operator: {op_type.__name__}")
                return _ALLOWED_UNARYOPS[op_type](self.visit(node.operand))  # type: ignore[operator]
            raise ValueError(f"unsupported syntax: {type(node).__name__}")
        finally:
            self._depth -= 1


def _safe_eval(expr: str) -> int | float:
    tree = ast.parse(expr, mode="eval")
    result = _SafeMath().visit(tree)
    if isinstance(result, float) and not (abs(result) <= _MAX_RESULT_ABS):
        raise ValueError(f"result magnitude exceeds {_MAX_RESULT_ABS}")
    return result


@tool
def calculator(
    expression: Annotated[str, "A pure arithmetic expression like '2 * (3 + 4) ** 2'. Supports + - * / // % ** and parentheses."],
) -> str:
    """Evaluate a basic arithmetic expression and return the result as a string.

    Use this whenever the user asks for a numeric calculation. Do not use it for
    anything else — it cannot parse dates, units, or non-math text.
    """
    try:
        value = _safe_eval(expression)
    except (SyntaxError, ValueError, ZeroDivisionError, OverflowError) as exc:
        logger.info("calculator rejected %r: %s", expression, exc)
        return f"error: {exc}"
    # Integer-y floats print without ".0" so the model can copy "1081" not "1081.0".
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


# ---------------------------------------------------------------------------
# server_info — read-only host diagnostics
# ---------------------------------------------------------------------------


def _read_uptime_seconds() -> float | None:
    """Best-effort `/proc/uptime` reader. Linux-only; returns None elsewhere."""
    try:
        with open("/proc/uptime", "r", encoding="ascii") as f:
            return float(f.readline().split()[0])
    except (FileNotFoundError, ValueError, IndexError):
        return None


def _read_nvidia_smi() -> list[dict]:
    """Run `nvidia-smi` and parse CSV output. Empty list on failure (don't raise)."""
    try:
        out = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,memory.used,memory.total,utilization.gpu",
                "--format=csv,noheader,nounits",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        logger.info("nvidia-smi unavailable: %s", exc)
        return [{"error": f"nvidia-smi unavailable: {exc}"}]

    gpus: list[dict] = []
    for line in out.stdout.strip().splitlines():
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 5:
            continue
        try:
            gpus.append(
                {
                    "index": int(parts[0]),
                    "name": parts[1],
                    "memory_used_mib": int(parts[2]),
                    "memory_total_mib": int(parts[3]),
                    "utilization_pct": int(parts[4]),
                }
            )
        except ValueError:
            continue
    return gpus


@tool
def server_info() -> str:
    """Return a short JSON snapshot of the host: hostname, uptime, disk, GPUs.

    Use this when the user asks about the server, GPU usage, available disk
    space, or how long the server has been up. The output is plain JSON so the
    assistant can pick out individual numbers.
    """
    import json

    disk = shutil.disk_usage("/")
    info: dict = {
        "hostname": os.uname().nodename,
        "uptime_seconds": _read_uptime_seconds(),
        "disk_root": {
            "total_gib": round(disk.total / (1024**3), 2),
            "used_gib": round(disk.used / (1024**3), 2),
            "free_gib": round(disk.free / (1024**3), 2),
            "percent_used": round(disk.used / disk.total * 100, 1),
        },
        "gpus": _read_nvidia_smi(),
    }
    return json.dumps(info, ensure_ascii=False, sort_keys=True)


# ---------------------------------------------------------------------------
# Public registry — graph.py imports this to bind tools to the LLM.
# ---------------------------------------------------------------------------

ALL_TOOLS = [calculator, server_info]
