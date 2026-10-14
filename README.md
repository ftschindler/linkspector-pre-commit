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
  rev: v0.1.0
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

## Licence

[MIT](LICENSE).
