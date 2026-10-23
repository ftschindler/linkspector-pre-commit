#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# ///
"""The version, and the four things the release pipeline does to it.

  version.py current                 # what shipped last
  version.py next <level>            # what a major, minor or patch would make it
  version.py write <version>         # put it in package.json and the README
  version.py check-untouched <base>  # refuse a pull request that edited either

Its own file rather than a few lines of `sed` in a workflow, because what the
release does should be runnable, and readable, without a CI run to see it.
`./scripts/version.py next minor` answers the question on a laptop.

The bump level comes from a label on the pull request, which is the one place a
human already looks at the change as a whole. Reading it from commit messages was
the alternative and is rejected: the subjects here are sentences about the work,
and turning those into a machine's opinion about severity means writing them for
the machine instead.

Two files carry the number, and only because both have to. `package.json` needs a
version at all because pre-commit installs this hook with `npm install -g .`,
which packs, and npm refuses a package without one. The README carries it because
the `rev:` in its example is what a consumer copies, and a README still offering
`v0.1.0` after a year of releases is worse than no example. They are written here,
from the same number, in the same commit, which is what keeps them from
disagreeing.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

LEVELS = ("major", "minor", "patch")
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
#: Anchored to the two-space indent npm writes at the top level of the manifest,
#: so a `version` nested inside a dependency entry is not matched.
VERSION_LINE = re.compile(r'^  "version": "(?P<version>[^"]+)",$', re.MULTILINE)
#: The `rev:` of the example a consumer copies. Matched on the `v` prefix and on
#: the pre-commit spelling, so the `rev:` pinning somebody else's hook in
#: `.pre-commit-config.yaml` - a sha, in a different file - cannot be rewritten
#: by this.
REV_LINE = re.compile(r"^(?P<indent>\s*)rev: v(?P<version>\d+\.\d+\.\d+)$", re.MULTILINE)

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "package.json"
README = REPO_ROOT / "README.md"


def read_version(text: str) -> str:
    match = VERSION_LINE.search(text)
    if not match:
        sys.exit('version: no `"version": "..."` line in package.json')
    return match.group("version")


def next_version(current: str, level: str) -> str:
    match = SEMVER.match(current.strip())
    if not match:
        sys.exit(f"version: {current!r} is not a version of the form 1.2.3")
    major, minor, patch = (int(part) for part in match.groups())
    if level == "major":
        # Zero the ones beneath, always: 0.4.2 major is 1.0.0, never 1.4.2. The
        # mistake is invisible in the tag and permanent in the history.
        return f"{major + 1}.0.0"
    if level == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def replace_version(text: str, new: str) -> str:
    if not SEMVER.match(new):
        sys.exit(f"version: {new!r} is not a version of the form 1.2.3")
    replaced, count = VERSION_LINE.subn(f'  "version": "{new}",', text, count=1)
    if count != 1:
        sys.exit('version: no `"version": "..."` line in package.json')
    return replaced


def replace_revs(text: str, new: str) -> str:
    """Point every `rev:` in the README at `new`.

    Every one rather than the first: the README may grow a second example, and a
    document that pins two different revisions teaches the wrong one to whoever
    scrolled further. Finding none is an error for the same reason the version
    line is - the file the release writes has stopped looking the way the release
    expects, and failing here is cheaper than shipping a stale instruction.
    """
    replaced, count = REV_LINE.subn(rf"\g<indent>rev: v{new}", text)
    if count == 0:
        sys.exit("version: no `rev: vX.Y.Z` line in README.md")
    return replaced


def changed_lines(base: str, path: Path, head: str = "HEAD") -> list[str]:
    diff = subprocess.run(
        ["git", "diff", "--unified=0", f"{base}...{head}", "--", str(path)],
        capture_output=True,
        text=True,
        check=True,
        cwd=str(REPO_ROOT),
    ).stdout
    return diff.splitlines()


def version_changed(base: str, head: str = "HEAD") -> bool:
    """Whether the diff from `base` *rewrites* the version, in either file.

    Neither file is off limits as a whole - a pull request may add a dependency
    to one and a paragraph to the other - so the question is about the two lines
    the release job owns, which means reading the diff rather than the file list.

    A removed line is what makes it a rewrite. An added one with nothing removed
    is the line arriving in a repository that has none, which happens once;
    afterwards it exists on the base branch, so every further write to it removes
    something and is refused.
    """
    manifest = any(re.match(r'^-  "version": "', line) for line in changed_lines(base, MANIFEST, head))
    readme = any(re.match(r"^-\s*rev: v\d+\.\d+\.\d+$", line) for line in changed_lines(base, README, head))
    return manifest or readme


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0] if __doc__ else None)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("current", help="print the version in package.json")
    following = sub.add_parser("next", help="print what the next version would be")
    following.add_argument("level", choices=LEVELS)
    write = sub.add_parser("write", help="write a version into package.json and the README")
    write.add_argument("version")
    check = sub.add_parser("check-untouched", help="fail if the diff from <base> edits the version")
    check.add_argument("base")
    arguments = parser.parse_args(argv)

    text = MANIFEST.read_text(encoding="utf-8")
    if arguments.action == "current":
        print(read_version(text))
        return 0
    if arguments.action == "next":
        print(next_version(read_version(text), arguments.level))
        return 0
    if arguments.action == "write":
        MANIFEST.write_text(replace_version(text, arguments.version), encoding="utf-8")
        README.write_text(replace_revs(README.read_text(encoding="utf-8"), arguments.version), encoding="utf-8")
        print(f"package.json now says {arguments.version}, and so does the README's rev.")
        return 0
    if version_changed(arguments.base):
        print(
            "::error::The version in package.json and the README's rev are written by the "
            "release job. Label this pull request major, minor, patch or no-release instead.",
            file=sys.stderr,
        )
        return 1
    print("The version line and the README's rev are untouched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
