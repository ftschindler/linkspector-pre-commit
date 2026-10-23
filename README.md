# linkspector-pre-commit

A [pre-commit](https://pre-commit.com/) hook that runs
[linkspector](https://github.com/UmbrellaDocs/linkspector) over the files pre-commit hands it,
rather than over the whole tree every time.

linkspector decides a link by loading the page in headless Chrome, so a check across a large
repository costs minutes and one flaky unrelated link blocks a commit that touched neither. Its
CLI takes no file arguments, and its `modifiedFilesOnly` option reads the *previous* commit, so
neither gets you there.

This hook does: it copies your `.linkspector.yml`, swaps `dirs` for the list pre-commit passed,
and runs the check against that. Everything else in your configuration carries over untouched.

## Use it

```yaml
- repo: https://github.com/ftschindler/linkspector-pre-commit
  rev: v0.2.0
  hooks:
  - id: linkspector-changed
```

That is the whole adoption. Your `.linkspector.yml` stays where it is and keeps its
`ignorePatterns`, `timeout`, `retryCount`, `excludedFiles`, `excludedDirs` and `useGitIgnore`,
all of which still apply to an explicit file list.

**You still want the full sweep somewhere**, because a link rots in a page nobody is editing.
The second hook is that sweep, and it belongs in CI or on a schedule rather than on the commit
path:

```yaml
  - id: linkspector-all
    stages: [manual]
```

Then `pre-commit run --hook-stage manual linkspector-all` in a workflow.

### Options

| | |
| --- | --- |
| `args: [-c, path/to/config.yml]` | read a configuration file other than `.linkspector.yml` |
| `args: [--no-browser-install]` | skip the browser check described below |
| `files:` | narrow which files reach the hook; the default takes `.md`, `.markdown`, `.adoc` and `.asciidoc` |

A file whose extension is not in your configuration's `fileExtensions` is dropped before
linkspector sees it, so widening `files:` does not produce warnings about files it will not read.

## What it pins, and why that is the other half

linkspector launches the Chrome revision compiled into the puppeteer release beside it, so **the
browser is part of what decides whether a link is reported broken**. A floating puppeteer means
the browser resolving your links changes without anything in your repository changing, which
presents as a fortnight of red pull requests nobody can explain.

Both are pinned exactly here, as a matched pair:

| | |
| --- | --- |
| `@umbrelladocs/linkspector` | 0.5.3 |
| `puppeteer` | 24.39.1, inside linkspector's declared `^24.37.5` |
| Chrome | 146.0.7680.76, which that puppeteer carries |

**So a consumer pins one `rev` instead of two `additional_dependencies`**, and upgrading is
reviewing one bump here rather than the same bump in every repository that checks links.

`npm run check-pins` holds that table to the packages, and CI runs it: it refuses a range where
a version belongs, refuses a puppeteer outside the range linkspector declares, and refuses a
Chrome revision this README does not mention. The guide this came from
[asks a human to do all three](https://ftschindler.github.io/knowledge/guides/pin_the_browser_behind_a_pre_commit_link_checker/).

### The browser install

Each run calls `puppeteer browsers install chrome`, naming no version. That is deliberate: the
pinned puppeteer resolves its own revision, so this cannot drift from the pin the way a literal
`chrome@...` can. It is a no-op once the browser is cached, and it is what makes the hook work
in a restored CI environment whose postinstall never ran. `--no-browser-install` turns it off.

### The sandbox, on a kernel that refuses one

Chrome builds its sandbox out of an unprivileged user namespace, and Ubuntu 23.10 and later
restrict those through AppArmor. Where that restriction is on, Chrome does not start degraded:
it aborts before a single link is checked.

```text
FATAL: No usable sandbox! If you are running on Ubuntu 23.10+ or another Linux distro
that has disabled unprivileged user namespaces with AppArmor ...
```

GitHub's `ubuntu-latest` is one of those kernels, which is how this was found: the same commit
passed and failed an hour apart, on two builds of the same runner image.

**The hook handles it, so no consumer has to remember a `sysctl` line.** On Linux, and only
where the kernel actually says the restriction is on, it points puppeteer at a shim that execs
the pinned Chrome with `--no-sandbox`. linkspector hardcodes the arguments it launches with, so
the executable is the only seam a wrapper has. The sandbox is given up exactly where Chrome
could not have had one, and kept everywhere it can, and a `PUPPETEER_EXECUTABLE_PATH` you set
yourself is left alone.

## Releasing

A release here is a tag: nothing is published to npm, and the `rev:` a consumer pins installs
the hook from the tagged tree. The number itself lives in `package.json`, because pre-commit
installs this hook with `npm install -g .` and npm refuses a package without a version, and in
the `rev:` of the example above, because that is the line people copy.

Neither is edited by hand, and a pull request that writes one is refused. What a pull request
carries instead is a label saying how big the change is, which is something a reviewer already
decides. CI refuses one that does not carry **exactly one** of:

| | |
| --- | --- |
| `major` | a configuration that works stops working, or a pin moves in a way that changes which links pass |
| `minor` | a new option or a new hook |
| `patch` | a fix, or a pin bump no consumer can see |
| `no-release` | nothing a consumer installs: CI, tests, docs about the repo itself |

On merge, [the release workflow](.github/workflows/release.yml) reads that label off the pull
request the commit arrived in, works the next version out with
[`scripts/version.py`](scripts/version.py), writes it into both places, and pushes a `Release
X.Y.Z` commit and an annotated tag on it as a single atomic push. `no-release`, or a push
straight to `main` with no pull request behind it, releases nothing — guessing a severity for a
change nobody reviewed is worse than silence.

The tag goes on the version commit rather than on the merge, because a tag whose tree still
holds the previous version installs as its predecessor and tells whoever reads its README to
pin the one before that.

That commit has to get past the ruleset on `main`, which the token a workflow is handed by
default deliberately cannot do — it is not allowed to bypass rules, which is the right default
everywhere except here. A GitHub App installed on this repository is: it holds `contents: write`
and nothing else, the token it mints expires within the hour, and it is named in the bypass list
of the ruleset. That last part is not a permission, and is what the release fails on if it is
ever lost — the push is simply declined, and the error says nothing about bypass lists.

## Licence

[MIT](LICENSE).
