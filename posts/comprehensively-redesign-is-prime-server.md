---
title: Comprehensively redesign IsPrimeServer - sdball/protohackers
slug: comprehensively-redesign-is-prime-server
published_date: 2023-01-04T20:51:00+00:00
tags: elixir, git blog, protohackers
publish: true
---

The first major issue was that the Protohackers challenges threw a
literal zero at my prime number module I stole from the Internet. That
prime number module assumed integers >= 1 and a literal zero meant a
literal divide by zero.

Did the server keep running? Yes it did. But did the client get an
answer to that request? No it did not.

The second major issue is that I thought I needed to redesign how I was
parsing sent bytes to check for the ASCII character `'\n'` vs the binary
character `"\n"`. But that turns out to be a mistake on my part. The
literal `'\n'` (ASCII 10, line feed, new line, etc) is not equal to `"\n"` because no bitstring is equal to the "same" binary.

```
> "a" == 'a' # => false
```

The effect of that mistake is that the line handling code in
IsPrimeServer is more complex and guarded than it probably needs to be.

The third major issue is that the original prime number module I stole
from the Internet is AMAZINGLY SLOW. My poor server was spending minutes trying to serve thousands of requests that expected to be completed in seconds.

I found another module to steal from the Internet and its performance is much faster. Like, MUCH, faster. Over 600,000 times faster.

```
Benchmarking PrimeFactors ...
Benchmarking PrimeNumbers ...

Name                   ips        average  deviation         median         99th %
PrimeNumbers        4.92 M     0.00020 ms ±14638.15%     0.00017 ms     0.00025 ms
PrimeFactors     0.00001 M      129.39 ms     ±0.19%      129.31 ms      130.18 ms

Comparison:
PrimeNumbers        4.92 M
PrimeFactors     0.00001 M - 636398.34x slower +129.39 ms
```

So really I overcomplicated the fixes from my original attempt. I really only needed to

- Fix edges of prime number calculations e.g. specially handle zero,
  specially handle negative numbers.
- Use an actually fast prime number calculation algorithm

I'm leaving the complexity of my current code for now and all the
logging output. When I revisit I'll see if I can organize the module a
bit better and make it all more readable and less overly complicated.

Happily along the way I also dug into fly.toml and figured out how to
connect multiple external ports to multiple internal ports. Yay!

This blog post was generated from Git commit [a72e3000e7225b0acaaf6db5bd6ba38efbd83d89 on sdball/protohackers](https://github.com/sdball/protohackers/commit/a72e3000e7225b0acaaf6db5bd6ba38efbd83d89)

## added files

### benchmark/primes.exs

```
Benchee.run(%{
  "PrimeFactors" => fn -> PrimeFactors.is_prime?(86358305) end,
  "PrimeNumbers" => fn -> PrimeNumbers.is_prime?(86358305) end
}, time: 3)
```

### lib/prime_numbers.ex

```elixir
defmodule PrimeNumbers do
  def is_prime?(2), do: true
  def is_prime?(3), do: true

  def is_prime?(x) when is_integer(x) and x > 3 do
    from = 2
    to = trunc(:math.sqrt(x))
    n_total = to - from + 1

    n_tried =
      Enum.take_while(from..to, fn i -> rem(x, i) != 0 end)
      |> Enum.count()

    n_total == n_tried
  end

  def is_prime?(x) when is_integer(x), do: false

  def is_prime?(x) when is_float(x), do: false

  def is_prime?(_anything), do: false
end
```

### test/prime_numbers_test.exs

```elixir
defmodule PrimeNumbersTest do
  use ExUnit.Case, async: true

  test "zero is not prime" do
    assert PrimeNumbers.is_prime?(0) == false
  end

  test "negatives are not prime" do
    assert PrimeNumbers.is_prime?(-3) == false
  end

  test "identifies prime numbers and composite numbers" do
    assert PrimeNumbers.is_prime?(1) == false
    assert PrimeNumbers.is_prime?(2) == true
    assert PrimeNumbers.is_prime?(3) == true
    assert PrimeNumbers.is_prime?(4) == false
    assert PrimeNumbers.is_prime?(5) == true
    assert PrimeNumbers.is_prime?(16) == false
    assert PrimeNumbers.is_prime?(17) == true
    assert PrimeNumbers.is_prime?(59) == true
    assert PrimeNumbers.is_prime?(60) == false
    assert PrimeNumbers.is_prime?(61) == true
    assert PrimeNumbers.is_prime?(210) == false
    assert PrimeNumbers.is_prime?(211) == true
  end

  test "floats are not prime" do
    assert PrimeNumbers.is_prime?(1.123) == false
    assert PrimeNumbers.is_prime?(2.000) == false
  end

  test "words are not prime" do
    assert PrimeNumbers.is_prime?("two") == false
  end
end
```

## modified files

### fly.toml

```diff
diff --git a/fly.toml b/fly.toml
index 47fa649..69d463a 100644
--- a/fly.toml
+++ b/fly.toml
@@ -9,16 +9,13 @@ processes = []
 builder = "heroku/buildpacks:20"
 buildpacks = ["https://cnb-shim.herokuapp.com/v1/hashnuke/elixir"]

-[env]
-PORT = "8080"
-
 [experimental]
 allowed_public_ports = []
 auto_rollback = true

 [[services]]
 http_checks = []
-internal_port = 8080
+internal_port = 11235
 processes = ["app"]
 protocol = "tcp"
 script_checks = []
@@ -26,11 +23,28 @@ script_checks = []
 hard_limit = 25
 soft_limit = 20
 type = "connections"
-
 [[services.ports]]
 handlers = []
-port = "8080"
+port = "11235"
+[[services.tcp_checks]]
+grace_period = "1s"
+interval = "15s"
+restart_limit = 0
+timeout = "2s"

+[[services]]
+http_checks = []
+internal_port = 11236
+processes = ["app"]
+protocol = "tcp"
+script_checks = []
+[services.concurrency]
+hard_limit = 25
+soft_limit = 20
+type = "connections"
+[[services.ports]]
+handlers = []
+port = "11236"
 [[services.tcp_checks]]
 grace_period = "1s"
 interval = "15s"
```

### lib/prime_factors.ex

```diff
diff --git a/lib/prime_factors.ex b/lib/prime_factors.ex
index 61dafe8..7fcfe5e 100644
--- a/lib/prime_factors.ex
+++ b/lib/prime_factors.ex
@@ -3,12 +3,16 @@ defmodule PrimeFactors do
     factors(n, div(n, 2)) |> Enum.filter(&is_prime?/1) |> Enum.reverse()
   end

+  def is_prime?(0), do: false
   def is_prime?(1), do: false
+  def is_prime?(n) when is_integer(n) and n < 1, do: false

-  def is_prime?(n) do
+  def is_prime?(n) when is_integer(n) do
     factors(n, div(n, 2)) == [1]
   end

+  def is_prime?(_other), do: false
+
   defp factors(1, _), do: [1]
   defp factors(_, 1), do: [1]

```

### lib/protohackers/application.ex

```diff
diff --git a/lib/protohackers/application.ex b/lib/protohackers/application.ex
index 0721b1d..cb3fd45 100644
--- a/lib/protohackers/application.ex
+++ b/lib/protohackers/application.ex
@@ -10,8 +10,10 @@ defmodule Protohackers.Application do
   end

   defp children(:prod) do
-    # right now I only now how to have one port open from fly.io
-    [{Protohackers.IsPrimeServer, 8080}]
+    [
+      {Protohackers.EchoServer, 11235},
+      {Protohackers.IsPrimeServer, 11236}
+    ]
   end

   defp children(_other) do
```

### lib/protohackers/is_prime_server.ex

```diff
diff --git a/lib/protohackers/is_prime_server.ex b/lib/protohackers/is_prime_server.ex
index 790bea8..72e6eb0 100644
--- a/lib/protohackers/is_prime_server.ex
+++ b/lib/protohackers/is_prime_server.ex
@@ -7,7 +7,7 @@ defmodule Protohackers.IsPrimeServer do
     GenServer.start_link(__MODULE__, port)
   end

-  defstruct [:listen_socket, :supervisor]
+  defstruct [:listen_socket, :supervisor, task_id: 1]

   @impl true
   def init(port) do
@@ -22,7 +22,7 @@ defmodule Protohackers.IsPrimeServer do
       reuseaddr: true,
       # keep the peer socket open after the client closes its writes
       exit_on_close: false,
-      # receive data line by line
+      # automatically split inputs by newline
       packet: :line
     ]

@@ -41,11 +41,13 @@ defmodule Protohackers.IsPrimeServer do
   def handle_continue(:accept, %__MODULE__{} = state) do
     case :gen_tcp.accept(state.listen_socket) do
       {:ok, socket} ->
+        Logger.info("Starting Task.Supervisor child to handle connection #{state.task_id}")
+
         Task.Supervisor.start_child(state.supervisor, fn ->
-          handle_connection(socket)
+          handle_connection(socket, state.task_id)
         end)

-        {:noreply, state, {:continue, :accept}}
+        {:noreply, %{state | task_id: state.task_id + 1}, {:continue, :accept}}

       {:error, reason} ->
         Logger.error("Unable to accept connection #{inspect(reason)}")
@@ -53,52 +55,129 @@ defmodule Protohackers.IsPrimeServer do
     end
   end

-  defp handle_connection(socket) do
-    with {:ok, json} <- receive_line(socket),
-         {:ok, submitted_data} <-
-           Jason.decode(json),
-         {:ok, number} <-
-           validate_request(submitted_data) do
-      send_response(socket, number |> is_prime?)
-      handle_connection(socket)
+  def is_prime?(0), do: false
+
+  def is_prime?(number) when is_integer(number) and number > 0 do
+    PrimeNumbers.is_prime?(number)
+  end
+
+  def is_prime?(number) when is_integer(number) and number < 0 do
+    false
+  end
+
+  def is_prime?(number) when is_float(number), do: false
+
+  defp handle_connection(socket, task_id) do
+    with {:ok, received} <- receive_lines(socket, _buffer = "") do
+      case process_lines(socket, task_id, received) do
+        {:ok} ->
+          handle_connection(socket, task_id)
+
+        {:halt, :malformed} ->
+          Logger.error("task_id=#{task_id} : halting malformed")
+      end
     else
       {:error, :closed} ->
+        Logger.info("task_id=#{task_id} : socket closed")
         :gen_tcp.close(socket)

       {:error, :timeout} ->
+        Logger.info("task_id=#{task_id} : socket timeout")
         :gen_tcp.close(socket)

+      {:error, :exceeded_write_limit} ->
+        Logger.error("task_id=#{task_id} : exceeded write limit")
+        :gen_tcp.send(socket, "ERR_EXCEEDED_WRITE_LIMIT")
+        :gen_tcp.close(socket)
+
+      {:error, :enotconn} ->
+        Logger.error("task_id=#{task_id} : socket not connected")
+        :gen_tcp.close(socket)
+
+      _error ->
+        Logger.error("task_id=#{task_id} : unknown error")
+        :gen_tcp.close(socket)
+    end
+  end
+
+  defp process_lines(socket, task_id, received) do
+    data = IO.iodata_to_binary(received)
+    requests = String.split(data, "\n", trim: true)
+    parsed = Enum.map(requests, &parse_request(&1, task_id))
+
+    numbers =
+      Enum.take_while(parsed, fn
+        number when is_number(number) -> true
+        _ -> false
+      end)
+
+    numbers
+    |> Enum.each(fn number ->
+      prime? = is_prime?(number)
+      Logger.info("task_id=#{task_id} : response : #{number} prime? #{prime?}")
+      send_response(socket, prime?)
+    end)
+
+    # we've encountered a bad request: stop the works
+    if Enum.count(numbers) < Enum.count(requests) do
+      Logger.error("task_id=#{task_id} : invalid request detected")
+      :gen_tcp.send(socket, "malformed")
+      :gen_tcp.close(socket)
+      {:halt, :malformed}
+    else
+      {:ok}
+    end
+  end
+
+  @buffer_size_limit _100_kb = 1024 * 100
+
+  defp receive_lines(socket, buffer) do
+    buffered_size = IO.iodata_length(buffer)
+
+    case :gen_tcp.recv(socket, _bytes_to_read = 0, _timeout_millis = 30_000) do
+      {:ok, data} when buffered_size + byte_size(data) > @buffer_size_limit ->
+        {:error, :exceeded_write_limit}
+
+      {:ok, data} ->
+        dbg(data)
+
+        if String.ends_with?(data, "\n") do
+          {:ok, [buffer, data]}
+        else
+          receive_lines(socket, [buffer, data])
+        end
+
+      {:error, :closed} ->
+        {:ok, buffer}
+
+      {:error, reason} ->
+        {:error, reason}
+    end
+  end
+
+  defp parse_request(request, task_id) do
+    case Jason.decode(request) do
+      {:ok, decoded} ->
+        parse_decoded(decoded, task_id)
+
       {:error, %Jason.DecodeError{}} ->
-        :gen_tcp.send(socket, "malformed\n")
-        :gen_tcp.close(socket)
-
-      {:error, :invalid_request} ->
-        :gen_tcp.send(socket, "malformed\n")
-        :gen_tcp.close(socket)
+        Logger.error("task_id=#{task_id} : invalid request : #{inspect(request)}")
+        false
     end
   end

-  defp receive_line(socket) do
-    :gen_tcp.recv(socket, _bytes_to_read = 0, _timeout_millis = 10_000)
+  defp parse_decoded(%{"method" => "isPrime", "number" => number}, _task_id)
+       when is_number(number) do
+    number
   end

-  defp validate_request(%{"method" => "isPrime", "number" => number}) when is_number(number) do
-    {:ok, number}
-  end
-
-  defp validate_request(_malformed) do
-    {:error, :invalid_request}
+  defp parse_decoded(invalid_json, task_id) do
+    Logger.error("task_id=#{task_id} : invalid json: #{inspect(invalid_json)}")
+    nil
   end

   defp send_response(socket, is_prime) do
     response = %{method: "isPrime", prime: is_prime} |> Jason.encode!()
     :gen_tcp.send(socket, "#{response}\n")
   end
-
-  defp is_prime?(number) when is_integer(number) do
-    Code.ensure_loaded!(PrimeFactors)
-    PrimeFactors.is_prime?(number)
-  end
-
-  defp is_prime?(number) when is_float(number), do: false
 end
```

### mix.exs

```diff
diff --git a/mix.exs b/mix.exs
index f57206a..dc8bed3 100644
--- a/mix.exs
+++ b/mix.exs
@@ -22,7 +22,8 @@ defmodule Protohackers.MixProject do
   # Run "mix help deps" to learn about dependencies.
   defp deps do
     [
-      {:jason, "~> 1.4.0"}
+      {:jason, "~> 1.4.0"},
+      {:benchee, "~> 1.1.0", only: :dev}
     ]
   end
 end
```

### mix.lock

```diff
diff --git a/mix.lock b/mix.lock
index 8ab831f..e8f9f63 100644
--- a/mix.lock
+++ b/mix.lock
@@ -1,3 +1,6 @@
 %{
+  "benchee": {:hex, :benchee, "1.1.0", "f3a43817209a92a1fade36ef36b86e1052627fd8934a8b937ac9ab3a76c43062", [:mix], [{:deep_merge, "~> 1.0", [hex: :deep_merge, repo: "hexpm", optional: false]}, {:statistex, "~> 1.0", [hex: :statistex, repo: "hexpm", optional: false]}], "hexpm", "7da57d545003165a012b587077f6ba90b89210fd88074ce3c60ce239eb5e6d93"},
+  "deep_merge": {:hex, :deep_merge, "1.0.0", "b4aa1a0d1acac393bdf38b2291af38cb1d4a52806cf7a4906f718e1feb5ee961", [:mix], [], "hexpm", "ce708e5f094b9cd4e8f2be4f00d2f4250c4095be93f8cd6d018c753894885430"},
   "jason": {:hex, :jason, "1.4.0", "e855647bc964a44e2f67df589ccf49105ae039d4179db7f6271dfd3843dc27e6", [:mix], [{:decimal, "~> 1.0 or ~> 2.0", [hex: :decimal, repo: "hexpm", optional: true]}], "hexpm", "79a3791085b2a0f743ca04cec0f7be26443738779d09302e01318f97bdb82121"},
+  "statistex": {:hex, :statistex, "1.0.0", "f3dc93f3c0c6c92e5f291704cf62b99b553253d7969e9a5fa713e5481cd858a5", [:mix], [], "hexpm", "ff9d8bee7035028ab4742ff52fc80a2aa35cece833cf5319009b52f1b5a86c27"},
 }
```

### test/prime_factors_test.exs

```diff
diff --git a/test/prime_factors_test.exs b/test/prime_factors_test.exs
index 8cf70fa..574c57e 100644
--- a/test/prime_factors_test.exs
+++ b/test/prime_factors_test.exs
@@ -1,7 +1,15 @@
 defmodule PrimeFactorsTest do
   use ExUnit.Case, async: true

-  test "identifies prime numbers" do
+  test "zero is not prime" do
+    assert PrimeFactors.is_prime?(0) == false
+  end
+
+  test "negatives are not prime" do
+    assert PrimeFactors.is_prime?(-3) == false
+  end
+
+  test "identifies prime numbers and composite numbers" do
     assert PrimeFactors.is_prime?(1) == false
     assert PrimeFactors.is_prime?(2) == true
     assert PrimeFactors.is_prime?(3) == true
@@ -16,6 +24,15 @@ defmodule PrimeFactorsTest do
     assert PrimeFactors.is_prime?(211) == true
   end

+  test "floats are not prime" do
+    assert PrimeFactors.is_prime?(1.123) == false
+    assert PrimeFactors.is_prime?(2.000) == false
+  end
+
+  test "words are not prime" do
+    assert PrimeFactors.is_prime?("two") == false
+  end
+
   test "determines prime factors of a given number" do
     assert PrimeFactors.of(3) == []
     assert PrimeFactors.of(9) == [3]
```

### test/protohackers/is_prime_server_test.exs

```diff
diff --git a/test/protohackers/is_prime_server_test.exs b/test/protohackers/is_prime_server_test.exs
index 7571ad9..88813d6 100644
--- a/test/protohackers/is_prime_server_test.exs
+++ b/test/protohackers/is_prime_server_test.exs
@@ -1,6 +1,137 @@
 defmodule Protohackers.IsPrimeServerTest do
+  alias Protohackers.IsPrimeServer
   use ExUnit.Case

+  test "server prime number calculation requirements" do
+    assert IsPrimeServer.is_prime?(-4) == false
+    assert IsPrimeServer.is_prime?(-3) == false
+    assert IsPrimeServer.is_prime?(-2) == false
+    assert IsPrimeServer.is_prime?(-1) == false
+    assert IsPrimeServer.is_prime?(0) == false
+    assert IsPrimeServer.is_prime?(1) == false
+    assert IsPrimeServer.is_prime?(2) == true
+    assert IsPrimeServer.is_prime?(3) == true
+    assert IsPrimeServer.is_prime?(4) == false
+  end
+
+  test "rejects malformed request" do
+    socket = tcp_connect()
+    assert tcp_roundtrip(socket, "not a valid request") == "malformed"
+    tcp_close(socket)
+  end
+
+  test "rejects invalid request" do
+    socket = tcp_connect()
+    request = %{method: "notValid", number: 123}
+    assert tcp_roundtrip(socket, request |> Jason.encode!()) == "malformed"
+    tcp_close(socket)
+  end
+
+  test "accepts and answers proper requests" do
+    socket = tcp_connect()
+
+    response = tcp_roundtrip(socket, request_prime(2))
+    assert response.method == "isPrime"
+    assert response.prime == true
+
+    response = tcp_roundtrip(socket, request_prime(5))
+    assert response.method == "isPrime"
+    assert response.prime == true
+
+    response = tcp_roundtrip(socket, request_prime(6))
+    assert response.method == "isPrime"
+    assert response.prime == false
+
+    tcp_close(socket)
+  end
+
+  test "a valid request can be multiple sends" do
+    socket = tcp_connect()
+    :gen_tcp.send(socket, "{\"method\":\"isPrime\"")
+    :gen_tcp.send(socket, ",\"number\":123}")
+    :gen_tcp.send(socket, [10])
+    response = tcp_response(socket)
+    assert response.method == "isPrime"
+    assert response.prime == false
+  end
+
+  test "multiple requests are answered in order" do
+    socket = tcp_connect()
+
+    request1 = %{method: "isPrime", number: 2} |> Jason.encode!()
+    tcp_send(socket, request1)
+
+    request2 = %{method: "isPrime", number: 6} |> Jason.encode!()
+    tcp_send(socket, request2)
+
+    [response1, response2] =
+      tcp_response(socket)
+      |> String.split("\n", trim: true)
+      |> Enum.map(&handle_response/1)
+
+    assert response1.method == "isPrime"
+    assert response1.prime == true
+
+    assert response2.method == "isPrime"
+    assert response2.prime == false
+
+    tcp_close(socket)
+  end
+
+  test "multiple requests are answered in order and stop at the first malformed request" do
+    socket = tcp_connect()
+
+    request1 = %{method: "isPrime", number: 2} |> Jason.encode!()
+    tcp_send(socket, request1)
+
+    request2 = %{method: "isPrime", number: 6} |> Jason.encode!()
+    tcp_send(socket, request2)
+
+    request3 = %{method: "isNotValid", number: 6} |> Jason.encode!()
+    tcp_send(socket, request3)
+
+    request4 = %{method: "isPrime", number: 7} |> Jason.encode!()
+    tcp_send(socket, request4)
+
+    responses = tcp_response(socket) |> String.split("\n", trim: true)
+    assert Enum.count(responses) == 3
+
+    [response1, response2, response3] =
+      responses
+      |> Enum.map(&handle_response/1)
+
+    assert response1.method == "isPrime"
+    assert response1.prime == true
+
+    assert response2.method == "isPrime"
+    assert response2.prime == false
+
+    assert response3 == "malformed"
+
+    tcp_close(socket)
+  end
+
+  test "concurrent connections are concurrent" do
+    socket1 = tcp_connect()
+    socket2 = tcp_connect()
+
+    request = %{method: "isPrime", number: 47} |> Jason.encode!()
+
+    socket1_response = tcp_roundtrip(socket1, request)
+    assert socket1_response.prime == true
+
+    socket2_response = tcp_roundtrip(socket2, request)
+    assert socket2_response.prime == true
+
+    socket1_response = tcp_roundtrip(socket1, request)
+    assert socket1_response.prime == true
+
+    tcp_close(socket1)
+    tcp_close(socket2)
+  end
+
+  ## helpers
+
   def tcp_connect() do
     {:ok, socket} = :gen_tcp.connect('localhost', 11236, [:binary, active: false])
     socket
@@ -14,7 +145,7 @@ defmodule Protohackers.IsPrimeServerTest do
         data <> "\n"
       end

-    :ok = :gen_tcp.send(socket, data)
+    :ok = :gen_tcp.send(socket, data |> String.to_charlist())
     socket
   end

@@ -49,76 +180,7 @@ defmodule Protohackers.IsPrimeServerTest do
     :gen_tcp.close(socket)
   end

-  test "rejects malformed request" do
-    socket = tcp_connect()
-    assert tcp_roundtrip(socket, "not a valid request") == "malformed\n"
-    tcp_close(socket)
-  end
-
-  test "rejects invalid request" do
-    socket = tcp_connect()
-    request = %{method: "notValid", number: 123}
-    assert tcp_roundtrip(socket, request |> Jason.encode!()) == "malformed\n"
-    tcp_close(socket)
-  end
-
-  test "accepts and answers proper requests" do
-    socket = tcp_connect()
-
-    request = %{method: "isPrime", number: 2} |> Jason.encode!()
-    response = tcp_roundtrip(socket, request)
-    assert response.method == "isPrime"
-    assert response.prime == true
-
-    request = %{method: "isPrime", number: 5} |> Jason.encode!()
-    response = tcp_roundtrip(socket, request)
-    assert response.method == "isPrime"
-    assert response.prime == true
-
-    request = %{method: "isPrime", number: 6} |> Jason.encode!()
-    response = tcp_roundtrip(socket, request)
-    assert response.method == "isPrime"
-    assert response.prime == false
-
-    tcp_close(socket)
-  end
-
-  test "multiple requests are answered in order" do
-    socket = tcp_connect()
-
-    request1 = %{method: "isPrime", number: 2} |> Jason.encode!()
-    tcp_send(socket, request1)
-
-    request2 = %{method: "isPrime", number: 6} |> Jason.encode!()
-    tcp_send(socket, request2)
-
-    [response1, response2] =
-      tcp_response(socket)
-      |> String.split("\n", trim: true)
-      |> Enum.map(&handle_response/1)
-
-    assert response1.method == "isPrime"
-    assert response1.prime == true
-
-    assert response2.method == "isPrime"
-    assert response2.prime == false
-
-    tcp_close(socket)
-  end
-
-  test "concurrent connections are concurrent" do
-    socket1 = tcp_connect()
-    socket2 = tcp_connect()
-
-    request = %{method: "isPrime", number: 47} |> Jason.encode!()
-
-    socket1_response = tcp_roundtrip(socket1, request)
-    assert socket1_response.prime == true
-
-    socket2_response = tcp_roundtrip(socket2, request)
-    assert socket2_response.prime == true
-
-    tcp_close(socket1)
-    tcp_close(socket2)
+  def request_prime(number) do
+    %{method: "isPrime", number: number} |> Jason.encode!()
   end
 end
```
