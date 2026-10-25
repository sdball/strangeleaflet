---
title: What's a $PATH anyway?
slug: whats-a-path-anyway
published_date: 2016-08-30T04:00:00+00:00
tags: shell
publish: true
is_page: false
meta_description: What is $PATH and how does it work? Let's find out.
---

You've probably seen `$PATH` or just `PATH` before as the place you need to add new commands for your prompt. What is that? Where is it? How does it work?

# High Level: What's the $PATH?

`$PATH` is a shell variable that holds an ordered list of all the directories that your shell will search within when you tell it to run a command.

# Commands, how do they work?

When you run a command like `date` in your prompt your shell first looks to see if that command matches any "built-in" commands. If so it will run that built-in command that's actually part of the shell itself.

If the command doesn't match a built-in then your shell examines the `$PATH` variable to see all the directories that it's allowed to search in to find a command to run. Starting with the first it checks each directory and when it finds an executable file with a filename matching your command then it will execute it with any arguments you've given.

# $PATH in action

First open up your prompt.

```bash
$
```

Great! Now let's examine what the shell _would_ run for various commands. We can do that with a command called `which`. Given a command, `which` tells you what the shell would run.

```bash
$ which date
/bin/date
```

There we see that if we were to run the `date` command, the shell would find and execute `/bin/date`.

Let's get meta on it.

```bash
# In zsh which is a built-in
$ which which

# In bash which is an actual command
$ which which
/usr/bin/which
```

Let's try something that might give you some more interesting results.

```bash
$ which ruby
/Users/sdball/.asdf/shims/ruby
```

On the machine I'm writing this post on I use the excellent [asdf](https://github.com/asdf-vm/asdf) to manage my Ruby installation. When I ask my shell what it would run for `ruby` I find that it wouldn't actually call a specific Ruby version, but this asdf shim. In that way asdf can control which Ruby version it uses depending on the current shell or project settings.

# Ok, but what does it do?

You can add your own directories to the $PATH so you can easily add new executable commands to your command line environment! Woo!

The syntax is weird, but the gist is that you want to _add_ your new directories to the `PATH` variable without interfering with what's already there. You do that be declaring the new `PATH` variable to be the original `PATH` variable plus your own stuff. The directories are each separated with a`:` character.

# What's on the $PATH?

If you want to see what your `PATH` variable already has you can use the `echo` command. The `echo` command prints all of its arguments to `STDOUT`.

```bash
$ echo $PATH
/Users/sdball/bin:/Users/sdball/.asdf/bin:/Users/sdball/.asdf/shims:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
```

If you want some nicer formatting let's translate those `:` characters into newlines with the `tr` command.

```bash
$ echo $PATH | tr : "\n"

/Users/sdball/bin
/Users/sdball/.asdf/bin
/Users/sdball/.asdf/shims
/usr/local/bin
/usr/bin
/bin
/usr/sbin
/sbin
```

# Your own bin directory

In your `.bashrc` or `.zshrc` or similar shell startup file you can add a line like this:

```bash
export PATH="$HOME/bin:$PATH"
```

That says to make `$HOME/bin` the first place the shell checks for any command before going on to check whatever was already configured.

I highly recommend having a `bin` directory in your home directory in your `PATH` variable. That gives you an easy place to place new shell scripts or your own custom commands.

If you'd like to see what I keep in `bin` feel free to look! [My `bin` directory](https://github.com/sdball/dotfiles/tree/master/bin) is a public part of [my dotfiles repo](https://github.com/sdball/dotfiles).
