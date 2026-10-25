---
title: Add MobInTheMiddleServer - sdball/protohackers
slug: add-mobinthemiddleserver
published_date: 2023-01-14T05:15:00+00:00
tags: elixir, git blog, protohackers
publish: true
---

Protohackers problem 5: https://protohackers.com/problem/5

Ahh an actual machine-in-the-middle attack! And performed against our own chat server from problem 3. That's cool!

The approach here is very straightforward now that I've learned how to use active sockets.

Get a connection from a client, open a connection to the chat server, and then whenever a message comes in from one side rewrite it and send it to the other side.

Getting the regex right at the edges was more difficult than the networking portion of this challenge. I resorted to cheating because even I, a former Perl programmer, could not construct a regex that I was happy with that also handled all the edges. So I gave up trying to find the one regex and simply split all the messages by spaces, then applied a simple regex against each word, then rejoined all the words by spaces again. I'm not trimming any spaces so all whitespaces are preserved. For sure more computationally expensive than a compiled regex could be, but we're only talking chat messages here with maybe a few dozen words at the most.

Another interesting aspect to this problem in this Elixir application is that I'm really using the configuration now. By default the MobInTheMiddleServer is configured to connect to localhost. In prod the application is configured to connect to the defined problem server.

This blog post was generated from commit [3a6133732d42a1eefeb548acf0317083ae6a501e on sdball/protohackers](https://github.com/sdball/protohackers/commit/3a6133732d42a1eefeb548acf0317083ae6a501e)

## added files

### lib/protohackers/mob_in_the_middle_server.ex

```elixir
defmodule Protohackers.MobInTheMiddleServer do
  use GenServer

  require Logger

  @boguscoin ~r/^7[a-zA-Z0-9]{25,34}$/

  def start_link(port \\ 11240) do
    GenServer.start_link(__MODULE__, port)
  end

  defstruct [:listen_socket, :supervisor]

  @impl true
  def init(port) do
    {:ok, supervisor} = Task.Supervisor.start_link(max_children: 100)

    listen_options = [
      # receive data as binaries (instead of lists)
      mode: :binary,
      # receive incoming packets as messages
      active: true,
      # allow reusing the address if the listener crashes
      reuseaddr: true,
      # keep the peer socket open after the client closes its writes
      exit_on_close: false,
      # automatically split inputs by newline
      packet: :line,
      # increase default buffer to 10KB
      buffer: 1024 * 10
    ]

    with {:ok, listen_socket} <- :gen_tcp.listen(port, listen_options) do
      Logger.info("Starting MobRoomServer on port #{port}")

      state = %__MODULE__{
        listen_socket: listen_socket,
        supervisor: supervisor
      }

      {:ok, state, {:continue, :accept}}
    else
      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_continue(:accept, %__MODULE__{} = state) do
    with {:ok, socket} <- :gen_tcp.accept(state.listen_socket),
         {:ok, task_pid} <-
           Task.Supervisor.start_child(state.supervisor, fn ->
             handle_connection(socket)
           end) do
      :gen_tcp.controlling_process(socket, task_pid)
      {:noreply, state, {:continue, :accept}}
    else
      {:error, reason} ->
        Logger.error("[MobRoomServer] Unable to accept connection #{inspect(reason)}")
        {:stop, reason, state}
    end
  end

  def handle_connection(client) do
    upstream_server = Application.get_env(:protohackers, __MODULE__)

    {:ok, upstream} =
      :gen_tcp.connect(
        upstream_server[:host],
        upstream_server[:port],
        [:binary, active: true]
      )

    handle_messages(client, upstream)

    :gen_tcp.close(upstream)
    :gen_tcp.close(client)
  end

  def handle_messages(client, upstream) do
    receive do
      {:tcp, ^client, message} ->
        rewritten = rewrite(message)
        :gen_tcp.send(upstream, rewritten)
        handle_messages(client, upstream)

      {:tcp, ^upstream, message} ->
        rewritten = rewrite(message)
        :gen_tcp.send(client, rewritten)
        handle_messages(client, upstream)

      {:tcp_closed, ^client} ->
        Logger.info("[MOB] client disconnected")
        :ok

      {:tcp_closed, ^upstream} ->
        Logger.info("[MOB] upstream disconnected")
        :ok
    end
  end

  def rewrite(message) do
    message
    |> String.split(" ")
    |> Enum.map(& Regex.replace(@boguscoin, &1, "7YWHMfk9JZe0LM0g1ZauHuiSxhI"))
    |> Enum.join(" ")
  end
end
```

### test/protohackers/mob_in_the_middle_server_test.exs

```elixir
defmodule Protohackers.MobInTheMiddleServerTest do
  alias Protohackers.MobInTheMiddleServer

  use ExUnit.Case

  describe "chat server acts normally to clients" do
    test "connecting users are prompted for a name" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      {:ok, response} = :gen_tcp.recv(socket, 0)
      assert String.contains?(response, "name")
    end

    test "users can connect with an accepted name" do
      user = "stephen"
      {:ok, socket} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      {:ok, _response} = :gen_tcp.recv(socket, 0)
      :ok = :gen_tcp.send(socket, "#{user}\n")
      {:ok, response} = :gen_tcp.recv(socket, 0)
      assert String.starts_with?(response, "*")
      assert String.contains?(response, "joined the room")
    end

    test "users are shown the existing members of the room not including their user" do
      user1 = "stephen"
      {:ok, socket1} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      {:ok, _response} = :gen_tcp.recv(socket1, 0)
      :ok = :gen_tcp.send(socket1, "#{user1}\n")
      {:ok, response} = :gen_tcp.recv(socket1, 0)
      assert String.starts_with?(response, "*")
      assert String.contains?(response, "joined the room")
      assert !String.contains?(response, user1)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      {:ok, _response} = :gen_tcp.recv(socket2, 0)
      :ok = :gen_tcp.send(socket2, "#{user2}\n")
      {:ok, response} = :gen_tcp.recv(socket2, 0)
      assert String.starts_with?(response, "*")
      assert String.contains?(response, "joined the room")
      assert String.contains?(response, user1)
      assert !String.contains?(response, user2)
    end

    test "already joined users in the room are sent a notice for new users" do
      user1 = "stephen"
      {:ok, socket1} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket2, 0, 300)
      :gen_tcp.send(socket2, "#{user2}\n")
      :gen_tcp.recv(socket2, 0, 300)

      {:ok, message} = :gen_tcp.recv(socket1, 0, 300)
      assert message == "* #{user2} joined\n"

      # no corresponding message on user2's session
      {:error, :timeout} = :gen_tcp.recv(socket2, 0, 300)

      :gen_tcp.close(socket1)
      :gen_tcp.close(socket2)
    end

    test "users joining a room with existing users are shown the existing users" do
      user1 = "stephen"
      {:ok, socket1} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket2, 0, 300)
      :gen_tcp.send(socket2, "#{user2}\n")
      {:ok, join_response} = :gen_tcp.recv(socket2, 0, 300)
      assert join_response == "* You have joined the room with: #{user1}\n"

      :gen_tcp.close(socket1)
      :gen_tcp.close(socket2)
    end

    test "users can chat" do
      user1 = "stephen"
      {:ok, socket1} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket2, 0, 300)
      :gen_tcp.send(socket2, "#{user2}\n")
      :gen_tcp.recv(socket2, 0, 300)

      {:ok, _joined_message} = :gen_tcp.recv(socket1, 0, 300)

      # chat begins

      # message from user1
      :ok = :gen_tcp.send(socket1, "I think the MCP is getting out of hand\n")

      # appears for user2
      {:ok, received} = :gen_tcp.recv(socket2, 0, 300)
      assert received == "[#{user1}] I think the MCP is getting out of hand\n"

      # and not for user1
      {:error, :timeout} = :gen_tcp.recv(socket1, 0, 300)

      # message from user2
      message = "Don't worry, TRON will run independently. And watchdog the MCP as well.\n"
      :ok = :gen_tcp.send(socket2, message)

      # appears for user1
      {:ok, received} = :gen_tcp.recv(socket1, 0, 300)
      assert received == "[#{user2}] #{message}"

      # and not for user2
      {:error, :timeout} = :gen_tcp.recv(socket2, 0, 300)

      :gen_tcp.close(socket1)
      :gen_tcp.close(socket2)
    end

    test "when a user leaves other users are notified" do
      user1 = "stephen"
      {:ok, socket1} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
      :gen_tcp.recv(socket2, 0, 300)
      :gen_tcp.send(socket2, "#{user2}\n")
      :gen_tcp.recv(socket2, 0, 300)

      {:ok, message} = :gen_tcp.recv(socket1, 0, 300)
      assert message == "* #{user2} joined\n"

      :gen_tcp.close(socket2)

      {:ok, message} = :gen_tcp.recv(socket1, 0, 300)
      assert message == "* #{user2} left\n"
    end
  end

  describe "mitm attack works to rewrite BogusCoin addresses" do
    user1 = "stephen"
    {:ok, socket1} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
    :gen_tcp.recv(socket1, 0, 300)
    :gen_tcp.send(socket1, "#{user1}\n")
    :gen_tcp.recv(socket1, 0, 300)

    user2 = "alanone"
    {:ok, socket2} = :gen_tcp.connect('localhost', 11240, [:binary, active: false])
    :gen_tcp.recv(socket2, 0, 300)
    :gen_tcp.send(socket2, "#{user2}\n")
    :gen_tcp.recv(socket2, 0, 300)

    # ignore joining message
    :gen_tcp.recv(socket1, 0, 300)

    :ok = :gen_tcp.send(socket1, "my bogus coin address is 7LOrwbDlS8NujgjddyogWgIM93MV5N2VR\n")
    {:ok, message} = :gen_tcp.recv(socket2, 0, 300)
    assert message == "[stephen] my bogus coin address is 7YWHMfk9JZe0LM0g1ZauHuiSxhI\n"

    :ok = :gen_tcp.send(socket2, "7iKDZEwPZSqIvDnHvVN2r0hUWXD5rHX is my bogus coin address\n")
    {:ok, message} = :gen_tcp.recv(socket1, 0, 300)
    assert message == "[alanone] 7YWHMfk9JZe0LM0g1ZauHuiSxhI is my bogus coin address\n"
  end

  describe "unit test rewriting rules" do
    test "multiple addresses in the message" do
      message =
        "you can also use one of these 7iKDZEwPZSqIvDnHvVN2r0hUWXD5rHX 7adNeSwJkMakpEcln9HEtthSRtxdmEHOT8T\n"

      rewrite = MobInTheMiddleServer.rewrite(message)

      assert rewrite ==
               "you can also use one of these 7YWHMfk9JZe0LM0g1ZauHuiSxhI 7YWHMfk9JZe0LM0g1ZauHuiSxhI\n"
    end

    test "more addresses" do
      message = "you can also use one of these 7Ecmqn1BG3AawAPrRnVeMnKXo0 7iKDZEwPZSqIvDnHvVN2r0hUWXD5rHX 7adNeSwJkMakpEcln9HEtthSRtxdmEHOT8T\n"
      rewrite = MobInTheMiddleServer.rewrite(message)

      assert rewrite ==
               "you can also use one of these 7YWHMfk9JZe0LM0g1ZauHuiSxhI 7YWHMfk9JZe0LM0g1ZauHuiSxhI 7YWHMfk9JZe0LM0g1ZauHuiSxhI\n"
    end

    test "too long" do
      message = "This is too long: 7uyjtPxfsxQoufTKlKPFsaaGT6YLryGf0a06\n"
      rewrite = MobInTheMiddleServer.rewrite(message)
      assert rewrite == message
    end

    test "product id not boguscoin" do
      message = "This is a product ID, not a Boguscoin: 7RodDSA6lw2RDq9PUfEgd4NHjH6Eeov-JPtlB5DZzSYE1jtPImEBRMT3byDUiKH-1234\n"
      rewrite = MobInTheMiddleServer.rewrite(message)
      assert rewrite == message
    end
  end
end
```

## modified files

### config/config.exs

```diff
diff --git a/config/config.exs b/config/config.exs
index 9f6f206..20a123e 100644
--- a/config/config.exs
+++ b/config/config.exs
@@ -1,3 +1,7 @@
 import Config

+config :protohackers, Protohackers.MobInTheMiddleServer,
+  host: ~c(localhost),
+  port: 11238
+
 import_config "#{config_env()}.exs"
```

### config/prod.exs

```diff
diff --git a/config/prod.exs b/config/prod.exs
index 1c00233..2e8569f 100644
--- a/config/prod.exs
+++ b/config/prod.exs
@@ -1 +1,5 @@
-import Config
+import Config
+
+config :protohackers, Protohackers.MobInTheMiddleServer,
+  host: ~c(chat.protohackers.com),
+  port: 16963
```

### fly.toml

```diff
diff --git a/fly.toml b/fly.toml
index 2336f47..60cce3a 100644
--- a/fly.toml
+++ b/fly.toml
@@ -111,3 +111,25 @@ auto_rollback = true
   [[services.ports]]
   handlers = []
   port = "11239"
+
+[[services]]
+  http_checks = []
+  internal_port = 11240
+  processes = ["app"]
+  protocol = "tcp"
+  script_checks = []
+
+  [[services.ports]]
+  handlers = []
+  port = "11240"
+
+  [services.concurrency]
+  hard_limit = 25
+  soft_limit = 20
+  type = "connections"
+
+  [[services.tcp_checks]]
+  grace_period = "15s"
+  interval = "30s"
+  restart_limit = 0
+  timeout = "2s"
```

### lib/protohackers/application.ex

```diff
diff --git a/lib/protohackers/application.ex b/lib/protohackers/application.ex
index bbe0391..8f6a667 100644
--- a/lib/protohackers/application.ex
+++ b/lib/protohackers/application.ex
@@ -10,7 +10,8 @@ defmodule Protohackers.Application do
       {Protohackers.IsPrimeServer, 11236},
       {Protohackers.AssetPriceServer, 11237},
       {Protohackers.ChatRoomServer, 11238},
-      {Protohackers.UnusualDatabaseProtocolServer, 11239}
+      {Protohackers.UnusualDatabaseProtocolServer, 11239},
+      {Protohackers.MobInTheMiddleServer, 11240}
     ]

     opts = [strategy: :one_for_one, name: Protohackers.Supervisor]
```
