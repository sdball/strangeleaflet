---
title: Add vim to a pipeline with vipe
slug: add-vim-to-a-pipeline-with-vipe
published_date: 2019-01-18T05:00:00+00:00
tags: shell, vim
publish: true
is_page: false
meta_description: How to inject vim into a shell pipeline
---

Have you ever wanted to stop and edit text in the middle of a pipeline? With `vipe` you can!

Take the output of `brew search` as an example.

```bash
$ brew search proxy
==> Formulae
aws-es-proxy                  metaproxy                     proxytunnel
dnscrypt-proxy                mitmproxy                     sproxy
haproxy                       oauth2_proxy                  tinyproxy
ios-webkit-debug-proxy        ocproxy                       twemproxy
libproxy                      proxychains-ng

==> Casks
proxyman
```

What we if want to call `brew info` to get more details for those formulae?

Even if we pipe the output to something (e.g. cat) we still have the Formulae and Casks headers:

```bash
$ brew search proxy | cat
==> Formulae
aws-es-proxy
dnscrypt-proxy
haproxy
ios-webkit-debug-proxy
libproxy
metaproxy
mitmproxy
oauth2_proxy
ocproxy
proxychains-ng
proxytunnel
sproxy
tinyproxy
twemproxy

==> Casks
proxyman
```

We _could_ write some intermediate steps to remove the lines we don't want. But wouldn't it be great to have our pipeline stop, let us edit the stream, and then continue?

```bash
$ brew search proxy | magic | while read formula; do brew info $formula; done
```

It turns out that `vipe` can be that magic! It will stop and give you a vim session with the output of the preceeding pipe. When you write/quit the vim session that output will be sent down to the subsequent commands in the pipe. Awesome!

## Installing vipe

You can get `vipe` on OSX as part of the `moreutils` brew formula.

```bash
$ brew install moreutils
```

## Usage

Then drop it in wherever you want to quickly edit text in the middle of the pipeline. It's also great as a nice way to view intermediate output of a pipeline.

```bash
$ brew search proxy | vipe | while read formula; do
  brew info "$formula";
done
```

When we run that command the `brew search proxy` output goes straight into a vim buffer.

```
 1 ==> Formulae
 2 aws-es-proxy
 3 dnscrypt-proxy
 4 haproxy
 5 ios-webkit-debug-proxy
 6 libproxy
 7 metaproxy
 8 mitmproxy
 9 oauth2_proxy
10 ocproxy
11 proxychains-ng
12 proxytunnel
13 sproxy
14 tinyproxy
15 twemproxy
16
17 ==> Casks
18 proxyman
```

vim editing goodness
We can manipulate that buffer to be whatever we want.

```
1 mitmproxy
```

How about we trim down to one interesting formula?
When we save and quit the pipeline continues into the `while read` loop that sends all the input to `brew info`.

```
"/private/var/folders/n6/gxxgmjhs1599x195xzdbnp_40000gn/T/mL0nDL6bCD" 1L, 10C written

mitmproxy: stable 4.0.4 (bottled), HEAD
Intercept, modify, replay, save HTTP/S traffic
https://mitmproxy.org
Not installed
From: https://github.com/Homebrew/homebrew-core/blob/master/Formula/mitmproxy.rb
==> Dependencies
Required: openssl@1.1 ✔, protobuf ✘, python ✘
==> Options
--HEAD
    Install HEAD version
==> Analytics
install: 6,017 (30 days), 15,281 (90 days), 46,094 (365 days)
install_on_request: 5,777 (30 days), 14,445 (90 days), 44,138 (365 days)
build_error: 0 (30 days)
```

Nice!
