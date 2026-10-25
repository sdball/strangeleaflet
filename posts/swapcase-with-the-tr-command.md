---
title: swapcase with the tr command
slug: swapcase-with-the-tr-command
published_date: 2022-04-01T04:00:00+00:00
tags: shell
publish: true
---

Want to easily swap the case of some string on the \*nix command line? The `tr` command can do that!

## tr introduction

The `tr` command is "translate characters"

It takes a value from `STDIN` and applies a given translation to that value and sends the result to `STDOUT`.

The translation is two arguments: string1 and string2. Every character in string1 will be replaced by the corresponding character from string2. Any character that isn't in string1 will be sent along as-is.

```bash
$ echo abcde | tr a z
zbcde

$ echo abcde | tr b +
a+cde
```

```bash
$ echo crab | tr abc ABC
CrAB
```

The above command has `abc` for the first string and `ABC` for the second. That means `tr` will pair them up like so

```
a => A
b => B
c => C
```

You can declare character ranges as well. And note the strings don't have to have to one-to-one match. This declaration will turn the characters `a`, `b`, `c`, `d`, `e` into `M`.

```bash
$ echo abcde | tr a-e M
MMMMM
```

## everything to uppercase or lowercase

With that knowledge in mind we can easily switch lowercase to uppercase...for ASCII.

```bash
$ echo "HI there" | tr a-z A-Z
HI THERE
```

Or uppercase to lowercase...for ASCII.

```bash
$ echo "HI there" | tr A-Z a-z
hi there
```

But what if we have more than ASCII?

## character classes

```bash
echo "hi josé" | tr a-z A-Z
HI JOSé
```

That `é` is still lowercase and not the `É` it should be.

The solution? Character classes! They already know everything they need to know about non-ASCII characters.

```bash
$ echo "hi josé" | tr '[:lower:]' '[:upper:]'
HI JOSÉ
```

## swapping case

That all works great, but we can do more and tell `tr` not only switch all lowercase to uppercase but all uppercase to lowercase in one transform!

How? Why we just keep going with our translation declarations.

```bash
$ echo "HI there" | tr '[:lower:][:upper:]' '[:upper:][:lower:]'
hi THERE
```

And, again, because we're using character classes that means unicode letters work as well.

```bash
$ echo "CAfé" | tr "[:lower:][:upper:]" "[:upper:][:lower:]"
caFÉ
```

## what are we even doing?

Why do this at all?

Well, in my case, I wanted a list of lowercase letters, uppercase letters, and numbers. `printable-ascii` can easily provide me with all the characters, but in ASCII order which has uppercase first.

```bash
$ printable-ascii --letters --digits --compact
ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789
```

I _could_ tell `printable-ascii` more explicitly how to order the output by manually defining the ranges in the order I want

```bash
$ printable-ascii --range a-z --range A-Z --digits --compact
abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
```

But the `tr` command can easily do that work for me. And since I'm dealing explicitly with ASCII I can simply use `a-zA-Z`

```bash
$ printable-ascii --letters --digits --compact | tr A-Za-z a-zA-Z
abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
```
