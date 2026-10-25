---
title: Use tldr for command line examples
slug: use-tldr-for-command-line-examples
published_date: 2019-11-20T05:00:00+00:00
tags: shell
publish: true
discoverable: true
is_page: false
meta_description: What is tldr? Why it's an easy way to quickly get examples for common CLI commands!
---

# manual pages are a reference

If you use the command line you've probably already seen manual pages, accessed via the `man` command.

```bash
$ man git-log

NAME
git-log - Show commit logs

SYNOPSIS
git log [<options>] [<revision range>] [[--] <path>...]


DESCRIPTION
Shows the commit logs.

The command takes options applicable to the git rev-list command to
control what is shown and how, and options applicable to the git diff-*
commands to control how the changes each commit introduces are shown.

OPTIONS
--follow
Continue listing the history of a file beyond renames (works only for a single file).

--no-decorate, --decorate[=short|full|auto|no]
.
.
.
```

`man` pages are great when you need a full reference for a command. "What's the git-log flag to only show merge commits? (`--merges`)

But what if you want examples of common use? For that `man` pages aren't so helpful. Sometimes you'll get examples throughout the doc or maybe at the end. Or maybe you can piece together the command patterns from the synopsis.

```plaintext
SYNOPSIS
git commit [-a | --interactive | --patch] [-s] [-v] [-u<mode>] [--amend]
           [--dry-run] [(-c | -C | --fixup | --squash) <commit>]
           [-F <file> | -m <msg>] [--reset-author] [--allow-empty]
           [--allow-empty-message] [--no-verify] [-e] [--author=<author>]
           [--date=<date>] [--cleanup=<mode>] [--[no-]status]
           [-i | -o] [-S[<keyid>]] [--] [<file>...]

```

# There's a better way?

There IS a better way! [TLDR pages](https://tldr.sh/)!

TLDR pages are community driven reference examples accessed by a `tldr` command made available by a wide range of clients. From `brew install tldr` to `npm install -g tldr` and many others: you can probably find a tldr client implementation you can live with. There's even a [generated PDF of tldr pages](https://tldr.sh/assets/tldr-book.pdf) if you must have it.

## What do we get from `tldr`?

Examples!

```plaintext
$ tldr git log

git log

Show a history of commits.
More information: <https://git-scm.com/docs/git-log>.

- Show the sequence of commits starting from the current one, in reverse chronological order:
    git log

- Show the history of a particular file or directory, including differences:
    git log -p path/to/file_or_directory

- Show only the first line of each commit message:
    git log --oneline

- Show an overview of which file(s) changed in each commit:
    git log --stat

- Show a graph of commits in the current branch:
    git log --graph

- Show a graph of all commits, tags and branches in the entire repo:
    git log --oneline --decorate --all --graph

- Show only commits whose messages include a given string (case-insensitively):
    git log -i --grep search_string
```

Way awesome! Nice, clear examples of how to commonly use the `git-log` command.

```plaintext
$ tldr tar

tar

Archiving utility.
Often combined with a compression method, such as gzip or bzip.
More information: <https://www.gnu.org/software/tar>.

- Create an archive from files:
    tar cf target.tar file1 file2 file3

- Create a gzipped archive:
    tar czf target.tar.gz file1 file2 file3

- Extract a (compressed) archive into the current directory:
    tar xf source.tar[.gz|.bz2|.xz]

- Extract an archive into a target directory:
    tar xf source.tar -C directory

- Create a compressed archive, using archive suffix to determine the compression program:
    tar caf target.tar.xz file1 file2 file3

- List the contents of a tar file:
    tar tvf source.tar

- Extract files matching a pattern:
    tar xf source.tar --wildcards "*.html"
```

Yes!

## But what about different platforms?

I hear you. There are lots of commands that are available to Linux and not MacOS and vice versa. Not to mention SunOS.

`tldr` is there for you. You can pass a `-p` or `--platform` flag to `tldr` to tell it the platform docs it should check instead of defaulting to the platform you're currently using.

If I run `tldr service` on macOS then I only get back a "page doesn't exist" message because service is not a command on macOS. But it _is_ a command on Linux! So if I want to lookup the Linux `service` command from a macOS machine I pass `-p linux` to the `tldr` command.

```bash
$ tldr service
This page doesn't exist yet!
Submit new pages here: https://github.com/tldr-pages/tldr

$ tldr -p linux service

service

Manage services by running init scripts.
The full script path should be omitted (/etc/init.d/ is assumed).

- Start/Stop/Restart/Reload service (start/stop should always be available):
    service init_script start|stop|restart|reload

- Do a full restart (runs script twice with start and stop):
    service init_script --full-restart

- Show the current status of a service:
    service init_script status

- List the status of all services:
    service --status-all
```

## Pages that don't exist yet

If you find there's a command you know about that doesn't yet have a `tldr` page then you can submit a PR to the project with the examples. For example how that `tldr service` on macOS helpfully shared with me where I could [submit a PR](https://github.com/tldr-pages/tldr/pulls).

You can check out all the [newly proposed tldr commands](https://github.com/tldr-pages/tldr/pulls?q=is%3Aopen+is%3Apr+label%3A%22new+command%22) since they're all nicely tagged with a `new-command` label.
