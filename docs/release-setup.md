# Setting up the release pipeline

Four things in this repository's release have to be done by hand, once, by somebody with admin
on it. They are not code, they cannot be put in a workflow, and three of the four fail loudly
while the fourth fails in a way that looks like a permissions bug.

This page is the checklist.

## Why any of it is needed

[The release workflow](../.github/workflows/release.yml) pushes a `Release X.Y.Z` commit and
its tag straight to `main`. `main` requires a pull request, and the token a job is handed by
default cannot bypass that: it is deliberately not allowed to, which is the right default
everywhere except here.

An app installed on this repository can be. It holds one permission, the token it mints expires
within the hour, and it is not a person — so revoking it touches nobody's own access, and the
release commits read as a bot's rather than as a maintainer's.

## 1. The app

Create a GitHub App for this repository, with one permission: **Repository permissions >
Contents > Read and write**. No account permissions, no events, no webhook.

Its own app, even if you already run this pattern elsewhere and the one there would work.
Sharing an app shares its private key, so a key rotated or leaked in one repository is a
release pipeline broken or borrowed in all of them, and the blast radius of the leak is every
repository the app is installed on rather than this one. An app is also the thing an audit log
names, and `some-other-project-release` pushing commits here is a line nobody can read.

Name it after this repository — `linkspector-pre-commit-release` — for the same reason.

## 2. The installation

Install it on this repository, and on this repository only.

## 3. The two secrets

Generate a private key for the app, then add two repository secrets:

| | |
| --- | --- |
| `RELEASE_APP_CLIENT_ID` | the client id from the app's settings page, not the numeric app id |
| `RELEASE_APP_PRIVATE_KEY` | the whole `.pem`, including both `-----BEGIN` and `-----END` lines |

## 4. The bypass entry

**Add the app to the bypass list of the ruleset protecting `main`** (`main-requires-prs-and-checks`).

This step is not a permission, is the one that gets forgotten, and is the reason this page
exists. Without it the job mints a valid token, pushes, and is declined by the ruleset. The
error says nothing about bypass lists.

## Checking it worked

Merge any pull request labelled `patch`. The release job should push two refs and leave `main`
one commit ahead, with `git tag --list` carrying the new version. If it fails at the push, it
is step 4.
