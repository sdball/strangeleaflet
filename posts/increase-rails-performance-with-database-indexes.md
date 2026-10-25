---
title: Increase Rails Performance with Database Indexes
slug: increase-rails-performance-with-database-indexes
published_date: 2013-02-16T05:00:00+00:00
tags: databases, rails, ruby
publish: true
discoverable: true
is_page: false
meta_description: If you need to frequently query a database table by a specific column, you should probably index it.
---

> This is guest post by Travis Williams

Ever added a `belongs_to` or `has_many` to a model in Rails? Did you remember to add the database index? Find out why you should and how it's done in this guest article by [yodatravis](https://github.com/yodatravis).

If you are looking to increase the performance of your data driven web application, the answer may be as simple as adding an index to the correct column of your database table.

A database index is exactly what it sounds like. If you think of the index at the back of a reference book: a quickly searchable list of pointers to get to the actual data. Without an index, a database query might have to look at every row in your database table to find the correct result.

If you find that a SQL query is causing a performance problem and it contains a `where` clause or a `join` then adding an index will greatly speed it up.

## A basic example: searching a table for data

Let's say you are routinely querying your users table.

```ruby
User.where(:email => current_user.email)
```

Rails automatically adds an index to the `id` field of a database table, but in this case we're asking it to find a row based on another piece of data. If you do that often enough you should almost certainly add an index for that data.

```ruby
# a migration to index to the users email column
class AddEmailIndexToUsers < ActiveRecord::Migration
  def change
    add_index :users, :email, :unique => true
  end
end
```

## Joining tables

Another classic example of needing to add an index to increase performance is when you are joining database tables on two unindexed strings. For instance: all users joined by email address to a table of invitations.

```ruby
class User < ActiveRecord::Base
  has_many :order_invites, :foreign_key => 'email', :primary_key => 'email'
end
```

If either the `Users` or `Invitations` table has a large number of rows this query will not perform well because the database is having to scan every record in the invitations table to check for a match against the email from the users table.

This is easily fixed by adding an index to the email column on the `invitations` table.

```ruby
class AddEmailIndexToInvitations < ActiveRecord::Migration
  def change
    add_index :invitations, :email
  end
end
```

Now, instead of having to go through every row in the invitations table, the database can just look up the email in the index and go right to the row we care about.

## How indexes actually work

When a database is told to keep an index on a column, an ordered list (a binary tree technically) is created that gives the database a faster way to search for certain values in that column. If you were told to look through a shuffled deck of cards to find all the Jacks you would have to look at each card until you find them (close to 52 card views). However if that deck was indexed by card value (Ace, 2, 3, ... King) then you could quickly move to where the Jacks should be and find all four of them (let's say 4 or 5 card views). This performance gain is significantly magnified when your table has large numbers of rows.

## When not to use indexes

By now, you might be thinking: why not just add an index to every database table column? Don't do that.

There is a performance hit with indexes. Although select queries can be significantly faster, inserts and updates are marginally slower because there is overhead in maintaining the index. However the small impact (milliseconds) during an insert is usually a small price to pay for what could be seconds (or even minutes) saved on certain queries.

## Rails 3.2 helps to identify where you need indexes

Rails 3.2 introduces the [automated explain plan](http://weblog.rubyonrails.org/2011/12/6/what-s-new-in-edge-rails-explain).  By default, queries that take longer than 0.5 secs will trigger an explain on the query. The rails development log will automatically contain a warning and you will see a database explain plan in the output.

The next time this happens to you, stop and think, "Maybe I need an index."
