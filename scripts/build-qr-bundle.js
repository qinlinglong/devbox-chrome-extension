const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'vendor', 'qrcode');
const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.js'));
const modules = files.map((file) => {
  const source = fs.readFileSync(path.join(sourceDir, file), 'utf8');
  return `'${file}':function(module,exports,require){\n${source}\n}`;
}).join(',\n');
const output = `/* Bundled local QR encoder. Original MIT license headers are preserved in vendor/qrcode. */\n(() => {\n  const modules={${modules}},cache={};\n  const load=(name)=>{const raw=name.replace(/^\.\\//,'');const key=raw.endsWith('.js')?raw:raw+'.js';if(cache[key])return cache[key].exports;const factory=modules[key];if(!factory)throw new Error('QR module not found: '+key);const module={exports:{}};cache[key]=module;factory(module,module.exports,(request)=>load(request));return module.exports};\n  window.DevboxQRCode=load('index.js');\n})();\n`;
fs.writeFileSync(path.join(root, 'vendor', 'qr-bundle.js'), output);
