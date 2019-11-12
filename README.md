# High-level syntax for DMPL

This provides a compiler than translates [high-level DM Script syntax](https://conversational-interfaces.github.io/dms/) to [DMPL JSON](https://w3c.github.io/dmpl/).

The language is bracket-based, making the structure clear and easy to parse.
The syntax is close to current mainstream languages, so it's familiar,
including infix operators, function calls, and if/else.
Frequently used statements, such as `input` and `run`, have a nice terse-ness to them.


To use the CLI, run `yarn` to install dependencies and then run:

```
./bin/compile <file>
```

You can use a file in `examples` to see the output, like `./bin/compile examples/planet-trivia.dmpl`.

To use the API, require the compiler and pass it a source string:

```
const compile = require('./compiler');

console.log(compile('X = "simple program"'))
```

The compiler uses [snapshot testing](https://jestjs.io/docs/en/snapshot-testing) to ensure correctness. The tests in `compiler.test.js` generate snapshots of the output which can be seen in the `__snapshots__` directory. This provides a nice way to see the compiler output and verify that any changes in the output is intentional.

## Parser

The parser uses the library [Parsimmon](https://github.com/jneen/parsimmon) for parsing. It provides parser combinators to construct a language out of many small parsers. The top-level parser is `Program` and it will break down the syntax from there.

To generate an output value, each parser uses `map` to map the output to an AST node. It takes a list of things matched by the parser combinator as an array and you can extract values from it.

You can use any of the [builtin parsers](https://github.com/jneen/parsimmon/blob/master/API.md) from Parsimmon to create a parser, like `P.string('+')`, or use an existing parser from the language by reading off the value given to the parser, usually `r`, like `r.Expression`.

Reading the existing parsers should give you a good idea about how to work with it. The syntax can be tweaked by changing the parsers to match different syntax, and new forms can be added by adding new parsers to the object passed into `P.createLanguage`.

## Compiler

The compiler takes an AST and compiles it down to the JSON
representation. It recursively calls itself to compile down
expressions and statements. Each type of node implements its own compile function named after its type, for example `compileUse`.

The top-level function is `compile`, so you can recursively compile expressions by doing things like `[node.target.name, this.compile(node.expression)]`. When adding a new form, you need to implement a new `compile*` method on the `Compiler` class.

## Troubleshoot

curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -

apt-get install -y nodejs


## Credits

Original author: James Long

Current maintainer: Nishant Shukla