
### `Subtext.parse(request, tap, options, callback)`

Parses the request body and exposes it in a callback.

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
- `decoders`: an object mapping content-encoding names to their corresponding decoder functions
- `compression`: an object mapping content-encoding names to their corresponding options passed to the `decoders` functions