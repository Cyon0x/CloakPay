# Vendored circomlib fragments

These files are copied verbatim from `circomlib@2.0.5` (`circuits/`):

- `poseidon.circom`, `poseidon_constants.circom`
- `mux1.circom`
- `bitify.circom`
- `comparators.circom`

They are vendored rather than imported because the `circom2` compiler shipped
on npm does not honour the `-l` include path, so includes must be relative.

Vendoring also pins the exact Poseidon round constants the deployed verifier and
the on-chain `PoseidonT3` library were built against. Do not edit them: a change
here silently invalidates every existing commitment and root.

License: circomlib is GPL-3.0.
