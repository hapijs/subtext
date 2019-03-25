# subtext

HTTP payload parser.

[![Build Status](https://travis-ci.org/hapijs/subtext.svg?branch=v5-commercial)](https://travis-ci.org/hapijs/subtext)

## License

This version of the package requires a commercial license. You may not use, copy, or distribute it without first acquiring a commercial license from Sideway Inc. Using this software without a license is a violation of US and international law. To obtain a license, please contact [sales@sideway.com](mailto:sales@sideway.com). The open source version of this package can be found [here](https://github.com/hapijs/subtext).

## Example

```javascript
const Http = require('http');
const Subtext = require('subtext');

Http.createServer((request, response) => {

    Subtext.parse(request, null, { parse: true, output: 'data' }, (err, parsed) => {

        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('Payload contains: ' + parsed.payload.toString());
    });

}).listen(1337, '127.0.0.1');

console.log('Server running at http://127.0.0.1:1337/');

```

## API

See the [API Reference](API.md)


### Warning for subtext on Node below v4.3.2

A Node bug in versions below Node v4.3.2 meant that the `Buffer.byteLength` function did not work correctly, and as such, using `maxBytes` options with multipart payloads will mistake the file buffer size to be incorrectly as bigger than it is. Your options here are either to upgrade to Node version greater than v4.3.2 or increase maxBytes to allow some error in calculation. [Background info in this issue here](https://github.com/hapijs/subtext/pull/32).
