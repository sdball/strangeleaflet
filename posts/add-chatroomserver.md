---
title: Add ChatRoomServer - sdball/protohackers
slug: add-chatroomserver
published_date: 2023-01-09T01:53:00+00:00
tags: elixir, git blog, protohackers
publish: true
discoverable: true
is_page: false
---

https://protohackers.com/problem/3

Protohackers problem 3 was a fun one!

I opted to use
[Elixir's Registry](https://hexdocs.pm/elixir/1.14.2/Registry.html)
to hold the state of joined users. That means I was able to use
Elixir process messages to send server and chat messages directly to
each connected client process. Each client process was then simply
responsible for delivering its own messages to its own connected
socket.

The way I used the Registry also means I'm just a little ways away
from supporting chat rooms. Right now all clients connect to a
hardcoded "general" room. But with a few tweaks users could join and
leave rooms while staying connected to the server itself.

One interesting piece is how I'm handling the chat input loop in
`receive_input/1`. While a user is joined their process is constantly
looping between reciving incoming chat messages from their TCP socket
and receving Elixir process messages with 100ms timeout on each. If
we get a TCP message: send it as a chat message and loop. If we get a
process message: send it to their socket and loop.

This blog post was generated from commit [bdcfbfc369296f1bd29ec39dae89d708e003e41f on sdball/protohackers](https://github.com/sdball/protohackers/commit/bdcfbfc369296f1bd29ec39dae89d708e003e41f)

## added files

### lib/protohackers/chat_room_server.ex

```elixir
defmodule Protohackers.ChatRoomServer do
  @moduledoc """
  TCP-based chat room server implementation

  Each message is a single line of ASCII text terminated by a newline character
  ('\n', or ASCII 10).

  Clients can send multiple messages per connection.

  All messages are raw ASCII text, not wrapped up in JSON or any other format.

  ## Joining the chat as a new user

  When a client connects to the server, it does not yet have a name and is not
  considered to have joined.

  The server will prompt the user by sending a single message asking for a name.

      Welcome to C.H.A.T. What name would you like?

  The first message from a client sets the user's name, which must contain
  at least 1 character, and must consist entirely of alphanumeric characters
  (uppercase, lowercase, and digits).

  Once the user has a name, they have joined the chat room and the server will
  announce their presence to other users.

  The server will send the new user a message that lists all present users'
  names, not including the new user, and not including any users who have
  already left. The wording of this message may vary but will lead with an
  asterisk `*` character.

      * The chat room: susan, mark, dave, amy

  The room list will be sent even if the room is empty.

  All subsequent messages from the server will be chat messages originating from
  other connected users.

  ## Chat messages

  After the naming/joining process is complete when a client sends a message to
  the server it will be a chat message.

  The server will relay chat messages to all other connected clients in the
  following format:

      [name] message

  The message sender will NOT get an echoed copy of their own message.

  ## Notification of new user joins

  When a user joins the chat room all other joined users will receive a message
  from the server informing them a new user has joined.

  The new user joined message wording will vary but will lead with an asterisk
  `*` character and contain the user's name.

      * alice has joined the room

  ## Notification of joined user departures

  When a joined user is disconnected for any reason other joined users will be
  notified of their departure.

  The user left message wording will vary but will lead with an asterisk `*`
  character and contain the user's name.

      * alice has left the room
  """

  use GenServer

  require Logger

  def start_link(port \\ 11238) do
    GenServer.start_link(__MODULE__, port)
  end

  defstruct [:listen_socket, :supervisor]

  @impl true
  def init(port) do
    {:ok, supervisor} = Task.Supervisor.start_link(max_children: 100)

    {:ok, _pid} =
      Registry.start_link(
        keys: :duplicate,
        name: Registry.ChatRoom,
        partitions: System.schedulers_online()
      )

    listen_options = [
      # receive data as binaries (instead of lists)
      mode: :binary,
      # explicitly retrieve packets by calling `:gen_tcp.recv/2`
      # (by default incoming packets would be sent as messages)
      active: false,
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
      Logger.info("Starting ChatRoomServer on port #{port}")

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
    case :gen_tcp.accept(state.listen_socket) do
      {:ok, socket} ->
        Task.Supervisor.start_child(state.supervisor, fn ->
          handle_connection(socket)
        end)

        {:noreply, state, {:continue, :accept}}

      {:error, reason} ->
        Logger.error("[ChatRoomServer] Unable to accept connection #{inspect(reason)}")
        {:stop, reason, state}
    end
  end

  # -- core ------------------------------------------------------------------
  def broadcast_user_joined(username) do
    Registry.dispatch(Registry.ChatRoom, "general", fn users ->
      users
      |> Enum.reject(fn {_pid, name} ->
        name == username
      end)
      |> Enum.each(fn {pid, _name} ->
        send(pid, {:broadcast_user_joined, username})
      end)
    end)

    Logger.info("#{username} joined")
  end

  def list_previously_joined_users(socket, username) do
    other_users =
      Registry.lookup(Registry.ChatRoom, "general")
      |> Enum.map(&elem(&1, 1))
      |> Enum.reject(&(&1 == username))
      |> Enum.sort()
      |> Enum.join(", ")

    if other_users == "" do
      :gen_tcp.send(socket, "* You have joined the room\n")
    else
      :gen_tcp.send(socket, "* You have joined the room with: #{other_users}\n")
    end
  end

  def broadcast_user_left(username) do
    Registry.dispatch(Registry.ChatRoom, "general", fn users ->
      users
      |> Enum.reject(fn {_pid, name} ->
        name == username
      end)
      |> Enum.each(fn {pid, _name} ->
        send(pid, {:broadcast_user_left, username})
      end)
    end)

    Logger.info("#{username} left")
  end

  def chat_room(socket, username) do
    with {:ok, message} <- receive_input(socket) do
      user_message(username, message)
      chat_room(socket, username)
    else
      {:error, :unprintable} ->
        chat_room(socket, username)

      error ->
        error
    end
  end

  def user_message(username, message) do
    Registry.dispatch(Registry.ChatRoom, "general", fn users ->
      users
      |> Enum.reject(fn {_pid, name} ->
        name == username
      end)
      |> Enum.each(fn {pid, _name} ->
        send(pid, {:user_message, username, message})
      end)
    end)
  end

  def check_name(name) do
    with {:ok, name} <- check_name_format(name),
         {:ok, name} <- check_available_name(name) do
      {:ok, name}
    else
      error ->
        error
    end
  end

  def check_name_format(name) when byte_size(name) > 0 and byte_size(name) < 30 do
    if Regex.match?(~r|^[a-zA-Z0-9]+$|, name) do
      {:ok, name}
    else
      {:error, :rejected_name}
    end
  end

  def check_name_format(_name), do: {:error, :rejected_name}

  def check_available_name(name) do
    Registry.lookup(Registry.ChatRoom, "general")
    |> Enum.map(&elem(&1, 1))
    |> Enum.into(MapSet.new())
    |> MapSet.member?(name)
    |> case do
      true ->
        {:error, :name_already_taken}

      false ->
        {:ok, name}
    end
  end

  # -- server ----------------------------------------------------------------

  def handle_connection(socket) do
    case join_chat(socket) do
      {:ok, username} ->
        broadcast_user_joined(username)
        list_previously_joined_users(socket, username)
        chat_room(socket, username)
        broadcast_user_left(username)

      {:error, reason} ->
        Logger.error("[ChatRoomServer] failed to join #{inspect(reason)}")
    end

    :gen_tcp.close(socket)
  end

  def join_chat(socket) do
    :gen_tcp.send(socket, "Welcome! What name would you like?\n")

    with {:ok, name} <- receive_input(socket),
         {:ok, name} <- check_name(name),
         {:ok, _pid} <- Registry.register(Registry.ChatRoom, "general", name) do
      {:ok, name}
    else
      {:error, reason = :rejected_name} ->
        :gen_tcp.send(socket, "Sorry that is an rejected name\n")
        {:error, reason}

      {:error, reason = :name_already_taken} ->
        :gen_tcp.send(socket, "Sorry that name is already taken\n")
        {:error, reason}

      error ->
        error
    end
  end

  def receive_input(socket) do
    with {:ok, input} <- :gen_tcp.recv(socket, 0, 100),
         true <- String.printable?(input) do
      {:ok, String.replace(input, ~r|\s*$|, "")}
    else
      false ->
        {:error, :unprintable}

      {:error, :timeout} ->
        receive do
          {:broadcast_user_left, username} ->
            :gen_tcp.send(socket, "* #{username} left\n")
            receive_input(socket)

          {:broadcast_user_joined, username} ->
            :gen_tcp.send(socket, "* #{username} joined\n")
            receive_input(socket)

          {:user_message, username, message} ->
            :gen_tcp.send(socket, "[#{username}] #{message}\n")
            receive_input(socket)
        after
          100 ->
            receive_input(socket)
        end

      error ->
        error
    end
  end
end
```

### test/protohackers/chat_room_server_test.exs

```elixir
defmodule Protohackers.ChatRoomServerTest do
  alias Protohackers.ChatRoomServer
  use ExUnit.Case

  describe "integration" do
    test "connecting users are prompted for a name" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      {:ok, response} = :gen_tcp.recv(socket, 0)
      assert String.contains?(response, "name")
    end

    test "users can connect with an accepted name" do
      user = "stephen"
      {:ok, socket} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      {:ok, _response} = :gen_tcp.recv(socket, 0)
      :ok = :gen_tcp.send(socket, "#{user}\n")
      {:ok, response} = :gen_tcp.recv(socket, 0)
      assert String.starts_with?(response, "*")
      assert String.contains?(response, "joined the room")
    end

    test "users are shown the existing members of the room not including their user" do
      user1 = "stephen"
      {:ok, socket1} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      {:ok, _response} = :gen_tcp.recv(socket1, 0)
      :ok = :gen_tcp.send(socket1, "#{user1}\n")
      {:ok, response} = :gen_tcp.recv(socket1, 0)
      assert String.starts_with?(response, "*")
      assert String.contains?(response, "joined the room")
      assert !String.contains?(response, user1)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
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
      {:ok, socket1} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
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
      {:ok, socket1} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      :gen_tcp.recv(socket2, 0, 300)
      :gen_tcp.send(socket2, "#{user2}\n")
      {:ok, join_response} = :gen_tcp.recv(socket2, 0, 300)
      assert join_response == "* You have joined the room with: #{user1}\n"

      :gen_tcp.close(socket1)
      :gen_tcp.close(socket2)
    end

    test "users can chat" do
      user1 = "stephen"
      {:ok, socket1} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
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
      {:ok, socket1} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
      :gen_tcp.recv(socket1, 0, 300)
      :gen_tcp.send(socket1, "#{user1}\n")
      :gen_tcp.recv(socket1, 0, 300)

      user2 = "alanone"
      {:ok, socket2} = :gen_tcp.connect('localhost', 11238, [:binary, active: false])
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

  describe "unit" do
    test "alphanumeric names are accepted" do
      accepted = ~w(someone word123 SOMEONE SomeOne a b c some0ne)

      Enum.all?(accepted, fn name ->
        {:ok, ^name} = ChatRoomServer.check_name_format(name)
      end)
    end

    test "non-alphanumeric names are rejected" do
      rejected = [
        "someone!",
        "hello there",
        "@someone"
      ]

      Enum.all?(rejected, fn name ->
        {:error, :rejected_name} = ChatRoomServer.check_name_format(name)
      end)
    end
  end
end
```

## modified files

### fly.toml

```diff
diff --git a/fly.toml b/fly.toml
index f1dad4a..0463b7f 100644
--- a/fly.toml
+++ b/fly.toml
@@ -46,6 +46,17 @@ script_checks = []
 handlers = []
 port = "11237"

+[[services]]
+http_checks = []
+internal_port = 11238
+processes = ["app"]
+protocol = "tcp"
+script_checks = []
+
+[[services.ports]]
+handlers = []
+port = "11238"
+
 [services.concurrency]
 hard_limit = 25
 soft_limit = 20
```

### lib/protohackers/application.ex

```diff
diff --git a/lib/protohackers/application.ex b/lib/protohackers/application.ex
index f38e8a6..ca1ba1b 100644
--- a/lib/protohackers/application.ex
+++ b/lib/protohackers/application.ex
@@ -8,7 +8,8 @@ defmodule Protohackers.Application do
     children = [
       {Protohackers.EchoServer, 11235},
       {Protohackers.IsPrimeServer, 11236},
-      {Protohackers.AssetPriceServer, 11237}
+      {Protohackers.AssetPriceServer, 11237},
+      {Protohackers.ChatRoomServer, 11238}
     ]

     opts = [strategy: :one_for_one, name: Protohackers.Supervisor]
```
