---
title: Let's Write a Gem: Part 1
slug: lets-write-a-gem-part-1
published_date: 2012-02-21T05:00:00+00:00
tags: ruby
publish: true
is_page: false
meta_description: Ever wanted to write a Ruby gem? Let's do that!
---

> Followup: [Let's Write a Gem: Part 2](/lets-write-a-gem-part-2/)

Gems. Gotta love em. If you're a Ruby developer then you already know that gems are simply fundamental to Ruby programming. Let's write one. Right now. And not a simplistic Gem that just adds three lines of code to the automatically generated Gem layout from `bundle gem`. Let's write a real Gem that includes files and everything.

## 1. Create a fresh gemset

First off, we need a clean space to work in. So let's create a brand new gemset in RVM.

```ruby
# periodic_table will be the name of our gem
rvm --create use 1.9.3@periodic_table
```

## 2. Install bundler to manage building the gem

There are two applications I know of to help us build a gem: Bundler and Jeweler. I'm familiar with Bundler so we'll go with that. We just need to install its gem to get going.

```
gem install bundler
```

## 3. Create the initial gem layout

Head to some code storage directory. A lot of folks like a `~/code` or `~/projects`. Myself, I keep almost everything on github so I have `~/github/ORG/repos`. The ORG lets me group my repos by area of interest: personal, work, DuckDuckGo, etc.

```
bundle gem periodic_table
```

This command takes care of quite a bit.

- creates the directory and initial structure of the gem
- initializes a git repository for the gem
- writes an initial gemspec
- sets up some really helpful rake tasks for development

## 4. Modify periodic_table.gemspec

Now we've got a working gem (seriously), it just doesn't do anything.

The next step in our gem journey is to give some attention to the gem's
metadata. All of the gem's information is stored in the gemspec.

The gemspec contains:

- the name of the gem
- the files that are in it
- the gems it depends on for testing
- the gems it depends on for actually running
- lots more

Let's take a couple minutes and go through an annotated gemspec, then take a
move to a modified version ready to commit to the git repo.

```ruby
# -*- encoding: utf-8 -*-

# -- this is magic line that ensures "../lib" is in the load path -------------
$:.push File.expand_path("../lib", __FILE__)

# -- lib/periodic_table/version was created by bundler ------------------------
# requiring it here allows access to PeriodicTable::VERSION
# you do NOT need to add additional require statements here as you build the gem
require "periodic_table/version"

Gem::Specification.new do |s|
  s.name        = "periodic_table"
  s.version     = PeriodicTable::VERSION
  s.authors     = ["Stephen Ball"]
  s.email       = ["sdball@gmail.com"]
  s.homepage    = ""
  s.summary     = %q{TODO: Write a gem summary}
  s.description = %q{TODO: Write a gem description}

  # -- yep, out of the box bundler has our gem setup to get to rubyforge ------
  s.rubyforge_project = "periodic_table"

  # -- these lines are worth some study ---------------------------------------
  # s.files: The files included in the gem. This clever use of git ls-files
  #          ensures that any files tracked in the git repo will be included.
  s.files         = `git ls-files`.split("\n")

  # s.test_files: Files that are used for testing the gem. This line cleverly
  #               supports TestUnit, MiniTest, RSpec, and Cucumber
  s.test_files    = `git ls-files -- {test,spec,features}/*`.split("\n")

  # s.executables: Where any executable files included with the gem live.
  #                These go in bin by convention.
  s.executables   = `git ls-files -- bin/*`.split("\n").map{ |f| File.basename(f) }

  # s.require_paths: Directories within the gem that need to be loaded in order
  #                  to load the gem.
  s.require_paths = ["lib"]

  # specify any dependencies here; for example:
  # s.add_development_dependency "rspec"
  # s.add_runtime_dependency "rest-client"
end
```

periodic_table.gemspec
Two areas that really confused me when I was starting to learn how to write gems were the `require "periodic_table/version"` and the `s.files`. I incorrectly thought after taking my first look through the gemspec that I would need to add more `require` statements as I developed my gem. That isn't the case: the files just need to be in git.

I'll say that again. As you develop gems, the (out of the box) requirement that all files necessary for building the gem be in git can surprise you. While developing if your gem starts throwing unexpected `LoadError: cannot load such file` errors then check and make sure that you've staged any new files in git.  Until you do that the gem will install without issue but will bomb when you actually try to require it.

Here's our gemspec ready for a first commit into the repo. All we've modified is the summary and description.

```ruby
# -*- encoding: utf-8 -*-
$:.push File.expand_path("../lib", __FILE__)
require "periodic_table/version"

Gem::Specification.new do |s|
  s.name        = "periodic_table"
  s.version     = PeriodicTable::VERSION
  s.authors     = ["Stephen Ball"]
  s.email       = ["sdball@gmail.com"]
  s.homepage    = ""
  s.summary     = %q{Provide periodic table data.}
  s.description = %q{Provide data on elements in the periodic table.}

  s.rubyforge_project = "periodic_table"

  s.files         = `git ls-files`.split("\n")
  s.test_files    = `git ls-files -- {test,spec,features}/*`.split("\n")
  s.executables   = `git ls-files -- bin/*`.split("\n").map{ |f| File.basename(f) }
  s.require_paths = ["lib"]

  # specify any dependencies here; for example:
  # s.add_development_dependency "rspec"
  # s.add_runtime_dependency "rest-client"
end
```

periodic_table.gemspec

## 5. Make an initial commit to the git repo

```
git add periodic_table.gemspec
git commit -a -m "initial commit"
```

## 6. Setup an .rvmrc for the directory

Before we go any further, we should setup an .rvmrc file for the project so RVM will automatically switch to the correct gemset.

```bash
rvm --rvmrc 1.9.3@periodic_table
git add .rvmrc
git commit -m "rvmrc"
cd ..
cd - # and accept the .rvmrc authorization
```

## 7. Install the gem

Sure our gem doesn't actually do anything yet, but that doesn't mean we can't install it. Bundler has provided us with some handy rake tasks to make installing our in-development gem easy.

```
rake install
```

Bam! Gem installed. Don't believe it?

```
% gem list
*** LOCAL GEMS ***

bundler (1.0.22)
periodic_table (0.0.1)

% irb
1.9.3p0 :001 > require 'periodic_table'
 => true
1.9.3p0 :002 > PeriodicTable::VERSION
 => "0.0.1"
```

Yeah! Our gem has a namespace and a VERSION! WOO!

Now, be aware that our installed version of the gem has been compiled. If we change the source then we'll have to uninstall/reinstall the gem to see the change.

```
gem uninstall periodic_table
rake install
```

## 8. Write a README

First things first. Let's write a quick README to figure out how we want this gem to be used.

```markdown
# Periodic Table

## Installation

    gem install periodic_table

## Usage

    require 'periodic_table'

    # Lookup data for an element by name
    PeriodicTable.lookup 'oxygen'
```

There. README driven development at its finest. That's enough to get going, and certainly enough to keep this tutorial on track.

Continue on to [Part 2](/lets-write-a-gem-part-2/), in which we actually write the gem and use it in other projects.

Check out the ["Let's Write a Gem" Reddit discussion](http://www.reddit.com/r/ruby/comments/q2t4m/rruby_writing_gems_is_easy_and_fun_do_it/).
