---
title: Command line tools - jq
slug: command-line-tools-jq
published_date: 2019-11-06T05:00:00+00:00
tags: shell
publish: true
discoverable: true
is_page: false
meta_description: jq is awesome
---

Need to parse some JSON data? Of course you do! JSON is practically the lifeblood of API calls these days.

- [GitHub](https://api.github.com/users/sdball/events/public)
- [Google Cloud Storage](https://cloud.google.com/storage/docs/json_api/)
- [Lots of awesome datasets](https://github.com/jdorfman/awesome-json-datasets)
- [Dark Sky](https://darksky.net/dev/docs#response-format)
- Everything else with an API (practically)

So great. What if you want to use that data? If you want to use it quickly, easily, and efficiently? From the command line?

Do you need to write your own bespoke JSON parsers in your programming language of choice? No! [jq](https://github.com/stedolan/jq) exists!

jq reads JSON and accepts a format that it will apply to the JSON data.

An example is worth more than more words here.

```bash
$ curl -s https://api.github.com/users/sdball | jq '.'
{
  "login": "sdball",
  "id": 45837,
  "node_id": "MDQ6VXNlcjQ1ODM3",
  "avatar_url": "https://avatars3.githubusercontent.com/u/45837?v=4",
  "gravatar_id": "",
  "url": "https://api.github.com/users/sdball",
  "html_url": "https://github.com/sdball",
  "followers_url": "https://api.github.com/users/sdball/followers",
  "following_url": "https://api.github.com/users/sdball/following{/other_user}",
  .
  .
  .
```

Here we're pulling the JSON data from https:/[/api.github.com/users/sdball](//api.github.com/users/sdball) and sending it straight through to jq and a `"."` format. That `.` there is [jq's identity function](https://stedolan.github.io/jq/manual/#Identity). The identity function returns its input unchanged. Hooray! And, bonus, by default jq pretty-prints its output so as a nice side effect jq outputs nicely pretty printed JSON. Let's see that with a smaller piece of JSON real quick.

```bash
$ echo "[1,2,3,4,5]" | jq '.'
[
  1,
  2,
  3,
  4,
  5
]
```

Nice.

From here we can ask jq to do ALL KINDS of awesome data extractions and transforms! More examples!

What if we want to get the first three elements of an array? The `.[]` syntax is how jq parses array values.

```bash
$ echo "[1,2,3,4,5,6]" | jq '.[0:3]'
[
  1,
  2,
  3
]
```

Or pull some key information from the GitHub user API data? In this example we use the `{}` syntax to tell jq to trim the input object down to specific keys.

```bash
$ curl -s https://api.github.com/users/sdball | jq '{ created_at, followers, following, blog }'
{
  "created_at": "2009-01-11T22:44:09Z",
  "followers": 75,
  "following": 29,
  "blog": "https://strangeleaflet.com"
}
```

We can get really fancy!

```bash
$ curl -s https://api.github.com/users/sdball | jq -r '. |
  to_entries |
  .[] |
  select(.value) |
  select(.key | endswith("url")) |
  "\(.key) --- \(.value)"'

avatar_url --- https://avatars3.githubusercontent.com/u/45837?v=4
url --- https://api.github.com/users/sdball
html_url --- https://github.com/sdball
followers_url --- https://api.github.com/users/sdball/followers
following_url --- https://api.github.com/users/sdball/following{/other_user}
gists_url --- https://api.github.com/users/sdball/gists{/gist_id}
starred_url --- https://api.github.com/users/sdball/starred{/owner}{/repo}
subscriptions_url --- https://api.github.com/users/sdball/subscriptions
organizations_url --- https://api.github.com/users/sdball/orgs
repos_url --- https://api.github.com/users/sdball/repos
events_url --- https://api.github.com/users/sdball/events{/privacy}
received_events_url --- https://api.github.com/users/sdball/received_events
```

There's a lot to that one, let's unpack it.

```bash
jq -r '. |
  to_entries |
  .[] |
  select(.value) |
  select(.key | endswith("url")) |
  "\(.key) --- \(.value)"'
```

1. `.` The identity function
2. `to_entries` This function transforms objects into key/value pairs. Like so
   ```bash
   $ echo '{"a": 1, "b": 2}' | jq '. | to_entries'
   [
     {
       "key": "a",
       "value": 1
     },
     {
       "key": "b",
       "value": 2
     }
   ]
   ```
3. `.[]` unpacks the array
4. `select` allows us to filter, e.g. `select(.value)` filters out any elements with a null `.value`
5. Another `select` filter out any elements that don't have a key ending in `url`
6. And finally the `"\(.key) --- \(.value)"` tells jq to format the output

Fun times! jq is an extremely powerful tool for parsing and transforming JSON. Add it to your toolbox!
