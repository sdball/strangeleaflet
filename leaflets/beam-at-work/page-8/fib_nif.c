// Page 1's busy loop in C, as a NIF: the same slow recursive Fibonacci.
// fib is the ordinary kind, run on the calling process's scheduler;
// dirty_fib is marked CPU-bound dirty, so the BEAM runs it on a dirty
// CPU scheduler instead.
#include <erl_nif.h>

static long fib(int n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

static ERL_NIF_TERM fib_nif(ErlNifEnv *env, int argc, const ERL_NIF_TERM argv[]) {
  int n;
  if (!enif_get_int(env, argv[0], &n)) return enif_make_badarg(env);
  return enif_make_long(env, fib(n));
}

static ErlNifFunc funcs[] = {
  {"fib", 1, fib_nif, 0},
  {"dirty_fib", 1, fib_nif, ERL_NIF_DIRTY_JOB_CPU_BOUND},
};

ERL_NIF_INIT(Elixir.Fib, funcs, NULL, NULL, NULL, NULL)
