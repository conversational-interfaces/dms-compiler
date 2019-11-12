module.exports = {
  entry: "./compiler.js",
  output: {
      filename: "bundle.js",
      libraryTarget: 'var',
      library: 'Compiler'
  }
}
