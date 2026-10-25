---
title: Clojure Functions in Four Ways
slug: clojure-functions-in-four-ways
published_date: 2021-01-31T05:00:00+00:00
tags: clojure
publish: true
meta_description: Four different and differently useful ways you can create functions in Clojure.
---

Perl may have coined TMTOWTDI (there's more than one way to do it) but Clojure takes that idea and runs over the horizon.

Today I'd like to quickly show you four ways to create a function in Clojure.

Each block of code will define a `doubler` function that simply doubles its given integer argument.

# defn

This is essentially the standard way to define a function in Clojure: name, args, function body.

```clojure
(defn doubler [n] (* 2 n))
```

# def and fn

```clojure
(def doubler (fn [n] (* 2 n)))
```

This is a verbose variant of `defn` and is essentially what `defn` is doing
behind the scenes. Here we have an anonymous function (the `fn` bound to a name
with `def`).

# Function literals

Clojure also allows defining functions with an even shorter syntax than `fn`.
The `#` character can define function literals. With that syntax you can't have
named arguments but instead get positional references e.g. `%1 %2 %3`

```clojure
(def doubler #(* 2 %1))
```

# Using partial

Now it gets interesting. Clojure provides the most wonderful and excellent
`partial` function. The `partial` function accepts a function and some
arguments and returns a new function that calls the original function with
those originally given arguments plus any remaining required arguments.

Ah it's hard to explain so I'll show it: this is `doubler` using `partial`.

```clojure
(def doubler (partial * 2))
```

What's happening there?

The `def doubler` is simply assigning the name so let's ignore that.

The real interesting bit

```clojure
(partial * 2)
```

That call to `partial` accepts a function `*` and an argument `2` and returns a
new function that will accept more arguments to supply to the `(* 2)` call.

The new function takes any arguments it's given and supplies them to `(* 2)` as
though we had called it directly.

```clojure
(def doubler (partial * 2))

(doubler 10)  ; => 20 == (* 2 10)
(doubler 3 4) ; => 24 == (* 2 3 4)
```

You can see it's not quite the same as the first two `doubler` functions in
that it takes any number of arguments. Such is the power and flexibility of
`partial`.
