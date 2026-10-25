---
title: A Global Elixir Phoenix Multiplayer Game
slug: a-global-elixir-phoenix-multiplayer-game
published_date: 2025-01-11T05:00:00+00:00
publish: true
discoverable: true
is_page: false
---

This is a followup to my previous post [explaining how I initially wrote Mowing](/writing-an-elixirphoenix-based-multiplayer-minesweeper-game/) — a multiplayer "Minesweeper" clone with a gardening theme.

You can find them in the games menu in their multiplayer and single player forms:

- [Mowing (narrow, solo)](https://strangeleaflet.fly.dev/games/mowing-narrow)
- [Mowing (narrow, multiplayer)](https://strangeleaflet.fly.dev/games/mowing-narrow-multi)
- [Mowing (wide, solo)](https://strangeleaflet.fly.dev/games/mowing-wide)
- [Mowing (wide, multiplayer)](https://strangeleaflet.fly.dev/games/mowing-wide-multi)

## What changed?

The single player versions work as they always have. But multiplayer Mowing is a now a single persistent game shared by everyone around the globe!

How? Let's get into it.

## High Level

The zoomed out view is that Strange Leaflet runs one process for each of the multiplayer games: mowing wide and mowing narrow. The processes are part of the application stack and so start/stop along with the instance as a whole. On startup the game processes load the game state from a data store. As players play the game new state is both broadcast to all connected browsers and written to the data store.

Cool cool, now let's talk details.

## Details

Previously the multiplayer games worked similarly but each deployed Strange Leaflet instance ran its own independent multiplayer game. That's great in that each instance has a fast game local to the region, but I wanted a global game!

I'm using Tigris from fly.io for the data store and it's amazingly easy to work with. I'd already been using it for the previous implementation but only for the scoring for each region. There was no persistent game state so each time Strange Leaflet cold started in a region there'd be a new blank game.

Let's just consider Mowing as a single game and ignore the fact that there are wide/narrow versions. The changes are the same for both versions.

What did I need to do to transform multiplayer mowing into a global game?

- Run a single instance of Mowing for the entire world.
- Have all regions communicate with that instance for game state.
- Persist game state across application runs

## Running a single instance of the game

Ok a single instance! That means one process running the game. No problem!

My first thought was to use the Erlang `:global` process registry. That ships with Erlang (and thus with Elixir) and allows easily declaring that a process is globally registered across an application cluster. The problem there is that my fly.io setup does not have any persistent instances. I want the game process to be in my primary region (IAD) but it could well be that the IAD instance is stopped and someone on the west coast is visiting the site which would spin up an instance on the west coast data center. Then it would try and fail to find the globally registered game.

I didn't want to make my primary region persistent regardless of usage. I really like that fly allows applications to stop if they aren't being used. I wanted some way for non-primary regions to explicitly talk to the primary region which would spin it up if needed.

The solution: [fly_rpc_elixir](https://github.com/superfly/fly_rpc_elixir)! With Fly RPC my non-primary instances can indeed explicitly query the primary instance.

For example, here's a call to reveal a target square.

```elixir
Fly.RPC.rpc_primary({Mowing.Multi, :reveal, [@server, target]})
```

That will transform into this call on the primary: starting it up if needed.

```elixir
Mowing.Multi.reveal(@server, target)
```

Which will, in turn, communicate with the specific game server and return the updated game state.

All game state changes are not only returned to the individual caller but also published to the globally distributed Phoenix pub/sub which updates all connected games.

Great! Now I need to actually cluster my Strange Leaflet instances so they can talk to each other.

## Clustering Elixir application instances on fly.io

Super easy, barely an inconvenience!

No I'm not kidding at all: [Clustering your application](https://fly.io/docs/elixir/the-basics/clustering/)

The diff was essentially these changes

```iex
# Add a DNS cluster ENV
DNS_CLUSTER_QUERY = "strangeleaflet.internal"
```

```elixir
# Add a DNS cluster query to config
config :strange_leaflet, dns_cluster_query: System.get_env("DNS_CLUSTER_QUERY")
```

```elixir
# start up a DNSCluster process
{DNSCluster, query: Application.get_env(:strange_leaflet, :dns_cluster_query) || :ignore}
```

And hooray the instances all connect/disconnect automatically as they spin up and down.

## Persisting state

With Fly RPC and instance clustering I could now coordinate global games of mowing. Woo! The nice-to-have goal now was to persist game state between application boots.

This could be done via any persistent data store: SQLite, postgres, a blob store, even a file system as long as it was globally readable and locally writable.

I decided to keep using Tigris from fly.io: a super fast easy global blob store that presents the AWS storage API. I had already been using it to persist regional scores, now I just had to switch to persisting a global score and global game state.

I _could_ simply write the full game state as Elixir structs encoded as JSON or use `term_to_binary` to more directly serialize the full data. But that would be a big waste of space! We shouldn't need **kilobytes** to store the game state and scores.

My solution was to write a custom serializer that would represent the current game board as a string of ASCII. Storing that along with a `width` property in a JSON object and done! Mere bytes to store the game state.

Here `H` is an unrevealed square and `S` is a seed square.

e.g.

```json
{
  "pattern": "HSHHHHHHH",
  "width": 3
}
```

To decode that data back into a full game only means transforming that ASCII back into rows of the right width and setting up the game state.

When starting up the game servers decide to block on reading from Tigris because the stored game state is required. It's no good to present a blank game that would then overwrite the stored game state.

But when updating the game state the writes are non-blocking: the player interaction shouldn't have to wait for any specific state to be persisted. The state is already stored in the game server itself, the persistence is secondary.

## Putting it all together

When the application starts

- global game servers start: one for the wide game and one for the narrow game
- global game servers block on reading game state from Tigris

When a user browses to a game

- A LiveView server is started for the in their regional instance
- Their LiveView requests the current game state from the primary region
- Their LiveView subscribes to the game state changes topic in the global application pub/sub
- As they interact with the game their LiveView server makes RPC calls to the primary region's game server
- The game server returns the updated game state and broadcasts the new game state to the global application pub/sub

That means you can go to either multiplayer game now and _maybe_ watch people from around the world playing the same game. Depending on if anyone is connected.

```
┌─────────┐        ┌──────────────────┐
│         │        │     LiveView     │
│ Browser │◀──────▶│   (GenServer)    │◀──────────┬──────────────────────┐
│         │        │   Local Region   │           │              ┌───────┼──────────┐
└─────────┘        └──────────────────┘           │             ┌┴───────▼─────────┐│
                                                  │            ┌┴─────────────────┐││
                                                  │            │                  │││
┌─────────┐        ┌──────────────────┐           │            │ Phoenix Pub/Sub  │││
│         │        │     LiveView     │           │            │   Every Region   │││
│ Browser │◀──────▶│   (GenServer)    │◀──────────┤            │                  │├┘
│         │        │   Local Region   │           │            │                  ├┘
└─────────┘        └──────────────────┘           │            └──────────────────┘
                                                  │                      ▲
                                                  │                      │
┌─────────┐        ┌──────────────────┐           │                      │
│         │        │     LiveView     │           │                      │
│ Browser │◀──────▶│   (GenServer)    │◀──────────┤                      │
│         │        │   Local Region   │           │                      │
└─────────┘        └──────────────────┘           │                      ▼
                                                  │            ┌──────────────────┐
┌─────────┐        ┌──────────────────┐           │            │                  │
│         │        │     LiveView     │           │            │ Multiplayer Game │
│ Browser │◀──────▶│   (GenServer)    │◀──────────┴───────────▶│   (GenServer)    │
│         │        │   Local Region   │                        │  Primary Region  │
└─────────┘        └──────────────────┘                        │                  │
                                                               └──────────────────┘
                                                                         ▲
                                                                         │
                .─────────.                                              │
            _.─'           `──.                                          │
           ╱                   ╲                                         │
          ╱                     ╲                                        │
         ;        Tigris         :                  Scores and           │
         :    (Blob Storage)     ;◀─────────────────Game State───────────┘
          ╲                     ╱
           ╲                   ╱
            ╲                 ╱
             `──.         _.─'
                 `───────'
```

## Downsides?

Well latency for sure. The farther a connected user is from the primary region the slower their interaction with the game will be.

That also means we could have "conflicting" game changes from different users. They wouldn't actually conflict because the single game server would process each message in the order it was received. But some actions could be rendered pointless. For example user1 could click to reveal a square but an update from user2 to flag that same square is written first. That would mean user1 would click to reveal a flagged square, which does nothing.

# Alternative: why not coordinate via Tigris?

I _could_ have leaned on Tigris to maintain the global game state as data that would be read and written from each global game server. So why didn't I?

First off: I didn't want to depend on a specific data storage implementation to coordinate the global game. With my current approach storing state is a nice side effect; not the core responsibility of coordinating the global game state.

Second: I didn't know how well Tigris would handle concurrent writes. My gut says we'd have a solid chance of flipping between competing global game states. It would depend on how strictly Tigris supports read after write and how well I handled the interactions. Sounds complicated!

Third: Strange Leaflet is my hobby blog/site to play with Elixir and especially distributed Elixir, not to play with blob storage however awesome it might be.

Fourth: We'd still need to coordinate across regions so that games know when to pull new game state.