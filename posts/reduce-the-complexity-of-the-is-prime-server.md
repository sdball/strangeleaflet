---
title: Reduce the complexity of the IsPrimeServer - sdball/protohackers
slug: reduce-the-complexity-of-the-is-prime-server
published_date: 2023-01-05T04:05:00+00:00
tags: elixir, git blog, protohackers
publish: true
is_page: false
---

I'm happier with this version but I'm not entirely sold on my use of
`with` in the core `respond_to_lines_until_closed` path.

One the one hand: it does make the happy path very clear at a high level of indentation.

But on the other hand the mixing of errors from `:gen_tcp` and
`Jason.decode` make it hard to know which step in the with declaration had the issue.

In many cases that wouldn't be a problem but in this case we need to
send a malformed response for some errors but not all "errors". A big
example is `{:error, :closed}` which simply means the client closed the
socket which is entirely expected.

The alternative would be a case statement for `:gen_tcp.recv` and then a
with statement or another case statement to handle `Jason.decode`. That
may be more readable as the levels of error handling responsibility
would be clearer.

Error from `:gen_tcp.recv`? Don't send a malformed response.

Error or missed pattern from `Jason.decode`? Send a malformed response.

Hrmmm I'll leave it as with for now since I really do like the clear
declaration of the happy path.

This blog post was generated from Git commit [2e9fd1706cea9ec34f1e660a5224b6d64106474f on sdball/protohackers](https://github.com/sdball/protohackers/commit/2e9fd1706cea9ec34f1e660a5224b6d64106474f)

## modified files

### lib/protohackers/is_prime_server.ex

```diff
diff --git a/lib/protohackers/is_prime_server.ex b/lib/protohackers/is_prime_server.ex
index 72e6eb0..0f45a28 100644
--- a/lib/protohackers/is_prime_server.ex
+++ b/lib/protohackers/is_prime_server.ex
@@ -28,7 +28,7 @@ defmodule Protohackers.IsPrimeServer do

     case :gen_tcp.listen(port, listen_options) do
       {:ok, listen_socket} ->
-        Logger.info("Starting isPrime server on port #{port}")
+        Logger.info("Starting IsPrimeServer on port #{port}")
         state = %__MODULE__{listen_socket: listen_socket, supervisor: supervisor}
         {:ok, state, {:continue, :accept}}

@@ -41,143 +41,72 @@ defmodule Protohackers.IsPrimeServer do
   def handle_continue(:accept, %__MODULE__{} = state) do
     case :gen_tcp.accept(state.listen_socket) do
       {:ok, socket} ->
-        Logger.info("Starting Task.Supervisor child to handle connection #{state.task_id}")
-
         Task.Supervisor.start_child(state.supervisor, fn ->
           handle_connection(socket, state.task_id)
         end)

-        {:noreply, %{state | task_id: state.task_id + 1}, {:continue, :accept}}
+        new_task_id = rem(state.task_id + 1, 1000)
+
+        {:noreply, %{state | task_id: new_task_id}, {:continue, :accept}}

       {:error, reason} ->
-        Logger.error("Unable to accept connection #{inspect(reason)}")
+        Logger.error("[IsPrimeServer] Unable to accept connection #{inspect(reason)}")
         {:stop, reason, state}
     end
   end

-  def is_prime?(0), do: false
+  # -- core prime handling functionality for this server ---------------------
+
+  def is_prime?(number) when is_float(number), do: false
+  def is_prime?(number) when is_number(number) and number <= 0, do: false

   def is_prime?(number) when is_integer(number) and number > 0 do
     PrimeNumbers.is_prime?(number)
   end

-  def is_prime?(number) when is_integer(number) and number < 0 do
-    false
-  end
-
-  def is_prime?(number) when is_float(number), do: false
+  # -- helpers ---------------------------------------------------------------

   defp handle_connection(socket, task_id) do
-    with {:ok, received} <- receive_lines(socket, _buffer = "") do
-      case process_lines(socket, task_id, received) do
-        {:ok} ->
-          handle_connection(socket, task_id)
-
-        {:halt, :malformed} ->
-          Logger.error("task_id=#{task_id} : halting malformed")
-      end
-    else
-      {:error, :closed} ->
-        Logger.info("task_id=#{task_id} : socket closed")
-        :gen_tcp.close(socket)
-
-      {:error, :timeout} ->
-        Logger.info("task_id=#{task_id} : socket timeout")
-        :gen_tcp.close(socket)
-
-      {:error, :exceeded_write_limit} ->
-        Logger.error("task_id=#{task_id} : exceeded write limit")
-        :gen_tcp.send(socket, "ERR_EXCEEDED_WRITE_LIMIT")
-        :gen_tcp.close(socket)
-
-      {:error, :enotconn} ->
-        Logger.error("task_id=#{task_id} : socket not connected")
-        :gen_tcp.close(socket)
-
-      _error ->
-        Logger.error("task_id=#{task_id} : unknown error")
-        :gen_tcp.close(socket)
-    end
+    respond_to_lines_until_closed(socket, task_id)
+    :gen_tcp.close(socket)
   end

-  defp process_lines(socket, task_id, received) do
-    data = IO.iodata_to_binary(received)
-    requests = String.split(data, "\n", trim: true)
-    parsed = Enum.map(requests, &parse_request(&1, task_id))
-
-    numbers =
-      Enum.take_while(parsed, fn
-        number when is_number(number) -> true
-        _ -> false
-      end)
-
-    numbers
-    |> Enum.each(fn number ->
+  defp respond_to_lines_until_closed(socket, task_id) do
+    with {:ok, line} <- :gen_tcp.recv(socket, _bytes_to_read = 0, _timeout_millis = 30_000),
+         {:ok, %{"method" => "isPrime", "number" => number}} when is_number(number) <-
+           Jason.decode(line) do
       prime? = is_prime?(number)
-      Logger.info("task_id=#{task_id} : response : #{number} prime? #{prime?}")
+      Logger.info("[IsPrimeServer] task_id=#{task_id} : response : #{number} prime? #{prime?}")
       send_response(socket, prime?)
-    end)
-
-    # we've encountered a bad request: stop the works
-    if Enum.count(numbers) < Enum.count(requests) do
-      Logger.error("task_id=#{task_id} : invalid request detected")
-      :gen_tcp.send(socket, "malformed")
-      :gen_tcp.close(socket)
-      {:halt, :malformed}
+      respond_to_lines_until_closed(socket, task_id)
     else
-      {:ok}
-    end
-  end
-
-  @buffer_size_limit _100_kb = 1024 * 100
-
-  defp receive_lines(socket, buffer) do
-    buffered_size = IO.iodata_length(buffer)
-
-    case :gen_tcp.recv(socket, _bytes_to_read = 0, _timeout_millis = 30_000) do
-      {:ok, data} when buffered_size + byte_size(data) > @buffer_size_limit ->
-        {:error, :exceeded_write_limit}
-
-      {:ok, data} ->
-        dbg(data)
-
-        if String.ends_with?(data, "\n") do
-          {:ok, [buffer, data]}
-        else
-          receive_lines(socket, [buffer, data])
-        end
-
-      {:error, :closed} ->
-        {:ok, buffer}
-
-      {:error, reason} ->
-        {:error, reason}
-    end
-  end
-
-  defp parse_request(request, task_id) do
-    case Jason.decode(request) do
+      # Jason decoded, but the decoded request is invalid
       {:ok, decoded} ->
-        parse_decoded(decoded, task_id)
+        Logger.error("[IsPrimeServer] task_id=#{task_id} : invalid request : #{inspect(decoded)}")
+        send_malformed(socket)

-      {:error, %Jason.DecodeError{}} ->
-        Logger.error("task_id=#{task_id} : invalid request : #{inspect(request)}")
-        false
+      # Jason could not decode json
+      {:error, error = %Jason.DecodeError{}} ->
+        Logger.error("[IsPrimeServer] task_id=#{task_id} : #{inspect(error)}")
+        send_malformed(socket)
+
+      # this is part of the process
+      {:error, :closed} ->
+        :ok
+
+      # general errors
+      error ->
+        Logger.error("[IsPrimeServer] task_id=#{task_id} : #{inspect(error)}")
+        error
     end
   end

-  defp parse_decoded(%{"method" => "isPrime", "number" => number}, _task_id)
-       when is_number(number) do
-    number
-  end
-
-  defp parse_decoded(invalid_json, task_id) do
-    Logger.error("task_id=#{task_id} : invalid json: #{inspect(invalid_json)}")
-    nil
-  end
-
   defp send_response(socket, is_prime) do
     response = %{method: "isPrime", prime: is_prime} |> Jason.encode!()
     :gen_tcp.send(socket, "#{response}\n")
   end
+
+  defp send_malformed(socket) do
+    :gen_tcp.send(socket, "malformed")
+  end
 end
```
