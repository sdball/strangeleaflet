---
title: Parsing Dates and Times from Strings using strptime
slug: parsing-dates-and-times-from-strings-using-strptime
published_date: 2012-02-10T05:00:00+00:00
tags: ruby
publish: true
is_page: false
meta_description: Datetime strings are complex. Let's turn them into structured data.
---

Howdy y'all. As much as we'd prefer to just deal with nicely formatted data; the real world sometimes requires that we parse weird datetime strings into actual DateTime objects. Today's article is all about how to parse dates and times from arbitrary strings using the powerful method `strptime`.

Using `DateTime.strptime` we can turn crazy data like `07-FEB-12
03.39.14.490227"` into actual `DateTime` objects. Seriously! It's actually possible, and we won't even need to break out the ol' regular expressions. Let's look at the basics.

```ruby
require 'date'

# datetime strings don't really get more basic than this
date_string = '2012-02-09 20:05:33'

# -- using DateTime.parse ----------------
# This string can actually be parsed using the .parse method
# Always try throwing .parse at a datetime string.
# If it can puzzle out the format: you win.
datetime = DateTime.parse(date_string)
puts datetime
# >> 2012-02-09T20:05:33+00:00

# -- using DateTime.strptime ----------------
puts DateTime.strptime(date_string, '%Y-%m-%d %H:%M:%S')
# >> 2012-02-09T20:05:33+00:00
```

See that? We got the same `DateTime` object using `strptime` that we got using parse. Right on! But what the heck did we just do?

The `strptime` method takes two arguments: the date/time string to parse, and the date format pattern. The date format pattern is a set of rules for describing all the different pieces of a date/time that we could possibly find within the string representation of a date.

The date format pieces are standard bits of computing lore. I never remember what they are and I always confuse `%m` (the month as a number, e.g. 2) and `%M` (the minute of the hour, e.g. 2). Oh dates, you're so ambiguous.

Ruby Dock has a great [time formatter reference](http://www.ruby-doc.org/stdlib-1.9.3/libdoc/date/rdoc/DateTime.html#method-i-strftime) as part of the `strftime` method reference.

In the example above, we use:

- `%Y` : the four digit year
- `%m`: the month as an integer with a leading zero
- `%d`: the day of the month as an integer with a leading zero
- `%H`: the hour of the day (24 hour style, 0-23)
- `%M`: the minute of the hour with leading zero
- `%S`: the second of the minute with leading zero

The real trick to parsing with `strptime` is just knowing that there is a date/time formatter for just about any date string.

So let's tackle our challenge: `07-FEB-12 03.39.14.490227`

What is that? `.490227`? Ugh. Let's try throwing `.parse` at it.

```ruby
puts DateTime.parse('07-FEB-12 03.39.14.490227')
# >> 2012-02-07T00:00:00+00:00
```

Oookay, `.parse` was able to puzzle out the date; but not the time. Time to dig through the formatting docs.

```ruby
# 07-FEB-12 03.39.14.490227

# Let's break it down!

# 07 : day of the month
#  %d

# FEB : month as a three character string
#  %b

# 12 : the year as a two digit number (hey Y2K)
#  %y

# Time to check our work
puts DateTime.strptime('07-FEB-12', '%d-%b-%y')
# >> 2012-02-07T00:00:00+00:00

# So far so good.

# 03.39.14.490227 ಠ_ಠ
# We'll have to just make some guesses here.

# 03 : hours, probably 0-23 since there's no AM/PM
#  %H

# 39 : minutes
#  %M

# 14 : seconds
#  %S

# 490227 : nanoseconds?
#  %N

# let's apply our guesses
puts DateTime.strptime('07-FEB-12 03.39.14.490227', '%d-%b-%y %H.%M.%S.%N')
# >> 2012-02-07T03:39:14+00:00
```

Alright! An actual DateTime object that looks like it's gotten at least pretty close to the intention of this weird date/time string.

Parsing date/time strings into structured DateTime objects is one of those tedious tasks. It's always a little frustrating to go through this process because we know that in almost all cases the string we are working hard to put into a structured DateTime came out of a structured DateTime object somewhere in its history. Thankfully Ruby provides us with some good functions to make it as easy as possible.
