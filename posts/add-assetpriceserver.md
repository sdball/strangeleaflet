---
title: Add AssetPriceServer - sdball/protohackers
slug: add-assetpriceserver
published_date: 2023-01-05T16:29:00+00:00
tags: elixir, git blog, protohackers
publish: true
discoverable: true
is_page: false
---

https://protohackers.com/problem/2

Note I had to specially handle SIGNED 32-bit integers

Elixir defaults to unsigned integers

```elixir
<< "I", timestamp::integer-32, price::integer-32>> = bytes
```

price: `4294966986`

```
<< "I", timestamp::signed-integer-32, price::signed-integer-32>> = bytes
```

price: `-310`

The protohackers challenge was smartly checking for that edge by having
a mix of negative and positive prices e.g. -300, 500. That way they can
expect an answer that is positive. If they only passed over negative
prices then the test wouldn't work because the bytes for the correct
negative integer result would be the same as the bytes for the
incorrect large integer result.

Like so

```
iex(1)> <<-301::integer-32>>
<<255, 255, 254, 211>>

iex(2)> <<-301::unsigned-integer-32>>
<<255, 255, 254, 211>>

iex(3)> <<4294966995::integer-32>>
<<255, 255, 254, 211>>

iex(4)> <<4294966995::unsigned-integer-32>>
<<255, 255, 254, 211>>
```

All the same bytes but different numbers depending on your point of
view.

This blog post was generated from commit [952978667b2bc19ba20a350b4a3f1e47faa0df08 on sdball/protohackers](https://github.com/sdball/protohackers/commit/952978667b2bc19ba20a350b4a3f1e47faa0df08)

## added files

### lib/protohackers/asset_price_server.ex

```elixir
defmodule Protohackers.AssetPriceServer do
  @moduledoc """
  Accept asset prices with timestamps and return queried averages

  https://protohackers.com/problem/2

  To test manually with netcat you can use -n -e to echo raw bytes

  echo -n : do not append newline
  echo -e : handle escape codes e.g. `\x49` to make a hex 0x49 byte

  Initial server prototyping outputs

      $ echo -n -e "\x49\x00\x00\x30\x39\x00\x00\x00\x65" | nc localhost 11237
      OK - I09e

  Now splitting the bytes

      $ echo -n -e "\x49\x00\x00\x30\x39\x00\x00\x00\x65" | nc localhost 11237
      INSERT - 12345 - 101
  """
  use GenServer

  require Logger

  def start_link(port \\ 11237) do
    GenServer.start_link(__MODULE__, port)
  end

  defstruct [:listen_socket, :supervisor]

  @impl true
  def init(port) do
    {:ok, supervisor} = Task.Supervisor.start_link(max_children: 100)

    listen_options = [
      # receive data as binaries (instead of lists)
      mode: :binary,
      # block on `:gen_tcp.recv/2` until data is available
      active: false,
      # allow reusing the address if the listener crashes
      reuseaddr: true,
      # keep the peer socket open after the client closes its writes
      exit_on_close: false
    ]

    case :gen_tcp.listen(port, listen_options) do
      {:ok, listen_socket} ->
        Logger.info("Starting AssetPriceServer on port #{port}")
        state = %__MODULE__{listen_socket: listen_socket, supervisor: supervisor}
        {:ok, state, {:continue, :accept}}

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
        Logger.error("[AssetPriceServer] Unable to accept connection #{inspect(reason)}")
        {:stop, reason, state}
    end
  end

  # -- core ------------------------------------------------------------------
  def insert(history, timestamp, price) do
    Map.put(history, timestamp, price)
  end

  def query(history, mintime, maxtime) when mintime <= maxtime do
    matching =
      for {ts, price} <- history, ts >= mintime and ts <= maxtime do
        price
      end

    count = Enum.count(matching)

    if count > 0 do
      (Enum.sum(matching) / Enum.count(matching))
      |> Float.round()
      |> trunc()
    else
      0
    end
  end

  def query(_history, _mintime, _maxtime), do: 0

  # -- server handling -------------------------------------------------------

  defp handle_connection(socket) do
    track_asset_prices_until_closed(socket, _price_history = %{})
    :gen_tcp.close(socket)
  end

  defp track_asset_prices_until_closed(socket, price_history) do
    with {:ok, bytes} <- :gen_tcp.recv(socket, _bytes_to_read = 9, _timeout_millis = 30_000) do
      log(:info, "BYTES #{inspect(bytes)}")

      new_price_history =
        case bytes do
          <<"I", timestamp::signed-integer-32, price::signed-integer-32>> ->
            log(:info, "INSERT #{timestamp} #{price}")
            insert(price_history, timestamp, price)

          <<"Q", mintime::signed-integer-32, maxtime::signed-integer-32>> ->
            log(:info, "QUERY #{mintime} #{maxtime}")
            average = query(price_history, mintime, maxtime)
            log(:info, "AVERAGE #{average}")
            :gen_tcp.send(socket, <<average::signed-integer-32>>)
            price_history

          _undefined ->
            price_history
        end

      track_asset_prices_until_closed(socket, new_price_history)
    else
      # this is part of the process
      {:error, :closed} ->
        :ok

      # general errors
      error ->
        log(:error, error)
        error
    end
  end

  defp log(:info, message) when is_binary(message) do
    Logger.info("[AssetPriceService] [#{inspect(self())}] #{message}")
  end

  defp log(:error, message) when is_binary(message) do
    Logger.error("[AssetPriceService] [#{inspect(self())}] #{message}")
  end

  defp log(level, message), do: log(level, inspect(message))
end
```

### test/protohackers/asset_price_server_test.exs

```elixir
defmodule Protohackers.AssetPriceServerTest do
  alias Protohackers.AssetPriceServer
  use ExUnit.Case

  describe "asset pricing history and calculation" do
    test "track a list of timestamped prices" do
      history = %{}
      history = AssetPriceServer.insert(history, 12345, 101)
      assert history |> Enum.into([]) |> Enum.sort() == [{12345, 101}]

      history = AssetPriceServer.insert(history, 12346, 100)
      assert history |> Enum.into([]) |> Enum.sort() == [{12345, 101}, {12346, 100}]

      history = AssetPriceServer.insert(history, 12347, 102)
      assert history |> Enum.into([]) |> Enum.sort() == [{12345, 101}, {12346, 100}, {12347, 102}]
    end

    test "query an average price between timestamps" do
      history = %{
        12348 => 200,
        12347 => 102,
        12346 => 100,
        12345 => 101
      }

      average = AssetPriceServer.query(history, 12345, 12347)
      assert average == 101
    end

    test "large numbers are queried properly" do
      history = %{
        903_773_005 => 4_294_967_284,
        903_870_526 => 4_294_967_294,
        903_928_433 => 4_294_967_278,
        903_968_073 => 4_294_967_286,
        904_037_196 => 4_294_967_275,
        904_064_981 => 4_294_967_261,
        904_122_415 => 4_294_967_253,
        904_184_004 => 4_294_967_238,
        904_210_902 => 4_294_967_240,
        904_260_916 => 4_294_967_241,
        904_277_328 => 4_294_967_236,
        904_283_271 => 4_294_967_240,
        904_343_127 => 4_294_967_240,
        904_351_616 => 4_294_967_228,
        904_364_965 => 4_294_967_236,
        904_438_718 => 4_294_967_228,
        904_440_224 => 4_294_967_225,
        904_465_848 => 4_294_967_216,
        904_533_050 => 4_294_967_216,
        904_601_999 => 4_294_967_204,
        904_624_501 => 4_294_967_188,
        904_628_298 => 4_294_967_170,
        904_683_950 => 4_294_967_178,
        904_725_601 => 4_294_967_173,
        904_809_612 => 4_294_967_170,
        904_888_252 => 4_294_967_161
      }

      average = AssetPriceServer.query(history, 903_773_005, 904_888_252)
      assert average == 4_294_967_229
    end

    test "queries outside of given timestamps return 0" do
      history = %{
        12348 => 200,
        12347 => 102,
        12346 => 100,
        12345 => 101
      }

      average = AssetPriceServer.query(history, 1000, 2000)
      assert average == 0
    end

    test "queries with out of order timestamps return 0" do
      history = %{
        12348 => 200,
        12347 => 102,
        12346 => 100,
        12345 => 101
      }

      average = AssetPriceServer.query(history, 12347, 12345)
      assert average == 0
    end
  end

  describe "tracking asset prices per client" do
    test "a client can track asset prices and query average" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11237, [:binary, active: false])
      :gen_tcp.send(socket, insert(timestamp: 12345, price: 101))
      :gen_tcp.send(socket, insert(timestamp: 12346, price: 102))
      :gen_tcp.send(socket, insert(timestamp: 12347, price: 100))
      :gen_tcp.send(socket, query(min: 12345, max: 12347))
      {:ok, <<resp::signed-integer-32>>} = :gen_tcp.recv(socket, 0)
      assert resp == 101
    end

    test "invalid requests are ignored" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11237, [:binary, active: false])
      :gen_tcp.send(socket, insert(timestamp: 12345, price: 101))
      :gen_tcp.send(socket, insert(timestamp: 12346, price: 102))
      :gen_tcp.send(socket, insert(timestamp: 12347, price: 100))
      :gen_tcp.send(socket, invalid())
      :gen_tcp.send(socket, query(min: 12345, max: 12347))
      {:ok, <<resp::signed-integer-32>>} = :gen_tcp.recv(socket, 0)
      assert resp == 101
    end

    test "reinserting over the same timestamp overwrites data" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11237, [:binary, active: false])
      :gen_tcp.send(socket, insert(timestamp: 12345, price: 101))
      :gen_tcp.send(socket, insert(timestamp: 12345, price: 300))
      :gen_tcp.send(socket, query(min: 12345, max: 12345))
      {:ok, <<resp::signed-integer-32>>} = :gen_tcp.recv(socket, 0)
      assert resp == 300
    end

    test "querying data outside of given timestamps returns 0" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11237, [:binary, active: false])
      :gen_tcp.send(socket, insert(timestamp: 12345, price: 101))
      :gen_tcp.send(socket, insert(timestamp: 12345, price: 300))
      :gen_tcp.send(socket, query(min: 1000, max: 2000))
      {:ok, <<resp::signed-integer-32>>} = :gen_tcp.recv(socket, 0)
      assert resp == 0
    end

    test "querying data with out of order timestamps returns 0 as the average" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11237, [:binary, active: false])
      :gen_tcp.send(socket, insert(timestamp: 1000, price: 123))
      :gen_tcp.send(socket, insert(timestamp: 1111, price: 123))
      :gen_tcp.send(socket, insert(timestamp: 1, price: 123))
      :gen_tcp.send(socket, insert(timestamp: 9999, price: 123))
      :gen_tcp.send(socket, query(min: 1500, max: 1000))
      {:ok, <<resp::signed-integer-32>>} = :gen_tcp.recv(socket, 0)
      assert resp == 0
    end

    test "querying treats timestamps and prices as signed 32 bit integers" do
      {:ok, socket} = :gen_tcp.connect('localhost', 11237, [:binary, active: false])
      :gen_tcp.send(socket, insert(timestamp: 12345, price: -300))
      :gen_tcp.send(socket, insert(timestamp: 12346, price: 500))
      :gen_tcp.send(socket, query(min: 12345, max: 12346))
      {:ok, <<resp::signed-integer-32>>} = :gen_tcp.recv(socket, 0)
      assert resp == 100
    end
  end

  defp insert(timestamp: timestamp, price: price) do
    <<"I", timestamp::signed-integer-32, price::signed-integer-32>>
  end

  defp query(min: mintime, max: maxtime) do
    <<"Q", mintime::signed-integer-32, maxtime::signed-integer-32>>
  end

  defp invalid() do
    <<"Z", 0::signed-integer-64>>
  end
end
```

## modified files

### fly.toml

```diff
diff --git a/fly.toml b/fly.toml
index ab043f7..f1dad4a 100644
--- a/fly.toml
+++ b/fly.toml
@@ -35,13 +35,24 @@ script_checks = []
 handlers = []
 port = "11236"

+[[services]]
+http_checks = []
+internal_port = 11237
+processes = ["app"]
+protocol = "tcp"
+script_checks = []
+
+[[services.ports]]
+handlers = []
+port = "11237"
+
 [services.concurrency]
 hard_limit = 25
 soft_limit = 20
 type = "connections"

 [[services.tcp_checks]]
-grace_period = "1s"
-interval = "15s"
+grace_period = "15s"
+interval = "30s"
 restart_limit = 0
 timeout = "2s"
```

### lib/protohackers/application.ex

```diff
diff --git a/lib/protohackers/application.ex b/lib/protohackers/application.ex
index cb3fd45..f38e8a6 100644
--- a/lib/protohackers/application.ex
+++ b/lib/protohackers/application.ex
@@ -5,21 +5,13 @@ defmodule Protohackers.Application do

   @impl true
   def start(_type, _args) do
+    children = [
+      {Protohackers.EchoServer, 11235},
+      {Protohackers.IsPrimeServer, 11236},
+      {Protohackers.AssetPriceServer, 11237}
+    ]
+
     opts = [strategy: :one_for_one, name: Protohackers.Supervisor]
-    Supervisor.start_link(children(Mix.env()), opts)
-  end
-
-  defp children(:prod) do
-    [
-      {Protohackers.EchoServer, 11235},
-      {Protohackers.IsPrimeServer, 11236}
-    ]
-  end
-
-  defp children(_other) do
-    [
-      {Protohackers.EchoServer, 11235},
-      {Protohackers.IsPrimeServer, 11236}
-    ]
+    Supervisor.start_link(children, opts)
   end
 end
```
