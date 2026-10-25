---
title: Rewrite ChatRoomServer to use active sockets - sdball/protohackers
slug: rewrite-chat-room-server-to-use-active-sockets
published_date: 2023-01-13T02:52:00+00:00
tags: elixir, git blog, protohackers
publish: true
discoverable: true
is_page: false
---

Thanks to [@whatyouhide](https://github.com/whatyouhide) for the insightful feedback pointing me in a better direction!

The main effect of this change is to make the the input loop for a connected user much more efficient.

As a quick ballpark my integration tests for the ChatRoomServer previously took 2.2 seconds. On this new version they take 1.8 seconds.

Not a huge change to the clock but a significant improvement when you think about the effects over time. The new active code is more readable as well!

What changed?

My previous approach for the input loop was to bounce between `:gen_tcp.receive` (for incoming chat messages) and `receive` (for dispatched server messages). Both of those calls block and I didn't want any clients to be blocked waiting for messages. So each side of the loop had a short timeout of 100ms.

The loop:

- Try to receive a new TCP packet for 100ms
  - Got a packet? handle it as input
  - Timed out? Try to receive an Elixir message for 100ms
    - Got a message? handle it and restart the loop
    - Timed out? restart the loop

Now I've switched the TCP socket connections from using `active: false` to `active: true`. That change means that TCP packets will be sent to the socket controlling process as Elixir messages. THAT means no more bouncing between two kinds of incoming data. Everything is now an Elixir message and they can all be processed in one receive block as they arrive. Nice!

A key function I had to find to make this work is `:gen_tcp.controlling_process/2`. That function allows a process that has accepted a TCP connection to hand off control to another process. And control means that the new process will receive all the messages for an active connection. Even queued messages for that socket that are in the original processes mailbox will be migrated to the new process.

Very cool!

This blog post was generated from Git commit [83d2c6a8de9668f9b400777b1a67c7c5bf9e100f on sdball/protohackers](https://github.com/sdball/protohackers/commit/83d2c6a8de9668f9b400777b1a67c7c5bf9e100f)

## modified files

### lib/protohackers/chat_room_server.ex

```diff
diff --git a/lib/protohackers/chat_room_server.ex b/lib/protohackers/chat_room_server.ex
index 42ff2ff..26b1e74 100644
--- a/lib/protohackers/chat_room_server.ex
+++ b/lib/protohackers/chat_room_server.ex
@@ -104,9 +104,8 @@ defmodule Protohackers.ChatRoomServer do
     listen_options = [
       # receive data as binaries (instead of lists)
       mode: :binary,
-      # explicitly retrieve packets by calling `:gen_tcp.recv/2`
-      # (by default incoming packets would be sent as messages)
-      active: false,
+      # receive incoming packets as messages
+      active: true,
       # allow reusing the address if the listener crashes
       reuseaddr: true,
       # keep the peer socket open after the client closes its writes
@@ -134,14 +133,14 @@ defmodule Protohackers.ChatRoomServer do

   @impl true
   def handle_continue(:accept, %__MODULE__{} = state) do
-    case :gen_tcp.accept(state.listen_socket) do
-      {:ok, socket} ->
-        Task.Supervisor.start_child(state.supervisor, fn ->
-          handle_connection(socket)
-        end)
-
-        {:noreply, state, {:continue, :accept}}
-
+    with {:ok, socket} <- :gen_tcp.accept(state.listen_socket),
+         {:ok, task_pid} <-
+           Task.Supervisor.start_child(state.supervisor, fn ->
+             handle_connection(socket)
+           end) do
+      :gen_tcp.controlling_process(socket, task_pid)
+      {:noreply, state, {:continue, :accept}}
+    else
       {:error, reason} ->
         Logger.error("[ChatRoomServer] Unable to accept connection #{inspect(reason)}")
         {:stop, reason, state}
@@ -200,6 +199,9 @@ defmodule Protohackers.ChatRoomServer do
       {:error, :unprintable} ->
         chat_room(socket, username)

+      {:halt, :user_left} ->
+        :ok
+
       error ->
         error
     end
@@ -264,6 +266,9 @@ defmodule Protohackers.ChatRoomServer do
       {:error, :closed} ->
         :ok

+      {:halt, :user_left} ->
+        :ok
+
       {:error, reason} ->
         Logger.error("[ChatRoomServer] failed to join #{inspect(reason)}")
     end
@@ -293,33 +298,32 @@ defmodule Protohackers.ChatRoomServer do
   end

   def receive_input(socket) do
-    with {:ok, input} <- :gen_tcp.recv(socket, 0, 100),
-         true <- String.printable?(input) do
-      {:ok, String.replace(input, ~r|\s*$|, "")}
-    else
-      false ->
-        {:error, :unprintable}
-
-      {:error, :timeout} ->
-        receive do
-          {:broadcast_user_left, username} ->
-            :gen_tcp.send(socket, "* #{username} left\n")
-            receive_input(socket)
-
-          {:broadcast_user_joined, username} ->
-            :gen_tcp.send(socket, "* #{username} joined\n")
-            receive_input(socket)
-
-          {:user_message, username, message} ->
-            :gen_tcp.send(socket, "[#{username}] #{message}\n")
-            receive_input(socket)
-        after
-          100 ->
-            receive_input(socket)
+    receive do
+      {:tcp, _from, input} ->
+        if String.printable?(input) do
+          {:ok, String.replace(input, ~r|\s*$|, "")}
+        else
+          {:error, :unprintable}
         end

-      error ->
-        error
+      {:broadcast_user_left, username} ->
+        :gen_tcp.send(socket, "* #{username} left\n")
+        receive_input(socket)
+
+      {:broadcast_user_joined, username} ->
+        :gen_tcp.send(socket, "* #{username} joined\n")
+        receive_input(socket)
+
+      {:user_message, username, message} ->
+        :gen_tcp.send(socket, "[#{username}] #{message}\n")
+        receive_input(socket)
+
+      {:tcp_closed, _from} ->
+        {:halt, :user_left}
+
+      other ->
+        Logger.info("[ChatRoomServer] unexpected message #{inspect(other)}")
+        receive_input(socket)
     end
   end
 end
```
