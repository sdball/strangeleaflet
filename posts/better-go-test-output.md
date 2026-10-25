---
title: Better Go test output
slug: better-go-test-output
published_date: 2022-03-16T04:00:00+00:00
tags: go
publish: true
discoverable: true
is_page: false
---

The `go test` command is alright and props to Go for being a real modern language with built-in support for testing. But its output is decidedly unfriendly.

```
$ go test
PASS
ok  	pragprog.com/rggo/interacting/todo	0.100s
```

(Aside: I'm going through [Powerful Command-Line Applications in Go](https://pragprog.com/titles/rggo/powerful-command-line-applications-in-go/) and it's excellent)

We can make the output look a little nicer with `-v`

```
$ go test -v
=== RUN   TestAdd
--- PASS: TestAdd (0.00s)
=== RUN   TestComplete
--- PASS: TestComplete (0.00s)
=== RUN   TestDelete
--- PASS: TestDelete (0.00s)
=== RUN   TestSaveGet
--- PASS: TestSaveGet (0.00s)
PASS
ok  	pragprog.com/rggo/interacting/todo	0.211s
```

But still not very human friendly.

There's a `gotestfmt` tool out there which has pretty great results! Provided you pass it the json output of `go test`

```
$ go test -v -json | gotestfmt
📦 pragprog.com/rggo/interacting/todo
  ✅ TestAdd (0s)
  ✅ TestComplete (0s)
  ✅ TestDelete (0s)
  ✅ TestSaveGet (0s)
```

But if you have stderr output from your tests as part of the setup/teardown process then `gotestfmt` will let you down. For some reason it outputs all of those outputs before any of the test results.

```
$ go test -v -json | gotestfmt
📦 pragprog.com/rggo/interacting/todo/cmd/todo
Building tool...
Running tests...
Cleaning up...
  ✅ TestTodoCLI (240ms)
  ✅ TestTodoCLI/AddNewTaskFromArguments (220ms)
  ✅ TestTodoCLI/AddNewTaskFromSTDIN (10ms)
  ✅ TestTodoCLI/CompleteTask (10ms)
  ✅ TestTodoCLI/ListTasks (0s)
```

vs

```
$ go test -v
Building tool...
Running tests...
=== RUN   TestTodoCLI
=== RUN   TestTodoCLI/AddNewTaskFromArguments
=== RUN   TestTodoCLI/AddNewTaskFromSTDIN
=== RUN   TestTodoCLI/ListTasks
=== RUN   TestTodoCLI/CompleteTask
--- PASS: TestTodoCLI (0.08s)
    --- PASS: TestTodoCLI/AddNewTaskFromArguments (0.07s)
    --- PASS: TestTodoCLI/AddNewTaskFromSTDIN (0.00s)
    --- PASS: TestTodoCLI/ListTasks (0.00s)
    --- PASS: TestTodoCLI/CompleteTask (0.00s)
PASS
Cleaning up...
ok  	pragprog.com/rggo/interacting/todo/cmd/todo	0.314s
```

A minor quibble absolutely; but one that annoyed me enough to want to do something about it.

Since `go test` very nicely provides json output what about using it directly?

```
$ go test -v -json
```

```json
{"Time":"2022-03-16T13:50:18.170841-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Output":"Building tool...\n"}
{"Time":"2022-03-16T13:50:18.334313-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Output":"Running tests...\n"}
{"Time":"2022-03-16T13:50:18.334414-04:00","Action":"run","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI"}
{"Time":"2022-03-16T13:50:18.334422-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI","Output":"=== RUN   TestTodoCLI\n"}
{"Time":"2022-03-16T13:50:18.334473-04:00","Action":"run","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromArguments"}
{"Time":"2022-03-16T13:50:18.33448-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromArguments","Output":"=== RUN   TestTodoCLI/AddNewTaskFromArguments\n"}
{"Time":"2022-03-16T13:50:18.495296-04:00","Action":"run","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromSTDIN"}
{"Time":"2022-03-16T13:50:18.495322-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromSTDIN","Output":"=== RUN   TestTodoCLI/AddNewTaskFromSTDIN\n"}
{"Time":"2022-03-16T13:50:18.499036-04:00","Action":"run","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/ListTasks"}
{"Time":"2022-03-16T13:50:18.499055-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/ListTasks","Output":"=== RUN   TestTodoCLI/ListTasks\n"}
{"Time":"2022-03-16T13:50:18.50366-04:00","Action":"run","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/CompleteTask"}
{"Time":"2022-03-16T13:50:18.503676-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/CompleteTask","Output":"=== RUN   TestTodoCLI/CompleteTask\n"}
{"Time":"2022-03-16T13:50:18.513055-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI","Output":"--- PASS: TestTodoCLI (0.18s)\n"}
{"Time":"2022-03-16T13:50:18.513088-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromArguments","Output":"    --- PASS: TestTodoCLI/AddNewTaskFromArguments (0.16s)\n"}
{"Time":"2022-03-16T13:50:18.513097-04:00","Action":"pass","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromArguments","Elapsed":0.16}
{"Time":"2022-03-16T13:50:18.513105-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromSTDIN","Output":"    --- PASS: TestTodoCLI/AddNewTaskFromSTDIN (0.00s)\n"}
{"Time":"2022-03-16T13:50:18.513109-04:00","Action":"pass","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/AddNewTaskFromSTDIN","Elapsed":0}
{"Time":"2022-03-16T13:50:18.513113-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/ListTasks","Output":"    --- PASS: TestTodoCLI/ListTasks (0.00s)\n"}
{"Time":"2022-03-16T13:50:18.51313-04:00","Action":"pass","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/ListTasks","Elapsed":0}
{"Time":"2022-03-16T13:50:18.513134-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/CompleteTask","Output":"    --- PASS: TestTodoCLI/CompleteTask (0.01s)\n"}
{"Time":"2022-03-16T13:50:18.513139-04:00","Action":"pass","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI/CompleteTask","Elapsed":0.01}
{"Time":"2022-03-16T13:50:18.513142-04:00","Action":"pass","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Test":"TestTodoCLI","Elapsed":0.18}
{"Time":"2022-03-16T13:50:18.513146-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Output":"PASS\n"}
{"Time":"2022-03-16T13:50:18.51315-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Output":"Cleaning up...\n"}
{"Time":"2022-03-16T13:50:18.513938-04:00","Action":"output","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Output":"ok  \tpragprog.com/rggo/interacting/todo/cmd/todo\t0.696s\n"}
{"Time":"2022-03-16T13:50:18.513983-04:00","Action":"pass","Package":"pragprog.com/rggo/interacting/todo/cmd/todo","Elapsed":0.696}
```

Definitely usable! And the outputs are ordered correctly so it's even weirder that `gotestfmt` groups them.

## A `gotestfmt` replacement using `jq`

[`jq-go-tests`](https://github.com/sdball/dotfiles/blob/main/bin/jq-go-tests) is a `gotestfmt` replacement using `jq` and `sed` to get something human friendly but still ordered correctly. It's not as fancy as `gotestfmt` pulling out the package and formatting but it's certainly good enough for me.

```
$ go test -v -json | jq-go-tests
Building tool...
Running tests...
✅ TestTodoCLI (0.24s)
    ✅ TestTodoCLI/AddNewTaskFromArguments (0.22s)
    ✅ TestTodoCLI/AddNewTaskFromSTDIN (0.00s)
    ✅ TestTodoCLI/ListTasks (0.00s)
    ✅ TestTodoCLI/CompleteTask (0.01s)
PASS
Cleaning up...
ok  	pragprog.com/rggo/interacting/todo/cmd/todo	0.822s
```

If you don't want to click through to the code `jq-go-tests` is simply

```bash
#!/usr/bin/env bash

jq -r '.Output // ""' | rg -v "=== RUN" | sed -e '/^$/d' -e "s/--- PASS/✅/" -e "s/--- FAIL/❌/"
```

I could spend some time making `jq` do more of the lifting and formatting but this is definitely already good enough that I'm already using it as my default Go test output.
