const compile = require('./compiler');

describe('Compiler', () => {
  test('if', () => {
    expect(
      compile(`
        if X == 0 {
          act First
        }
        else {
          act Second
        }
    `)
    ).toMatchSnapshot();

    expect(
      compile(`
        if X == 0 {
          act First
        }
        else if X == 1 {
          act Second
        }
        else {
          act DoNothing
        }
    `)
    ).toMatchSnapshot();
  });

  test('fork', () => {
    expect(
      compile(`
      fork {
        X == 0 {
          act First
        }
        X == 1 {
          act Second
        }
        _ {
          act Third
        }
        _ {
          act Fourth
        }
      }
    `)
    ).toMatchSnapshot();

    expect(
      compile(`
      #{depth: 2}
      fork {
        X == 0 {
          act First
        }
        X == 1 {
          act Second
        }
      }
    `)
    ).toMatchSnapshot();
  });

  test('input', () => {
    expect(
      compile(`
      input -> result {
        result == 0 {
          act First
        }
        result == 1 {
          act Second
        }
        _ {
          act Third
        }
      }
    `)
    ).toMatchSnapshot();
  });

  test('await', () => {
    expect(compile('await X == 5 { act Hello }')).toMatchSnapshot();
  });

  test('once', () => {
    expect(compile('once { act Hello }')).toMatchSnapshot();
  });

  test('act', () => {
    expect(compile('act One \n act Two \n act Three')).toMatchSnapshot();
  });

  test('set', () => {
    expect(compile('X = value')).toMatchSnapshot();
    expect(compile('X, Y, Z = value')).toMatchSnapshot();
    expect(compile('a[0]["a"] = 1')).toMatchSnapshot();
    expect(compile('d[a] = 1')).toMatchSnapshot();
  });

  test('pop', () => {
    expect(compile('X = 50 \n pop X')).toMatchSnapshot();
  });

  test('run', () => {
    expect(compile('run "Questions" (foo, bar)')).toMatchSnapshot();
    expect(
      compile(`
      run "Questions" (foo, bar) -> result {
        _ { act result }
      }
    `)
    ).toMatchSnapshot();
    expect(compile('run "MyComponent"')).toMatchSnapshot();
    expect(compile('run "MyComponent" ()')).toMatchSnapshot();
    expect(compile('run "MyComponent" () -> result')).toMatchSnapshot();
    expect(compile(`
      run "MyComponent" () -> _result {
        _ {
            result = _result
        }
      }
    `)).toMatchSnapshot();
  });

  test('use', () => {
    expect(compile('use "Questions" import foo, bar')).toMatchSnapshot();
  });

  test('def', () => {
    expect(
      compile(`
        def Pow(x) {
          pop x * x
        }

        act Pow(5)
    `)
    ).toMatchSnapshot();
  });

  test('comments', () => {
    expect(
      compile(`
        // This is a comment
        if X == 0 {
          // This is another comment
          act First
        }
        else {
          act Second
        }
    `)
    ).toMatchSnapshot();

    expect(
      compile(`
        if X == 0 {
          act 1 +
            // This is a comment
            (4 * 10) /
            // This is another comment
            pow(5)
        }
    `)
    ).toMatchSnapshot();
  });

  test('expressions', () => {
    expect(compile('act X + 3 * 5')).toMatchSnapshot();
    expect(compile('act [1, 2, 3, 4]')).toMatchSnapshot();
    expect(compile('act "string" ++ "string2"')).toMatchSnapshot();
    expect(compile('act 1 < 2 && 3 < 4 || 5 >= 6')).toMatchSnapshot();
    expect(compile('act 1 in [1, 2, 3, 4]')).toMatchSnapshot();
    expect(compile('act funcall({ foo: 1, bar: 2})')).toMatchSnapshot();
    expect(compile('act !TruthyValue')).toMatchSnapshot();
    expect(compile('act exists(TruthyValue)')).toMatchSnapshot();
    expect(compile('X = null')).toMatchSnapshot();

    // Member lookup
    expect(compile('act X[0]')).toMatchSnapshot();
    expect(compile('act X["str"]')).toMatchSnapshot();
  });

  test('init dictionary', () => {
    expect(compile('a = {1: 12, "-1": -1, "a": 11, a: 11}')).toMatchSnapshot();
  });

  test('Planet Trivia example', () => {
    let text = `
      if !exists(Init) {
        Init = true
        WrongCounter = 0
        IsHint1Given = false
        IsHint2Given = false
        IsAnswerGiven = false
        NumHintsGiven = 0
        Question = "What's the biggest planet?"
        CA = "planet.jupiter"
        CAResponse = "Exactly!"
        WA1 = "planet"
        WA1Response = "Nope. That's not the biggest"
        WA2 = "nonplanet"
        WA2Response = "That's not a planet"
        Hint1 = "It has a big red spot"
        Hint2 = "It's name begins with the letter J"
        Answer = "The biggest planet is Jupiter"
        HintAnnouncement = "Here's a hint"
      }
      else {
        #{depth: 3}
        fork {
          WrongCounter <= 3 && !IsAnswerGiven  {
            act Question
            input -> result {
              result == CA {
                act CAResponse
                IsAnswerGiven = true
              }
              result == WA1 {
                act WA1Response
                WrongCounter = WrongCounter + 1
              }
              result == WA2 {
                act WA2Response
                WrongCounter = WrongCounter + 1
              }
              _ {
                WrongCounter = WrongCounter + 1
              }
            }
          }
          !IsHint1Given && WrongCounter == 1 {
            act HintAnnouncement
            act Hint1
            IsHint1Given = true
          }
          !IsHint2Given && WrongCounter == 2 {
            act HintAnnouncement
            act Hint2
            IsHint2Given = true
          }
          !IsAnswerGiven && WrongCounter == 3 {
            act Answer
            IsAnswerGiven = true
          }
        }
      }
    `;

    expect(compile(text)).toMatchSnapshot();
  });

  test('chaining member lookups and function calls', () => {
    expect(compile('x = d["a"]["b"]["c"]')).toMatchSnapshot();
    expect(compile('x = d(a)(b)(c)')).toMatchSnapshot();
    expect(compile('x = d(a)["b"](c)["d"]')).toMatchSnapshot();
  });

  test('builtin pref function', () => {
    let output = compile(`
        utility = [
            pref({meeting_scheduled: true}),
            pref({meeting_scheduled: true, schedule_conflict: false}),
            pref({meeting_scheduled: true, schedule_conflict: false}, ["schedule_conflict"]),
            pref({polite: true, refuse_counter: 0}, ["refuse_counter"]),
            pref({int: 10, int2: 3})
        ]
    `);
    expect(output).toMatchSnapshot();
  });

  test('hop', () => {
    let output = compile(`
      hop 3
    `);
    expect(output).toMatchSnapshot();
  });
});
