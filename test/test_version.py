#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest==8.4.2"]
# ///
"""The release's arithmetic and its two rewrites.

Python rather than `node --test` like the rest of the suite, because the thing
under test is Python: the infrastructure scripts are uv-shebanged so they run
from a laptop with nothing installed, and a test that needs the repository's npm
tree to check them would give that up.

Run it the same way: `./test/test_version.py`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from version import next_version, read_version, replace_revs, replace_version  # noqa: E402


def test_each_level_moves_the_part_it_names():
    assert next_version("1.2.3", "patch") == "1.2.4"
    assert next_version("1.2.3", "minor") == "1.3.0"
    assert next_version("1.2.3", "major") == "2.0.0"


def test_a_major_zeroes_what_is_beneath_it():
    assert next_version("0.4.2", "major") == "1.0.0"


def test_a_version_that_is_not_one_is_refused():
    with pytest.raises(SystemExit):
        next_version("v1.2", "patch")


MANIFEST = '{\n  "name": "@ftschindler/linkspector-pre-commit",\n  "version": "0.1.0",\n  "license": "MIT"\n}\n'


def test_the_version_is_read_and_written_in_place():
    assert read_version(MANIFEST) == "0.1.0"
    assert '  "version": "0.2.0",' in replace_version(MANIFEST, "0.2.0")


def test_a_version_nested_in_a_dependency_is_not_the_package_version():
    nested = '{\n  "dependencies": {\n    "puppeteer": {\n      "version": "24.39.1"\n    }\n  },\n  "version": "0.1.0",\n}\n'
    assert read_version(nested) == "0.1.0"


def test_every_rev_in_the_readme_moves():
    readme = "- repo: https://x\n  rev: v0.1.0\n  hooks:\n\nlater:\n    rev: v0.1.0\n"
    assert replace_revs(readme, "1.0.0").count("rev: v1.0.0") == 2


def test_the_indent_of_a_rev_survives():
    assert "\n    rev: v2.0.0" in replace_revs("\n    rev: v1.0.0\n", "2.0.0")


def test_a_readme_with_no_rev_is_an_error():
    with pytest.raises(SystemExit):
        replace_revs("nothing to pin here\n", "1.0.0")


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
