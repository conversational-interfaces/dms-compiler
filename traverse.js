function traverse(node, fn) {
  fn(node);

  Object.keys(node).forEach(key => {
    let childNode = node[key];

    if (childNode) {
      if (Array.isArray(childNode)) {
        childNode.forEach(n => traverse(n, fn));
      } else if (node[key].type) {
        traverse(node[key], fn);
      }
    }
  });
}

function renameIdentifier(body, from, to) {
  traverse(body, node => {
    if (node.type === 'Identifier' && node.name == from) {
      node.name = to;
    }
  });
}

module.exports = {
  traverse,
  renameIdentifier
};
