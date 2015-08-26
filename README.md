#subtext

HTTP payload parser.

subtext parses the request body and exposes it in a callback.

[![Build Status](https://secure.travis-ci.org/hapijs/subtext.png)](http://travis-ci.org/hapijs/subtext)

Lead Maintainer - [Eran Hammer](https://github.com/hueniverse)


## Example

```javascript
var Http = require('http');
var Subtext = require('subtext');

Http.createServer(function (request, response) {

    Subtext.parse(request, null, { parse: true, output: 'data' }, function (err, parsed) {

        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('Payload contains: ' + parsed.payload.toString());
    });

}).listen(1337, '127.0.0.1');

console.log('Server running at http://127.0.0.1:1337/');

```

## Documentation

`Subtext.parse(request, tap, options, callback)`

`options` are the following:
- `parse`: (required) boolean
- `output`: (required) 'data', 'stream', 'file'
- `maxBytes`: int
- `override`: string
- `defaultContentType`: string
- `allow`: string, only allow a certain media type
- `timeout`: integer, limit time spent buffering request
- `qs`: object, to pass into the qs module
- `uploads`: string, directory for file uploads
