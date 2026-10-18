'use strict';
const path = require('node:path');
const { Transformer } = require('@parcel/plugin');
const { compileWeb } = require('./web');

module.exports = new Transformer({
  async transform({ asset }) {
    const source = await asset.getCode();
    let code = compileWeb(source);
    let runtimePath = path.relative(
      path.dirname(asset.filePath),
      path.join(__dirname, 'web-runtime.js')
    );
    runtimePath = runtimePath.split(path.sep).join('/');
    if (!runtimePath.startsWith('.')) {
      runtimePath = './' + runtimePath;
    }

    code = `import { web } from ${JSON.stringify(runtimePath)};\n` + code;

    asset.type = 'js';
    asset.setCode(code);

    return [asset];
  }
});