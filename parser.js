const P = require('parsimmon');

function lineWithError(input, i, message) {
  let endOfLine = i + input.slice(i).indexOf('\n');
  let lines = input.slice(0, endOfLine).split('\n');
  let lineno = lines.length;

  return (
    message +
    '\n  Line ' +
    lineno +
    ': ' +
    lines[lines.length - 1].replace(/^\s*/, '') +
    '\n'
  );
}

function interpretEscapes(str) {
  let escapes = {
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t'
  };
  return str.replace(/\\(u[0-9a-fA-F]{4}|[^u])/, (_, escape) => {
    let type = escape.charAt(0);
    let hex = escape.slice(1);
    if (type === 'u') {
      return String.fromCharCode(parseInt(hex, 16));
    }
    if (escapes.hasOwnProperty(type)) {
      return escapes[type];
    }
    return type;
  });
}

function binaryLeft(operatorsParser, nextParser) {
  return P.seqMap(
    nextParser,
    P.seq(operatorsParser, nextParser).many(),
    (first, rest) => {
      return rest.reduce((acc, ch) => {
        let [op, another] = ch;
        return {
          type: 'BinOp',
          op: op,
          left: acc,
          right: another
        };
      }, first);
    }
  );
}

let DMPL = P.createLanguage({
  // This includes comments as whitespace
  Whitespace: r => P.regex(/^(\s*(\/\/.*)?\s*)*/),

  // Statements
  Scheme: r => {
    return P.seq(P.string('#'), r.Object, P.optWhitespace)
      .map(x => x[1])
      .fallback('');
  },

  If: r => {
    return P.seq(
      r.Scheme,
      P.string('if'),
      P.whitespace,
      r.Expression,
      P.optWhitespace,
      r.Block,
      P.seq(r.Whitespace, P.string('else'), r.Whitespace)
        .then(r.Block.or(r.If))
        .fallback('')
    ).map(x => {
      let conditions = [
        {
          type: 'ForkBranch',
          condition: x[3],
          body: x[5]
        }
      ];

      if (x[6] !== '') {
        if (x[6].type === 'Fork') {
          conditions = [...conditions, ...x[6].conditions];
        } else {
          conditions = [
            ...conditions,
            {
              type: 'ForkBranch',
              condition: null,
              body: x[6]
            }
          ];
        }
      }

      return {
        type: 'Fork',
        scheme: x[0],
        conditions: conditions
      };
    });
  },

  Fork: r => {
    return P.seq(
      r.Scheme,
      P.string('fork'),
      P.optWhitespace,
      P.string('{'),
      r.Condition.many(),
      P.string('}')
    ).map(x => ({
      type: 'Fork',
      scheme: x[0],
      conditions: x[4].map(cond => {
        if (cond[0] !== '_' && cond[0][0]) {
          throw new Error(cond[0][0]);
        }

        return {
          type: 'ForkBranch',
          condition: cond[0] === '_' ? null : cond[0][1],
          body: cond[1]
        };
      })
    }));
  },

  Condition: r => {
    return P.seq(
      P.string('_')
        .or(
          P.seq(
            P.string('if')
              .then(
                P((input, i) => {
                  return P.makeSuccess(
                    i,
                    lineWithError(
                      input,
                      i,
                      'conditions do not need an `if`, remove it: '
                    )
                  );
                })
              )
              .skip(P.optWhitespace)
              .fallback(null),
            r.Expression
          )
        )
        .trim(r.Whitespace),
      r.Block.trim(r.Whitespace)
    );
  },

  Input: r => {
    return P.seq(
      P.string('input'),
      P.optWhitespace,
      P.string('->'),
      P.optWhitespace,
      r.Symbol,
      P.optWhitespace,
      P.string('{'),
      P.seq(
        P.string('_')
          .or(r.Expression)
          .trim(r.Whitespace),
        r.Block.trim(r.Whitespace)
      ).many(),
      P.string('}')
    ).map(x => ({
      type: 'Input',
      result: x[4],
      fork: {
        type: 'Fork',
        conditions: x[7].map(cond => ({
          type: 'ForkBranch',
          condition: cond[0] === '_' ? null : cond[0],
          body: cond[1]
        }))
      }
    }));
  },

  Await: r => {
    return P.seq(
      P.string('await'),
      P.whitespace,
      r.Expression,
      P.optWhitespace,
      r.Block
    ).map(x => ({
      type: 'Await',
      condition: x[2],
      body: x[4]
    }));
  },

  Once: r => {
    return P.seq(P.string('once'), P.optWhitespace, r.Block).map(x => ({
      type: 'Once',
      body: x[2]
    }));
  },

  Act: r => {
    return P.seq(P.string('act'), P.whitespace, r.Expression).map(x => ({
      type: 'Act',
      value: x[2]
    }));
  },

  Hop: r => {
    return P.seq(P.string('hop'), P.whitespace, r.Expression).map(x => ({
      type: 'Hop',
      value: x[2]
    }));
  },

  Pop: r => {
    return P.seq(P.string('pop'), P.whitespace, r.Expression).map(x => ({
      type: 'Pop',
      value: x[2]
    }));
  },

  Set: r => {
    // Double check array-size of 2
    return P.seq(
      r.CSArray,
      P.optWhitespace,
      P.string('='),
      P.optWhitespace,
      r.Expression
    ).map(x => ({
      type: 'Set',
      target: x[0],
      value: x[4]
    }));
  },

  Run: r => {
    return P.seq(
      P.string('run').skip(P.optWhitespace),
      r.Expression.skip(P.optWhitespace),
      P.string('('),
      r.Expression.sepBy(P.string(',')),
      P.string(')').trim(P.optWhitespace),
      P.seq(
        P.string('->'),
        r.Symbol.trim(P.optWhitespace),
        P.string('{'),
        r.Condition.many(),
        P.string('}')
      ).fallback(null)
    ).map(x => {
      let rest = x[5];
      return {
        type: 'Run',
        name: x[1],
        args: x[3],
        result: rest && rest[1],
        fork: rest && {
          type: 'Fork',
          conditions: rest[3].map(cond => ({
            type: 'ForkBranch',
            condition: cond[0] === '_' ? null : cond[0][1],
            body: cond[1]
          }))
        }
      };
    });
  },

  Use: r => {
    return P.seq(
      P.string('use'),
      P.whitespace,
      r.String,
      P.whitespace,
      P.string('import'),
      r.Symbol.trim(P.optWhitespace).sepBy(P.string(','))
    ).map(x => ({
      type: 'Use',
      name: x[2],
      // Stringify the imports
      imports: x[5].map(imp => ({ type: 'Literal', value: imp.name }))
    }));
  },

  Def: r => {
    return P.seq(
      P.string('def'),
      P.whitespace,
      r.Symbol,
      P.optWhitespace,
      P.string('('),
      r.Symbol.trim(P.optWhitespace).sepBy(P.string(',')),
      P.string(')'),
      P.optWhitespace,
      r.Block
    ).map(x => ({
      type: 'Def',
      name: x[2],
      args: x[5],
      body: x[8]
    }));
  },

  // Literals
  Boolean: r => {
    return P.alt(P.string('true'), P.string('false')).map(x => ({
      type: 'Literal',
      value: x === 'true' ? true : false
    }));
  },

  String: r => {
    return P.regexp(/"((?:\\.|.)*?)"/, 1)
      .map(interpretEscapes)
      .desc('string')
      .map(x => ({
        type: 'Literal',
        value: x
      }));
  },

  Number: r => {
    return P.regexp(/(-?)[0-9.]+/)
      .map(Number)
      .desc('number')
      .map(x => ({
        type: 'Literal',
        value: x
      }));
  },

  CSArray: r => {
    return P.seq(r.Whitespace, r.Expression, r.Whitespace)
      .sepBy(P.string(','))
      .map(x => ({
        type: 'CSArray',
        elements: x.map(x => x[1])
      }));
  },

  Array: r => {
    return P.string('[')
      .then(
        P.seq(r.Whitespace, r.Expression, r.Whitespace).sepBy(P.string(','))
      )
      .map(x => ({
        type: 'Array',
        elements: x.map(x => x[1])
      }))
      .skip(P.string(']'));
  },

  Object: r => {
    return P.string('{')
      .then(
        P.seq(
          r.Whitespace,
          r.Symbol,
          P.optWhitespace,
          P.string(':'),
          r.Whitespace,
          r.Expression,
          r.Whitespace
        ).sepBy(P.string(','))
      )
      .map(x => ({
        type: 'Object',
        properties: x.map(prop => ({
          type: 'Property',
          name: prop[1],
          value: prop[5]
        }))
      }))
      .skip(P.string('}'));
  },

  // Variables
  Symbol: function() {
    return P.regexp(/[a-zA-Z_][a-zA-Z0-9_]*/)
      .desc('symbol')
      .map(x => ({
        type: 'Identifier',
        name: x
      }));
  },

  // Operators
  BinOp: r => {
    let ops = [
      P.alt(P.string('*').trim(r.Whitespace), P.string('/').trim(r.Whitespace)),
      P.alt(
        P.string('++').trim(r.Whitespace),
        P.string('+').trim(r.Whitespace),
        P.string('-').trim(r.Whitespace),
        P.string('%').trim(r.Whitespace)
      ),
      P.alt(
        P.string('<=').trim(r.Whitespace),
        P.string('>=').trim(r.Whitespace),
        P.string('==').trim(r.Whitespace),
        P.string('<').trim(r.Whitespace),
        P.string('>').trim(r.Whitespace),
        P.string('!=').trim(r.Whitespace)
      ),
      P.string('in')
        .skip(P.whitespace)
        .trim(r.Whitespace),
      P.string('is')
        .skip(P.whitespace)
        .trim(r.Whitespace),
      P.string('||').trim(r.Whitespace),
      P.string('&&').trim(r.Whitespace)
    ];

    return ops.reduce((parser, opParser) => {
      return binaryLeft(opParser, parser);
    }, r.UnaryOp);
  },

  UnaryOp: r => {
    return P.seq(P.string('!').trim(P.optWhitespace), r.Primary)
      .map(x => ({
        type: 'UnaryOp',
        op: '!',
        target: x[1]
      }))
      .or(r.Primary);
  },

  FunCallPostFix: r => {
    return P.seq(
      P.string('('),
      r.Expression.sepBy(P.string(',')),
      P.string(')')
    ).map(x => ({
      type: 'FunCall',
      // callee will be filled in later in `Primary`
      callee: null,
      args: x[1]
    }));
  },

  MemberPostFix: r => {
    return P.seq(
      P.string('['),
      r.Expression.trim(r.Whitespace),
      P.string(']')
    ).map(x => ({
      type: 'Member',
      // target will be filled in later in `Primary`
      target: null,
      property: x[1]
    }));
  },

  Primary: r => {
    return P.seq(
      P.alt(
        r.String,
        r.Number,
        r.Boolean,
        r.Object,
        r.Array,
        r.Symbol,
        P.seq(
          P.string('('),
          r.Whitespace,
          r.Expression,
          r.Whitespace,
          P.string(')')
        ).map(x => x[2])
      ),
      P.alt(r.MemberPostFix, r.FunCallPostFix).many()
    ).map(([initialExpr, postFixes]) => {
      // Combine the items into a single array and reduce them down
      // into a nested expression
      return postFixes.reduce((acc, item) => {
        if (item.type === 'Member') {
          return { ...item, target: acc };
        } else if (item.type === 'FunCall') {
          return { ...item, callee: acc };
        }
      }, initialExpr);
    });
  },

  // Various forms
  Expression: r => {
    return r.BinOp.trim(r.Whitespace);
  },

  Statement: r => {
    return P.alt(
      r.If,
      r.Fork,
      r.Input,
      r.Await,
      r.Once,
      r.Act,
      r.Hop,
      r.Pop,
      r.Set,
      r.Run,
      r.Use,
      r.Def
    );
  },

  StatementList: r => {
    return r.Statement.trim(r.Whitespace)
      .many()
      .map(x => ({
        type: 'StatementList',
        list: x.map(stmt => stmt)
      }));
  },

  Block: r => {
    return P.string('{')
      .trim(r.Whitespace)
      .then(r.StatementList)
      .skip(P.string('}').trim(r.Whitespace));
  },

  Program: r => {
    return r.StatementList.map(x => ({ type: 'Program', body: x }));
  },

  Test: r => {
    return r.Whitespace;
  }
});

function parse(src) {
  return DMPL.Program.tryParse(src);
}

module.exports = parse;
