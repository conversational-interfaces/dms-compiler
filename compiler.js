const parse = require('./parser');
const { renameIdentifier } = require('./traverse');

function pref(node, compile) {
  let flipKeys =
    node.args.length > 1
      ? node.args[1].elements.map(el => {
          if (typeof el.value !== 'string') {
            throw new Error('pref array must only contain strings');
          }
          return el.value;
        })
      : node.args[0].properties.map(prop => prop.name.name);

  function flip(literal, dir) {
    let { value } = literal;
    if (typeof value === 'boolean') {
      return { ...literal, value: !value };
    } else if (typeof value === 'number') {
      let spread = value === 0 ? 1 : value * 3;
      return {
        ...literal,
        value: dir === 'up' ? value + spread : value - spread
      };
    }
  }

  function flipProps(obj, dir) {
    return {
      ...obj,
      properties: obj.properties.map(prop => {
        if (
          typeof prop.value.value !== 'boolean' &&
          typeof prop.value.value !== 'number'
        ) {
          throw new Error(
            'pref must be passed an object with static true/false values or numbers'
          );
        }

        if (flipKeys.includes(prop.name.name)) {
          return {
            ...prop,
            value: flip(prop.value, dir)
          };
        }
        return prop;
      })
    };
  }

  let hasNumber = node.args[0].properties.find(
    prop => typeof prop.value.value === 'number'
  );

  if (hasNumber) {
    return compile({
      type: 'Spread',
      elements: [
        ['', compile(node.args[0]), compile(flipProps(node.args[0], 'up'))],
        ['', compile(node.args[0]), compile(flipProps(node.args[0], 'down'))]
      ]
    });
  }
  return ['', compile(node.args[0]), compile(flipProps(node.args[0]))];
}

class Compiler {
  constructor(src) {
    this.src = src;
    this.ast = parse(src);
  }

  compileFork(node) {
    let fork = {
      '@fork': node.conditions.map(n => {
        let branch = this.compile(n.body);
        if (n.condition) {
          branch.if = this.compile(n.condition);
        }
        return branch;
      })
    };

    if (node.scheme) {
      fork.scheme = this.compileObject(node.scheme);
    }

    return fork;
  }

  compileInput(node) {
    renameIdentifier(node.fork, node.result.name, '_nlu');

    let body = this.compileFork(node.fork);
    body.await = ['input'];
    return body;
  }

  compileAwait(node) {
    let body = this.compile(node.body);
    body.await = this.compile(node.condition);
    return body;
  }

  compileOnce(node) {
    let body = this.compile(node.body);
    body.once = true;
    return body;
  }

  compileAct(node) {
    return { '@act': this.compile(node.value) };
  }

  compileHop(node) {
    return { '@hop': this.compile(node.value) };
  }

  compilePop(node) {
    return { '@pop': this.compile(node.value) };
  }

  compileStatementList(node) {
    return { '@do': node.list.map(n => this.compile(n)) };
  }

  compileLiteral(node) {
    if (typeof node.value === 'string') {
      return '`' + node.value + '`';
    }
    return node.value;
  }

  compileArray(node) {
    let array = ['', ...node.elements.map(n => this.compile(n))];

    return array.reduce((newArray, el) => {
      // A `null` node might exist because the "null" literal turns
      // into a real `null`
      if (el && el.__spread) {
        return [...newArray, ...el.elements];
      }
      newArray.push(el);
      return newArray;
    }, []);
  }

  compileSpread(node) {
    // Spread is simply a pass-through that is processed by
    // `compileArray`, but we explicitly mark it so the compiler can
    // check for this value. Checking the `type` might conflict with
    // another runtime value so we want to guarantee no conflicts
    return { ...node, __spread: true };
  }

  compileStringArray(node) {
    return ['', ...node.elements.map(n => '`' + this.compile(n) + '`')];
  }

  compileEditReference(node, newValue) {
    return ["`edit`", this.compile(node.target), this.compile(newValue), ...node.keys.map(n => this.compile(n))];
  }

  compileObject(node) {
    return node.properties.reduce((obj, prop) => {
      let key = this.compileLiteral(prop.name);
      obj[key] = this.compile(prop.value);
      return obj;
    }, {});
  }

  compileSet(node) {
    let target, value;
    if (node.target.type === 'Identifier') {
      target = '`' + node.target.name + '`';
      value = this.compile(node.value);
    } else if (node.target.type === 'EditReference') {
      target = '`' +  this.compile(node.target.target) + '`';
      value = this.compileEditReference(node.target, node.value);
    } else { // CSArray
      target = this.compileStringArray(node.target);
      if (target.length == 2) {
        target = target[1];
      }
      value = this.compile(node.value);
    }

    return {
      '@set': target,
      val: value
    };
  }

  compileRun(node) {
    let body = null;
    if (node.result) {
      if (node.fork) {
        renameIdentifier(node.fork, node.result.name, '_return');
      } else {
        node.fork = {
          "type": "Fork",
          "conditions": [
            {
              "type": "ForkBranch",
              "body": {
                "type": "StatementList",
                "list": [{
                  "type": "Set",
                  "target": {
                    "type": "CSArray",
                    "elements": [{
                      "type": "Identifier",
                      "name": node.result.name
                    }]
                  },
                  "value": {
                    "type": "Identifier", "name": "_return"
                  }
                }]
              }
            }]
        };
      }
      body = this.compileFork(node.fork);
      body.await = ['return'];
    }

    return {
      '@do': [
        {
          '@run': this.compile(node.name),
          args: ['', ...node.args.map(n => this.compile(n))]
        },
        body
      ].filter(Boolean)
    };
  }

  compileUse(node) {
    return {
      '@use': this.compile(node.name),
      import: ['', ...node.imports.map(n => this.compile(n))]
    };
  }

  compileDef(node) {
    return {
      '@def': [
        '',
        '`' + this.compile(node.name) + '`',
        ...node.args.map(arg => '`' + arg.name + '`')
      ],
      val: this.compile(node.body)
    };
  }

  compileBinOp(node) {
    return [node.op == 'is' ? '==' : node.op, this.compile(node.left), this.compile(node.right)];
  }

  compileUnaryOp(node) {
    return [node.op, this.compile(node.target)];
  }

  compileFunCall(node) {
    if (node.callee.type === 'Identifier') {
      // Builtin functions
      switch (node.callee.name) {
        case 'exists':
          return ['?', this.compile(node.args[0])];

        case 'pref':
          return pref(node, this.compile.bind(this));
      }
    }

    return [this.compile(node.callee), ...node.args.map(n => this.compile(n))];
  }

  compileMember(node) {
    return ['get', this.compile(node.property), this.compile(node.target)];
  }

  compileIdentifier(node) {
    // null is a special identifer that should be the literal null
    return node.name === 'null' ? null : node.name;
  }

  compileProgram(node) {
    return this.compile(node.body);
  }

  compile(node) {
    if (!node || !node.type) {
      throw new Error('Invalid node: ' + JSON.stringify(node));
    }

    let method = this['compile' + node.type];
    if (!method) {
      throw new Error('Unknown node type: ' + JSON.stringify(node));
    }
    return method.call(this, node);
  }

  getSource() {
    return this.compile(this.ast);
  }
}

function compile(src) {
  let compiler = new Compiler(src);
  let dmpl = compiler.getSource();

  // if special structure detected, perform minor optimization/cleanup
  if (dmpl['@do'] && dmpl['@do'].length === 1 &&
    dmpl['@do'][0]['@fork'] && dmpl['@do'][0]['@fork'].length === 1) {
    return dmpl['@do'][0]['@fork'][0];
  }

  return dmpl;
}

module.exports = compile;
