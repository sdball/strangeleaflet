---
title: Customize Your IRB
slug: customize-your-irb
published_date: 2013-03-19T04:00:00+00:00
tags: ruby
publish: true
meta_description: How to customize your local Ruby REPL to be a more effective tool.
---

You probably spend a lot of time in IRB (or the Rails console) but have you taken the time to customize it? Today we'll take a look at the things I've added to mine, and I'll show you how to hack in a .irbrc_rails that's only loaded in the Rails console.

```ruby
# ruby 1.8.7 compatible
require 'rubygems'
require 'irb/completion'

# interactive editor: use vim from within irb
begin
  require 'interactive_editor'
rescue LoadError => err
  warn "Couldn't load interactive_editor: #{err}"
end

# awesome print
begin
  require 'awesome_print'
  AwesomePrint.irb!
rescue LoadError => err
  warn "Couldn't load awesome_print: #{err}"
end

# configure irb
IRB.conf[:PROMPT_MODE] = :SIMPLE

# irb history
IRB.conf[:EVAL_HISTORY] = 1000
IRB.conf[:SAVE_HISTORY] = 1000
IRB.conf[:HISTORY_FILE] = File::expand_path("~/.irbhistory")

# load .irbrc_rails in rails environments
railsrc_path = File.expand_path('~/.irbrc_rails')
if ( ENV['RAILS_ENV'] || defined? Rails ) && File.exist?( railsrc_path )
  begin
    load railsrc_path
  rescue Exception
    warn "Could not load: #{ railsrc_path } because of #{$!.message}"
  end
end

class Object
  def interesting_methods
    case self.class
    when Class
      self.public_methods.sort - Object.public_methods
    when Module
      self.public_methods.sort - Module.public_methods
    else
      self.public_methods.sort - Object.new.public_methods
    end
  end
end
```

Ok! There's not too much there, but let's break it down from top to bottom.

# Require commonly used gems

```ruby
# ruby 1.8.7 compatible
require 'rubygems'
require 'irb/completion'

# interactive editor: use vim from within irb
begin
  require 'interactive_editor'
rescue LoadError => err
  warn "Couldn't load interactive_editor: #{err}"
end

# awesome print
begin
  require 'awesome_print'
  AwesomePrint.irb!
rescue LoadError => err
  warn "Couldn't load awesome_print: #{err}"
end
```

Nothing too fancy here. Just some require commands and initialization to load up some of my favorite and frequently used gems.

- [interactive_editor](https://github.com/jberkel/interactive_editor): Allows you to use vim (or your favorite editor) to edit files and have them run within the context of the irb session and to edit objects' YAML representation.
- [Awesome Print](https://github.com/michaeldv/awesome_print): Pretty prints Ruby objects in color and with nice formatting to show their structure. Seriously useful if you inspect a lot of data. The .irb! call hooks it into irb as the default formatter so you don't even need to call it directly. It just happens.

# Configure the prompt and add history

```ruby
# configure irb
IRB.conf[:PROMPT_MODE] = :SIMPLE

# irb history
ARGV.concat [ "--readline", "--prompt-mode", "simple" ]
IRB.conf[:EVAL_HISTORY] = 1000
IRB.conf[:SAVE_HISTORY] = 1000
IRB.conf[:HISTORY_FILE] = File::expand_path("~/.irbhistory")
```

Prompt mode simple just makes prompts look like `>>` instead of `1.9.3p327 :001 >`

Command history is obviously supremely useful if you frequently use the console to hack out solutions.

# Optionally load customizations for the Rails console

```ruby
# load .irbrc_rails in rails environments
railsrc_path = File.expand_path('~/.irbrc_rails')
if ( ENV['RAILS_ENV'] || defined? Rails ) && File.exist?( railsrc_path )
  begin
    load railsrc_path
  rescue Exception
    warn "Could not load: #{ railsrc_path } because of #{$!.message}"
  end
end
```

Ahh, now things get interesting. If we detect `RAILS_ENV` or the Rails object is defined then we can assume that we're actually inside a Rails console and add some extra configuration. We'll get to that extra configuration for Rails in a moment.

# Add .interesting_methods

```ruby
class Object
  def interesting_methods
    case self.class
    when Class
      self.public_methods.sort - Object.public_methods
    when Module
      self.public_methods.sort - Module.public_methods
    else
      self.public_methods.sort - Object.new.public_methods
    end
  end
end
```

This one is pretty fun. It adds on a method to Object called `interesting_methods`. Ruby's object model is great, but it means that the public api to any object is full of methods defined up its ancestor chain.

```ruby
>> Object.new.methods.count
71
>> Module.new.methods.count
111
>> Class.new.methods.count
115
```

`interesting_methods` gives us an easy way to filter all that out.

```ruby
class Magic
  def cast
    'poof'
  end
end

>> Magic.new.methods.count
72
>> Magic.new.interesting_methods.count
1
>> Magic.new.interesting_methods
[
  [0] :cast
]
```

Handy! And with some introspection that code accounts for module and class methods as well.

# Rails customizations

Loading an rc file just for the Rails console adds all kinds of opportunities for enhancement.

```ruby
# hirb: some nice stuff for Rails
begin
  require 'hirb'
  HIRB_LOADED = true
rescue LoadError
  HIRB_LOADED = false
end

require 'logger'

def loud_logger
  enable_hirb
  set_logger_to Logger.new(STDOUT)
end

def quiet_logger
  disable_hirb
  set_logger_to nil
end

def set_logger_to(logger)
  ActiveRecord::Base.logger = logger
  ActiveRecord::Base.clear_reloadable_connections!
end

def enable_hirb
  if HIRB_LOADED
    Hirb::Formatter.dynamic_config['ActiveRecord::Base']
    Hirb.enable
  else
    puts "hirb is not loaded"
  end
end

def disable_hirb
  if HIRB_LOADED
    Hirb.disable
  else
    puts "hirb is not loaded"
  end
end

def efind(email)
  User.find_by_email email
end

# set a nice prompt
rails_root = File.basename(Dir.pwd)
IRB.conf[:PROMPT] ||= {}
IRB.conf[:PROMPT][:RAILS] = {
  :PROMPT_I => "#{rails_root}> ", # normal prompt
  :PROMPT_S => "#{rails_root}* ", # prompt when continuing a string
  :PROMPT_C => "#{rails_root}? ", # prompt when continuing a statement
  :RETURN   => "=> %s\n"          # prefixes output
}
IRB.conf[:PROMPT_MODE] = :RAILS

# turn on the loud logging by default
IRB.conf[:IRB_RC] = Proc.new { loud_logger }
```

Note, for these enhancements to work in Rails apps that use bundler you'll need to add the required gems to your Gemfile and then run `bundle`.

```ruby
group :development do
  gem "awesome_print"
  gem "hirb"
  gem "interactive_editor"
end
```

[Hirb](https://github.com/cldwalker/hirb) is an awesome thing to add to your Rails console. It adds stuff like table formatting for models and general data, a console menu, and a pager.

The logger customizations will output things like SQL statements made to the database unless `quiet_logger` is called. Very handy if you are debugging a complex ActiveRecord query.

The prompt mode configuration is just a nice prompt with the application name. We define a `:RAILS` prompt mode and then use it.

That `efind` method is just a handy shortcut for something I do semi-often. It combines well with a dash expander shortcut that autofills in my email address.

# Want to know more?

There's a great post on tagholic with _tons_ of info on how to completely customize your irb session: [Exploring how to configure irb](http://tagaholic.me/2009/05/29/exploring-how-to-configure-irb.html#prompt). If you're interested in any of the options I use in this post, odds are good that they are explained in much more detail there.
