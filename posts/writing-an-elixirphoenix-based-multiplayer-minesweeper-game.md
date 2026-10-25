---
title: Writing an Elixir/Phoenix based multiplayer Minesweeper game
slug: writing-an-elixirphoenix-based-multiplayer-minesweeper-game
published_date: 2024-08-18T04:00:00+00:00
publish: true
discoverable: true
is_page: false
---

## Context?

Be me. Be looking for some first project to use to integrate LiveView-based apps and games into your blogging site, Strange Leaflet. Be inspired by the excellent [Mines vs Humanity](https://minesvshumanity.com/).

Let's make that kind of experience using Phoenix LiveView!

## First off, LiveView?

LiveView's entire deal is that it is a framework to create web applications that maintain a persistent connection from the backend to every individually connected browser. The views are "live" as opposed to "dead" views which simply return an HTTP response to the browser.

The connections are done via websockets and all of the mechanics of establishing the initial HTTP connection and then upgrading to a web socket are handled by the LiveView framework. LiveView also provides excellent ergonomics for handling user interaction with the backing server. LiveView also provides a templating system that seamlessly integrates with the backing server and handles automatically updating the frontend as data updates from the backend. LiveView also handles the mechanics of separating out the changable data from the template markup so that after the initial transfer of markup the only data sent over the websocket connection are the actual changes to the data fields.

Each user/browser has its own instance of the backing server handling its own unique experience. Shared experiences are possible but need something to hold the shared persistence. Phoenix provides a pubsub framework that can be nicely applied to this problem: allowing all liveviews to subscribe to topics and all react to broadcasted events.

## Minesweeper Engine

We need an engine to run minesweeper. There are many examples in essentially every language since Minesweeper is a classic game with a simple concept and some interesting edge cases.

I could certainly drop any Elixir minesweeper module into Strange Leaflet, but that's no fun. Instead over in my Livebooks I worked out the mechanics of the engine itself using Kino to allow user interaction once I was at the point where a user could interact.

[minesweeper.live.md (github.com)](https://github.com/sdball/livebooks/blob/main/examples/minesweeper.livemd)

The modules I have in Strange Leaflet are slightly modified to have a whole "Mowing" theme that I went with instead of the straight bombs/explosions of normal Minesweeper.

The code I worked out has a few squeaky hinges, e.g. the `Board` module arguably does more than the `Board` concept should because it has some rendering functions that don't return a `Board` struct back.

Generally a well-behaved Elixir module accepts its type as the first argument to its functions and returns the same type back e.g.

```iex
 > Map.put(%{xyzzy: "Fool"}, :plugh, "Fool")
%{xyzzy: "Fool", plugh: "Fool"}
```

The `Map.put/3` function accepted a `Map` as its first argument and returned a new `Map`.

The recursion to reveal all the empty connected squares when any one of them is revealed also has some efficiency complaints but for a few hundred squares that's no big deal.

Squeaky hinges aside, it works!

```elixir
# width, height, "mines"
Board.new(3, 4, 2)
|> Board.peek(:all)
|> Board.render()

1️⃣ 1️⃣ 1️⃣
1️⃣ 🌱 1️⃣
2️⃣ 2️⃣ 1️⃣
🌱 1️⃣ 🟩
```

One cool and mostly useless trick I worked out is that the number emojis are dynamically constructed check it out

```elixir
def unicode(%__MODULE__{contains: :empty, adjacent_mines: mines}) when mines > 0 do
  ["#{mines}", "️", "⃣"] |> List.to_string()
end
```

That third character doesn't render on its own but it's the unicode character that controls rendering a number emoji like this.

```elixir
["5", "️", "⃣"] |> List.to_string()
"5️⃣"
```

## What works exactly?

What does it mean to have a "working" Minesweeper engine?

For my purposes it means

- I can get a "board" with an arbitrary width, height, mine count, and other supporting data like a win/loss result
- The board is composed of another data structure that allows a few things
  - mine/empty
  - revealed/hidden/flagged
  - how many mines are adjacent
- The `Board` module has functions that accept a board, some arguments, and return a new transformed board. e.g. `Board.reveal(board, {3, 4})`
- The `Board` recognizes the transformation into a state that is a win (all mines are flagged) or a loss (a mine is revealed)

And as a want: I wanted flagging all mines to be the victory condition instead of revealing all squares. It does allow users to cheese the ending moves by dropping/removing flags until they find the right squares but that seems fair to me since random mine placement can generate boards that require luck to solve.

With those needs met I can drop the module straight into the `lib` directory of my Phoenix application running Strange Leaflet. All modules will then have access to call it without any need to have painful requirements like per-file imports/exports. Can you even imagine?

```javascript
import defaultExport from "module-name";
import * as name from "module-name";
import { export1 } from "module-name";
import { export1 as alias1 } from "module-name";
import { default as alias } from "module-name";
import { export1, export2 } from "module-name";
import { export1, export2 as alias2 /* … */ } from "module-name";
import { "string name" as alias } from "module-name";
import defaultExport, { export1 /* … */ } from "module-name";
import defaultExport, * as name from "module-name";
import "module-name";
```

And, as a functional language, that means each LiveView server (remember that's one per connected user) only needs to hold the data for its board and use the `Board` module functions for changes. And here we're only talking about solo-mode, not multiplayer yet.

Here's how a solo-mode LiveView server gets a new board in response to a user click:

```elixir
new_board =
  case socket.assigns.action do
    :reveal -> Board.reveal(socket.assigns.board, target)
    :flag -> Board.toggle_flag(socket.assigns.board, target)
  end
```

The `socket.assigns.action` is the currently selected action of the user playing the game and of course `socket.assigns.board` is the current state of their board. That function proceeds to change their `socket` to have the new board assigned. Then LiveView takes over and notes the change to their board data and it handles updating affected DOM elements.

## Let's catch up a bit I'm losing the thread

Ok so we have Strange Leaflet, a Phoenix web application. A Phoenix web application can have any number of LiveViews which are mounted to specific routes like so

```elixir
live "/games/mowing-narrow", MowingNarrowSoloLive
```

When a browser visits that route, Phoenix connects to the `MowingNarrowSoloLive` module and gets a static rendering of HTML markup, a `socket` with initial data, and instructions about how to update the markup if any data in the `socket` changes.

The data updates are all handled by the framework itself: application devs only need to change the `socket.assigns` and anywhere in the template using the data is updated. Each browser connection to a liveview has its own `socket` which holds all the state needed by the template in order to render.

So in our case for "Mowing" the initial server render creates a new Board with specific default values. Then the connection is upgraded to a websocket and now that browser is paired with its own LiveView server ready to react to events or send updated data based on server events.

A key user generated event to consider is a click on a game square:

```elixir
<%= for {row, row_index} <- Enum.with_index(chunked_board(@board)) do %>
  <div class="flex space-x-1">
    <%= for {square, col_index} <- Enum.with_index(row) do %>
      <div
        phx-click="target"
        phx-value-pos={"#{row_index},#{col_index}"}
        class="cell cursor-crosshair"
      >
        <%= Square.unicode(square) %>
      </div>
    <% end %>
  </div>
<% end %>
```

That `phx-click="target"` and `phx-value-pos={"#{row_index},#{col_index}"}` mean that when the user clicks on a square a `"target"` event is sent to the backing server along with the row,col coordinates.

The server has a function declared to handle that event

```elixir
def handle_event("target", %{"pos" => pos}, socket) do
  .
  .
  .
```

Essentially that function parses the given `pos` value and calls to some function in `Board` with the current game board and target and receives a new game board. The returned game board might be exactly the same, e.g. the user clicked on a flagged or revealed square, but it doesn't matter. The newly returned board is simply assigned to the `socket` and if there are any rendering changes necessary then the framework does them.

## Making it multiplayer

Like Mines vs Humanity multiplayer means that all users connected to the application are playing the _same_ game. They'll still each have their own liveview servers and connections, but they need to all be manipulating and receiving updates to and from a common game board. How can we do that?

Well there are many options, but one go-to approach is that we can run another server to hold the game state separate from the liveview connections.

For that I've made a `GenServer` (generic server: an OTP framework option older than Elixir itself) for each of the games (one narrow, one wide) that are started along with the other Strange Leaflet components. The servers have initial game state that exists before anyone even connects to a multiplayer game. Waiting for messages they can react to.

The `GenServer` servers for the multiplayer games provide an API that wraps the `Board` calls that the solo games call directly. When called they update their game state that persists outside of all the liveview connections. Additionally when their game state changes they broadcast out a message on a Phoenix pubsub topic.

The LiveView servers for the multiplayer games don't setup their own board when they initialize. Instead they ask their corresponding server for the current board. They also subscribe to the Phoenix pubsub topic so they're notified when changes happen due to events made by other users or the system itself. When events come in the handling code simply has to update `socket.assigns` and the liveview framework code handles updating the frontend.

Here's an example timeline

- StrangeLeaflet starts
- Alongside the other application lifecycle components two game servers are started
  - one narrow
  - one wide
- The two multiplayer game servers then simply wait for messages
- User A connects to Mowing (narrow, multiplayer)
- A LiveView server is created for User A (call it LV_A)
- LV_A calls to the narrow multiplayer server (call it MULTI) and asks it for the current state
- MULTI answers with the current state
- User A clicks to reveal a square
- The browser websocket connection sends the click event to LV_A
- LV_A handles the event by calling MULTI's reveal API function with the targeted position
- MULTI calls `Board.reveal` with its board and the user's targeted square.
- The pure `Board` module function returns a transformed board
- MULTI broadcasts a new game state to the game topic
- MULTI responds to the call with the new game state
- LV_A reacts to the response by updating its `socket.assigns`
- The LiveView framework reacts to the change by updating the relevant parts of the template being looked at by User A
- User B connects to Mowing (narrow, multiplayer)
- A LiveView server is created for User B (call it LV_B)
- LV_B calls to the narrow multiplayer server (call it MULTI) and asks it for the current state
- MULTI answers with the current state (a game that has been clicked by User A)
- User B clicks to reveal a square
- (The click handling proceeds)
  - LV_B updates in response to the click response
  - LV_A updates in response to the broadcasted event

You might notice that the liveviews could update twice for the same click: they'll update from the server response AND from the broadcast event. I could avoid this by solely depending on the broadcast event and only returning some "message acknowledged" response to the call itself. Mark it down for future polish.

## Conflicts?

What happens if users click at the same time? Nothing because there's no such thing as the same time.

I don't mean that pedantically. In Erlang/Elixir all processes have a mailbox and the multiplayer servers are no different. Process mailboxes are an ordered queue. Each message is handled in the order that it arrived. Each message is a functional transformation to the GenServer state (i.e. there's NO shared memory that might be corrupted by parallel editing). Even if users A and B click at the same nanosecond then one of the messages will be written to the mailbox first and will be processed first followed almost immediately by processing the other message.

If the events "conflict" they'll be as though the second event was made against the state that resulted from the first click. e.g. clicking to reveal a square that was flagged by an earlier message will have no effect because in my game rules you can't reveal a flagged square.

## Regions?

I could certainly coordinate a global game across all regions, but that would mean the one game would require communicating with a node that might be on the other side of the world. Not really ideal for a responsive experience.

Instead I've opted to make the multiplayer Strange Leaflet games regional where you are playing a game shared with whoever else from your geographical region as determined by fly.io.

## Persistance?

While the games are regional, the scores are tallied and persisted globally. Each regional multiplayer win/loss is aggregated using [Tigris Global Object Storage](https://fly.io/docs/reference/tigris/) from fly.io.

The persistance isn't robust like in Mines vs Humanity which records all moves and games, but keeping a global score is enough for me.

The active games only persist as long as the server is running. And because I'm not paying fly.io to keep my instances running 24/7 regardless of connected users that means the servers will spin up and down as users come and go. Any active games will simply be lost.

## Summary

Phoenix LiveView makes creating interactive user experiences robust and easy. Phoenix pubsub makes coordinating a shared experience robust and easy. Phoenix and Elixir make creating code that's fun to write. If you haven't tried out Elixir yet maybe start with my [introductory Livebook](https://github.com/sdball/livebooks/blob/main/books/strange-leaflet-about-elixir/page1.livemd) or [corresponding blog series](https://www.strangeleaflet.com/blog/strange-leaflet-about-elixir-page1)?

---

## Followup! Actual multiplayer

There's a followup post where I did go ahead and make the a single global game for each mode (narrow and wide): [A Global Elixir Phoenix Multiplayer Game](/a-global-elixir-phoenix-multiplayer-game/)
