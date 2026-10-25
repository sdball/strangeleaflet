---
title: Gem Spotlight: interactive_editor
slug: gem-spotlight-interactive_editor
published_date: 2013-01-04T05:00:00+00:00
tags: ruby
publish: true
discoverable: true
is_page: false
meta_description: Taking a look at the interactive_editor gem and its capabilities.
---

Today we'll take a quick look at one of my favorite gems: interactive_editor. Have you ever been in a REPL session (rails console, irb, pry, etc.) and wished that you could pop open a full editor to write out some code? (Ok, maybe not you pry users.) Well interactive_editor is a gem that gives you just that, as well as some really nice object inspection and manipulation.

# The dark times

```ruby
# ok, we're in irb and want to write up a class to test an idea
> class Magic
>   def initialize
>     # crap! forgot arguments
>   end
> end
> class Magic
>   def initialize(name)
>     @name = name
>     # crap! spell would be a better name
>   end
> end
> class Spell
>   # yeah, you get the idea and have probably been here
> end
```

So that's a pain. The usual alternative is to pop over to an editor and prototype out the code there, but that's getting less fun. Sure you can execute ruby code from just about any editor and see the results, but you're limited to what you explicitly print out. You lose the ability to play with your objects directly.

Wouldn't it be nice if you could just integrate your editor of choice into your REPL of choice?

# Interactive Editor

```
$ gem install interactive_editor
```

```
> require 'interactive_editor'
> vim
```

What you'd see next is my full vim open up a temporary file. It's not a pseudo vim, not a generic vim, it's my vim with _my_ theme, plugins, and configuration.

You aren't limited to vim either! Out of the box it supports a bunch of editors like TextMate and emacs. You can also configure any editor that you can launch from the command line, you just have it set it up.

Any code you enter into the editor session is executed in the irb session when you save and quit.

If you type "vim" again, it reopens that same temporary file. Perfect for editing a class over and over again until things work as you want them to.

Because ruby is ruby, if you edit a class in the vim session even objects you've instantiated will get the updated code.

# Object Inspection

But we're not limited to writing new code. interactive_editor also adds methods to Object that will launch any of its configured editors. Calling that method will open any object in YAML representation. You can even edit the YAML and when you save/quit your editor it will be written back out just as if you had manually typed in all the YAML in the console.

```ruby
> vim
class Spell
  attr_reader :name
  def initialize(name)
    @name = name
  end

  def cast
    name.reverse.upcase
  end
end
> spell = Spell.new('frotz')
#<Spell:0x007fef2b05bde8 @name="frotz">
> spell = spell.vim # remember, the output is executed so we need to save it
```

```
--- !ruby/object:Spell
name: frotz
```

Change that to:

```ruby
--- !ruby/object:Spell
name: nitfol
```

```ruby
> spell.name
"nitfol"
```

Amazing! This is particularly handy for inspecting complicated Rails models. Unfortunately for that it only works well if you aren't using sqlite because the YAML representation of a sqlite model doesn't show column names.

If you use this YAML editing trick to change a Rails model, you need to know a trick. Because you've edited the model data directly and bypassed the Rails updating methods, Rails doesn't consider anything in the model to be changed. You need to flag specific fields to update with the `will_change!` method.

```ruby
> t = Todo.first
> t = t.vim # let's say you edit the "task" field
```

```ruby
--- !ruby/object:Todo
attributes:
  id: 1
  task: show off interactive_editor
  description: https://github.com/jberkel/interactive_editor
  complete: true
  due_at: 2013-01-04
  created_at: 2013-01-04 18:01:59.987189000 Z
  updated_at: 2013-01-04 18:01:59.987189000 Z
```

```ruby
> t.save # does nothing
> t.task_will_change!
> t.save # saves the new task field
```

Intrigued? Interested? I hope so. [interactive_editor](https://github.com/jberkel/interactive_editor) is one of my favorite tips. I have my .irbrc configured to automatically load it so I can just get going easily on any code prototyping or introspection that I care to tackle.
