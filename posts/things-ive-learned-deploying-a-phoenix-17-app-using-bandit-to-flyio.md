---
title: Things I've learned deploying a Phoenix 1.7 app using Bandit to fly.io
slug: things-ive-learned-deploying-a-phoenix-17-app-using-bandit-to-flyio
published_date: 2022-12-28T05:00:00+00:00
tags: elixir, fly.io, phoenix
publish: true
discoverable: true
is_page: false
alias: things-ive-learned-deploying-a-phoenix-17-app-using-bandit-to-flyio-new
meta_description: Some issues I ran into deploying a Phoenix app using Bandit to fly.io and what I learned from them.
---

Over the past few days I've been developing a hobby site ([furtherfrom.com](https://furtherfrom.com))
using Phoenix 1.7 and [fly.io](https://fly.io/). I ran into a few snags along the way. I'll
summarize the issues I ran into and how I worked around them.

## Issue: SQLite and fly.io volumes

Using postgres would've been the easy option. But I'm a big fan of SQLite and
the [concept of LiteFS](https://fly.io/blog/introducing-litefs/). Although
funnily enough I haven't gotten LiteFS setup with my application yet.

SQLite requires a filesystem to write the database files into. A deployed
fly.io application does not have a persistent volume to store data.

### Solution: create fly.io volumes

Need a persistent volume on fly.io? Well no problem we can create one!

```
$ fly volumes create furtherfrom_data --size 1
```

That command will prompt for a region and then create a one gigabyte volume in
that selected region.

With a volume in-hand we then need to update the `fly.toml` file for the
application to tell it where we want to mount the data.

```toml
[mounts]
  source = "furtherfrom_data"
  destination = "/data"
```

Great! So we'll have the `furtherfrom_data` volume mounted at `/data`

Now we need to ensure our Phoenix app creates/reads from a SQLite database in `/data`

Handily enough that's configured via an ENV variable.

```elixir
if config_env() == :prod do
  database_path =
    System.get_env("DATABASE_PATH") ||
      raise """
      environment variable DATABASE_PATH is missing.
      For example: /etc/further_from/further_from.db
      """
```

That means we only need to tell our `fly.toml` file to set an environment variable.

```toml
[env]
  DATABASE_PATH = "/data/furtherfrom_data/furtherfrom_prod.db"
```

Done! With that setup in place I was able to deploy my application. But things
weren't quite working yet. LiveView was refusing connections.

## Issue: LiveView refusing connections from the custom domain

Locally all the LiveView things worked great. Great!

Deployed to fly.io accessing my app using the dev domain worked great. Great!

Deployed to fly.io accessing my app using my custom domain refused connections.
Not so great!

Turns out that by default, Phoenix LiveView ensures the websocket connections
matches the URL host of the endpoint.

### Solution: set the check_origin configuration in production

```elixir
config :further_from, FurtherFromWeb.Endpoint,
  check_origin: [
    "https://furtherfrom.com",
    "https://www.furtherfrom.com"
  ]
```

With that setup in place the deployed application was happy to accept LiveView
connections from the custom domain. Great!

## Issue: clustering my deployed application nodes

Sure deploying to a single region using fly.io is easy. And deploying to
multiple regions is easy. Fly.io handles all of that and routes users to their
closest available region.

But I wanted to cluster my deployed nodes together! For literally no reason
other than I could! Let's wield the power of Elixir!

Fly.io has a [very helpful guide for Elixir
clustering](https://fly.io/docs/elixir/getting-started/clustering/) but after
following it and deploying my logs were full of these errors:

```
... sjc ... [libcluster:fly6pn] unable to connect to :"further-from@fdaa:0:69f0:a7b:a3:3:911f:2"
... iad ... [libcluster:fly6pn] unable to connect to :"further-from@fdaa:0:69f0:a7b:93:3:8dd5:2"
... iad ... [libcluster:fly6pn] unable to connect to :"further-from@fdaa:0:69f0:a7b:a3:3:911f:2"
... sjc ... [libcluster:fly6pn] unable to connect to :"further-from@fdaa:0:69f0:a7b:93:3:8dd5:2"
... sjc ... [libcluster:fly6pn] unable to connect to :"further-from@fdaa:0:69f0:a7b:a3:3:911f:2"
```

### Solution: Name my Elixir nodes as expected

Turns out that very helpful Elixir clustering doc assumes (but does not explicitly state) that you have followed an [earlier doc that has you name your nodes to be discoverable](https://fly.io/docs/elixir/the-basics/naming-your-elixir-node/).

Once I applied that consistent and discoverable Elixir node naming my clustering setup worked!

## Issue: Bandit logging an error for every TCP check from fly.io

Turns out that Bandit (the HTTP server) logs an error if a client connects but
doesn't make an HTTP request. That's exactly what the fly.io service check was
doing!

```toml
[[services.tcp_checks]]
  grace_period = "1s"
  interval = "15s"
  restart_limit = 0
  timeout = "2s"
```

### Solution 1: Switch to an HTTP check calling "/"

Easy enough. Turn that TCP check into a full HTTP check so Bandit doesn't log it as an error.

```toml
[[services.http_checks]]
  grace_period = "1s"
  interval = "15s"
  method = "get"
  path = "/"
  protocol = "http"
  restart_limit = 0
  timeout = "2s"
  [services.http_checks.headers]
    X-Forwarded-Proto = "https"
```

But that solution had a slight issue. Now instead of logging errors for every
check Bandit was logging the actual HTTP requests for every check. Better but
that was obscuring actual requests. I wanted my logs to have real requests, not
status check requests!

### Solution 2: Switch to an HTTP check of an asset

Turns out Phoenix serves assets via a short path of plugs (functions that work
in concert to turn web requests into responses) that returns the asset contents
without logging the request.

I switched my fly.io HTTP status check to check for an asset instead of
making an application request. That means it doesn't check the full end to
end functionality of the application but it does check that the application is
running and serving requests so that's good enough for me.

```toml
[[services.http_checks]]
  grace_period = "1s"
  interval = "15s"
  method = "get"
  path = "/up.txt"
  protocol = "http"
  restart_limit = 0
  timeout = "2s"
  [services.http_checks.headers]
    X-Forwarded-Proto = "https"
```

I could have used one of the application assets that were already available
like app.js but that's a lot of superfluous bytes to serve for every check.
Instead I created an `up.txt` file that simply contains "OK"

That meant I had to change Phoenix to serve that as an asset.

I added `up.txt` to the known static paths.

```elixir
def static_paths, do: ~w(assets fonts images favicon.ico robots.txt up.txt)
```

And added `up.txt` to `priv/static`

`priv/static/up.txt`

```
OK
```

With that change fly.io can continually check on my application without logging
errors, logging HTTP requests, or serving needless extra bytes. Hooray!

## Issue: errors deploying with an npm installed module

The application is working great, it's got distributed/clustered nodes, it's
got an HTTP check that's not logging. Now I wanted to add [Plausible
analytics](https://plausible.io/) BUT not simply the easy route of adding JS
that directly calls the plausible.io API. I wanted to make the API calls to my
app which would then forward them to plausible.io. A bit convoluted but since I
actually had a server under my control I wanted browsers to only have to
communicate with my own server. Also if I ever want to self-host my analytics
the seam between my application and the analytics will make that easy.

My approach: use
[plausible-tracker](https://github.com/plausible/plausible-tracker) configured
to use my own endpoint as the `apiHost`.

Easy enough: in the `assets` Phoenix directory I simply had to run `npm install
plausible-tracker --save` and update my app.js file to setup the tracker.

But while that worked great at the application level, I ran into an issue
deploying to fly.io

```
03:30:06.832 [debug] Downloading esbuild from https://registry.npmjs.org/esbuild-linux-arm64/-/esbuild-linux-arm64-0.14.41.tgz
✘ [ERROR] Could not resolve "plausible-tracker"

    js/app.js:24:22:
      24 │ import Plausible from 'plausible-tracker'
         ╵                       ~~~~~~~~~~~~~~~~~~~

  You can mark the path "plausible-tracker" as external to exclude it from the bundle, which will remove this error.

1 error
** (Mix) `mix esbuild default --minify` exited with 1
```

### Solution: teach my fly.io builder to npm install

Luckily the issue was easy to reproduce locally. In a configured fly.io
application you have a `Dockerfile`. That means you can debug a release build
locally by running docker build

```
$ docker build .
```

The problem was that `node_modules` is (correctly!) not committed to the repo.
Seriously don't commit `node_modules` to your repo. But nothing in the builder
was running `npm install` before running `esbuild` which meant esbuild was
correctly complaining that the import of `plausible-tracker` wasn't resolving
to anything.

The fix was to teach the fly.io application builder container to `npm install`

First: add `npm` to the build dependencies

```dockerfile
# add npm to the end of the list
RUN apt-get update -y && apt-get install -y build-essential git npm \
```

Then: add a command to `npm install` AFTER assets have been copied and BEFORE
esbuild (mix assets.deploy).

```dockerfile
COPY assets assets

RUN cd assets && npm install # <--- add this line

# compile assets
RUN mix assets.deploy
```

With that change in place my application could build happily with all the npm
assets I care to install.

## Phoenix PubSub

This wasn't an issue at all but I wanted to call it out. With my application
node clustered adding a pubsub feature to show recently computed event
comparisons was absolutely easy and downright fun!

```elixir
# broadcast a comparison
FurtherFromWeb.Endpoint.broadcast!(
  "recently_seen_comparison",
  "created",
  recently_seen
)
```

```elixir
# elsewhere subscribe to the topic
FurtherFromWeb.Endpoint.subscribe("recently_seen_comparison")

# that same process will need to know how to handle messages for the topic
# this is all pure Erlang/OTP stuff so a foundational concept of the language
def handle_info(
    %Phoenix.Socket.Broadcast{
      topic: "recently_seen_comparison",
      event: "created",
      payload: recently_seen
    },
    socket
  ) do
    # do something with recently_seen
end
```

## Next? LiteFS

Right now I have the pubsub feature to propagate recent comparisons around the
cluster of nodes. That's great!

I also have a subscriber process listening to the topic and writing recent
comparisons to the database if they didn't originate from the application's
region. That's really easy and cool but it's a bespoke approach that has to
know things. A better approach would be to actually use LiteFS to replicate the
SQLite database to all nodes.

But for now I'm pretty pleased with how this hobby app has turned out. It's my
first real experience with Phoenix 1.7 and with fly.io for deployment and I've
been extremely happy with both. I was a Rails programmer for years, a NodeJS
programmer at my day job for years, and neither of those comes close. LiveView
was sheer ease to work with and its performance is amazing. Fly.io has also
been incredible. I'm blown away at, even with these issues, how easy it was to
deploy a globally clustered Elixir application.
