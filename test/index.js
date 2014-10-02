// Load modules

var Fs = require('fs');
var Http = require('http');
var Path = require('path');
var Stream = require('stream');
var Zlib = require('zlib');
var FormData = require('form-data');
var Hoek = require('hoek');
var Lab = require('lab');
var Subtext = require('..');
var Wreck = require('wreck');


// Declare internals

var internals = {};


// Test shortcuts

var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var expect = Lab.expect;


describe('parse()', function () {

    it('returns a raw body', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {};

        Subtext.parse(request, null, { parse: false, output: 'data' }, function (err, parsed) {

            expect(err).to.not.exist;
            expect(parsed.mime).to.equal('application/json');
            expect(Buffer.isBuffer(parsed.payload)).to.be.true;
            expect(parsed.payload.toString()).to.equal(payload);
            done();
        });
    });

    it('returns a parsed body', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {};

        Subtext.parse(request, null, { parse: true, output: 'data' }, function (err, parsed) {

            expect(err).to.not.exist;
            expect(parsed.mime).to.equal('application/json');
            expect(parsed.payload).to.deep.equal(JSON.parse(payload));
            done();
        });
    });

    it('returns a parsed body (json-derived media type)', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {
            'content-type': 'application/json-patch+json'
        };

        Subtext.parse(request, null, { parse: true, output: 'data' }, function (err, parsed) {

            expect(err).to.not.exist;
            expect(parsed.mime).to.equal('application/json-patch+json');
            expect(parsed.payload).to.deep.equal(JSON.parse(payload));
            done();
        });
    });

    it('errors on invalid content type header', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {
            'content-type': 'steve'
        };

        Subtext.parse(request, null, { parse: true, output: 'data' }, function (err, parsed) {

            expect(err).to.exist;
            expect(err.message).to.equal('Invalid content-type header');
            done();
        });
    });

    it('errors on unsupported content type', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {
            'content-type': 'james/bond'
        };

        Subtext.parse(request, null, { parse: true, output: 'data' }, function (err, parsed) {

            expect(err).to.exist;
            expect(err.message).to.equal('Unsupported Media Type');
            done();
        });
    });

    it('errors when content-length header greater than maxBytes', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {
            'content-length': '50'
        };

        Subtext.parse(request, null, { parse: false, output: 'data', maxBytes: 10 }, function (err, parsed) {

            expect(err).to.exist;
            expect(err.message).to.equal('Payload content length greater than maximum allowed: 10');
            done();
        });
    });

    it('peeks at the unparsed stream of a parsed body', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {};

        var raw = '';
        var tap = new Stream.Transform();
        tap._transform = function (chunk, encoding, callback) {

            raw += chunk.toString();
            this.push(chunk, encoding);
            callback();
        };

        Subtext.parse(request, tap, { parse: true, output: 'data' }, function (err, parsed) {

            expect(err).to.not.exist;
            expect(parsed.payload).to.deep.equal(JSON.parse(payload));
            expect(raw).to.equal(payload);
            done();
        });
    });

    it('saves file', function (done) {

        var request = Wreck.toReadableStream('payload');
        request.headers = {};

        Subtext.parse(request, null, { parse: false, output: 'file' }, function (err, parsed) {

            expect(err).to.not.exist;

            var receivedContents = Fs.readFileSync(parsed.payload.path);
            Fs.unlinkSync(parsed.payload.path);
            expect(receivedContents.toString()).to.equal('payload');
            done();
        });
    });

    it('saves a file after content decoding', function (done) {

        var path = Path.join(__dirname, './file/image.jpg');
        var sourceContents = Fs.readFileSync(path);
        var stats = Fs.statSync(path);

        Zlib.gzip(sourceContents, function (err, compressed) {

            var request = Wreck.toReadableStream(compressed);
            request.headers = {
                'content-encoding': 'gzip'
            };

            Subtext.parse(request, null, { parse: true, output: 'file' }, function (err, parsed) {

                expect(err).to.not.exist;

                var receivedContents = Fs.readFileSync(parsed.payload.path);
                Fs.unlinkSync(parsed.payload.path);
                expect(receivedContents).to.deep.equal(sourceContents);
                expect(parsed.payload.bytes).to.equal(stats.size);
                done();
            });
        });
    });

    it('saves a file ignoring content decoding when parse is false', function (done) {

        var path = Path.join(__dirname, './file/image.jpg');
        var sourceContents = Fs.readFileSync(path);

        Zlib.gzip(sourceContents, function (err, compressed) {

            var request = Wreck.toReadableStream(compressed);
            request.headers = {
                'content-encoding': 'gzip'
            };

            Subtext.parse(request, null, { parse: false, output: 'file' }, function (err, parsed) {

                expect(err).to.not.exist;

                var receivedContents = Fs.readFileSync(parsed.payload.path);
                Fs.unlinkSync(parsed.payload.path);
                expect(receivedContents).to.deep.equal(compressed);
                done();
            });
        });
    });

    it('errors on invalid upload directory (parse false)', function (done) {

        var request = Wreck.toReadableStream('payload');
        request.headers = {};

        Subtext.parse(request, null, { parse: false, output: 'file', uploads: '/a/b/c/no/such/folder' }, function (err, parsed) {

            expect(err).to.exist;
            expect(err.message).to.contain('ENOENT');
            done();
        });
    });

    it('errors on invalid upload directory (parse true)', function (done) {

        var request = Wreck.toReadableStream('payload');
        request.headers = {};

        Subtext.parse(request, null, { parse: true, output: 'file', uploads: '/a/b/c/no/such/folder' }, function (err, parsed) {

            expect(err).to.exist;
            expect(err.message).to.contain('ENOENT');
            done();
        });
    });

    it('processes application/octet-stream', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {
            'content-type': 'application/octet-stream'
        };

        Subtext.parse(request, null, { parse: true, output: 'data' }, function (err, parsed) {

            expect(err).to.not.exist;
            expect(parsed.mime).to.equal('application/octet-stream');
            expect(Buffer.isBuffer(parsed.payload)).to.be.true;
            expect(parsed.payload.toString()).to.equal(payload);
            done();
        });
    });

    it('overrides content-type', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {
            'content-type': 'text/plain'
        };

        Subtext.parse(request, null, { parse: true, output: 'data', override: 'application/json' }, function (err, parsed) {

            expect(err).to.not.exist;
            expect(parsed.mime).to.equal('application/json');
            expect(parsed.payload).to.deep.equal(JSON.parse(payload));
            done();
        });
    });

    it('returns a parsed text payload', function (done) {

        var payload = '{"x":"1","y":"2","z":"3"}';
        var request = Wreck.toReadableStream(payload);
        request.headers = {
            'content-type': 'text/plain'
        };

        Subtext.parse(request, null, { parse: true, output: 'data' }, function (err, parsed) {

            expect(err).to.not.exist;
            expect(parsed.mime).to.equal('text/plain');
            expect(parsed.payload).to.deep.equal(payload);
            done();
        });
    });

    describe('parse mode', function () {

        it('returns 200 on text mime type when allowed', function (done) {

            var textHandler = function (request, reply) {

                reply(request.payload + '+456');
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/textOnly', config: { handler: textHandler, payload: { allow: 'text/plain' } } });

            server.inject({ method: 'POST', url: '/textOnly', payload: 'testing123', headers: { 'content-type': 'text/plain' } }, function (res) {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.equal('testing123+456');
                done();
            });
        });

        it('returns 415 on non text mime type when disallowed', function (done) {

            var textHandler = function (request, reply) {

                reply(request.payload + '+456');
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/textOnly', config: { handler: textHandler, payload: { allow: 'text/plain' } } });

            server.inject({ method: 'POST', url: '/textOnly', payload: 'testing123', headers: { 'content-type': 'application/octet-stream' } }, function (res) {

                expect(res.statusCode).to.equal(415);
                done();
            });
        });

        it('returns 200 on text mime type when allowed (array)', function (done) {

            var textHandler = function (request, reply) {

                reply(request.payload + '+456');
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/textOnlyArray', config: { handler: textHandler, payload: { allow: ['text/plain'] } } });

            server.inject({ method: 'POST', url: '/textOnlyArray', payload: 'testing123', headers: { 'content-type': 'text/plain' } }, function (res) {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.equal('testing123+456');
                done();
            });
        });

        it('returns 415 on non text mime type when disallowed (array)', function (done) {

            var textHandler = function (request, reply) {

                reply(request.payload + '+456');
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/textOnlyArray', config: { handler: textHandler, payload: { allow: ['text/plain'] } } });

            server.inject({ method: 'POST', url: '/textOnlyArray', payload: 'testing123', headers: { 'content-type': 'application/octet-stream' } }, function (res) {

                expect(res.statusCode).to.equal(415);
                done();
            });
        });

        it('parses application/x-www-form-urlencoded', function (done) {

            var server = new Hapi.Server();

            server.route({
                method: 'POST',
                path: '/',
                handler: function (request, reply) {

                    reply('got ' + request.payload.x);
                }
            });

            server.inject({ method: 'POST', url: '/', payload: 'x=abc', headers: { 'content-type': 'application/x-www-form-urlencoded' } }, function (res) {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.equal('got abc');
                done();
            });
        });

        it('parses application/x-www-form-urlencoded with arrays', function (done) {

            var server = new Hapi.Server();

            server.route({
                method: 'POST',
                path: '/',
                handler: function (request, reply) {

                    reply(request.payload.x.y + request.payload.x.z);
                }
            });

            server.inject({ method: 'POST', url: '/', payload: 'x[y]=1&x[z]=2', headers: { 'content-type': 'application/x-www-form-urlencoded' } }, function (res) {

                expect(res.statusCode).to.equal(200);
                expect(res.result).to.equal('12');
                done();
            });
        });
    });

    describe('unzip', function () {

        it('errors on malformed payload', function (done) {

            var payload = '7d8d78347h8347d58w347hd58w374d58w37h5d8w37hd4';

            var handler = function () {

                throw new Error('never called');
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/', config: { handler: handler } });

            server.inject({ method: 'POST', url: '/', payload: payload, headers: { 'content-encoding': 'gzip' } }, function (res) {

                expect(res.result).to.exist;
                expect(res.result.statusCode).to.equal(400);
                done();
            });
        });

        it('errors on malformed payload (gunzip only)', function (done) {

            var payload = '7d8d78347h8347d58w347hd58w374d58w37h5d8w37hd4';

            var handler = function () {

                throw new Error('never called');
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/', config: { handler: handler, payload: { parse: 'gunzip' } } });

            server.inject({ method: 'POST', url: '/', payload: payload, headers: { 'content-encoding': 'gzip' } }, function (res) {

                expect(res.result).to.exist;
                expect(res.result.statusCode).to.equal(400);
                done();
            });
        });

        it('does not return an error when the payload has the correct gzip header and gzipped payload', function (done) {

            var payload = '{"hi":"hello"}';

            Zlib.gzip(payload, function (err, result) {

                var handler = function (request, reply) {

                    reply('Success');
                };

                var server = new Hapi.Server();
                server.route({ method: 'POST', path: '/', config: { handler: handler } });

                server.inject({ method: 'POST', url: '/', payload: result, headers: { 'content-encoding': 'gzip' } }, function (res) {

                    expect(res.statusCode).to.equal(200);
                    done();
                });
            });
        });

        it('does not return an error when the payload has the correct deflate header and deflated payload', function (done) {

            var payload = '{"hi":"hello"}';

            Zlib.deflate(payload, function (err, result) {

                var handler = function (request, reply) {

                    reply('Success');
                };

                var server = new Hapi.Server();
                server.route({ method: 'POST', path: '/', config: { handler: handler } });

                server.inject({ method: 'POST', url: '/', payload: result, headers: { 'content-encoding': 'deflate' } }, function (res) {

                    expect(res.statusCode).to.equal(200);
                    done();
                });
            });
        });

        it('does not return an error when the payload has the correct gzip header and gzipped payload (gunzip only)', function (done) {

            var payload = '{"hi":"hello"}';

            Zlib.gzip(payload, function (err, result) {

                var handler = function (request, reply) {

                    reply('Success');
                };

                var server = new Hapi.Server();
                server.route({ method: 'POST', path: '/', config: { handler: handler, payload: { parse: 'gunzip' } } });

                server.inject({ method: 'POST', url: '/', payload: result, headers: { 'content-encoding': 'gzip' } }, function (res) {

                    expect(res.statusCode).to.equal(200);
                    done();
                });
            });
        });

        it('does not return an error when the payload has the correct deflate header and deflated payload (gunzip only)', function (done) {

            var payload = '{"hi":"hello"}';

            Zlib.deflate(payload, function (err, result) {

                var handler = function (request, reply) {

                    reply('Success');
                };

                var server = new Hapi.Server();
                server.route({ method: 'POST', path: '/', config: { handler: handler, payload: { parse: 'gunzip' } } });

                server.inject({ method: 'POST', url: '/', payload: result, headers: { 'content-encoding': 'deflate' } }, function (res) {

                    expect(res.statusCode).to.equal(200);
                    done();
                });
            });
        });
    });

    describe('multi-part', function () {

        var multipartPayload =
                '--AaB03x\r\n' +
                'content-disposition: form-data; name="x"\r\n' +
                '\r\n' +
                'First\r\n' +
                '--AaB03x\r\n' +
                'content-disposition: form-data; name="x"\r\n' +
                '\r\n' +
                'Second\r\n' +
                '--AaB03x\r\n' +
                'content-disposition: form-data; name="x"\r\n' +
                '\r\n' +
                'Third\r\n' +
                '--AaB03x\r\n' +
                'content-disposition: form-data; name="field1"\r\n' +
                '\r\n' +
                'Joe Blow\r\nalmost tricked you!\r\n' +
                '--AaB03x\r\n' +
                'content-disposition: form-data; name="field1"\r\n' +
                '\r\n' +
                'Repeated name segment\r\n' +
                '--AaB03x\r\n' +
                'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
                'Content-Type: text/plain\r\n' +
                '\r\n' +
                '... contents of file1.txt ...\r\r\n' +
                '--AaB03x--\r\n';

        var echo = function (request, reply) {

            var result = {};
            var keys = Object.keys(request.payload);
            for (var i = 0, il = keys.length; i < il; ++i) {
                var key = keys[i];
                var value = request.payload[key];
                result[key] = value._readableState ? true : value;
            }

            reply(result);
        };

        it('errors on missing boundary in content-type header', function (done) {

            var invalidHandler = function (request) {

                expect(request).to.not.exist;       // Must not be called
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/invalid', config: { handler: invalidHandler } });

            server.inject({ method: 'POST', url: '/invalid', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data' } }, function (res) {

                expect(res.result).to.exist;
                expect(res.result.statusCode).to.equal(400);
                done();
            });
        });

        it('errors on empty separator in content-type header', function (done) {

            var invalidHandler = function (request) {

                expect(request).to.not.exist;       // Must not be called
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/invalid', config: { handler: invalidHandler } });

            server.inject({ method: 'POST', url: '/invalid', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=' } }, function (res) {

                expect(res.result).to.exist;
                expect(res.result.statusCode).to.equal(400);
                done();
            });
        });

        it('returns parsed multipart data', function (done) {

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/echo', config: { handler: echo } });

            server.inject({ method: 'POST', url: '/echo', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(Object.keys(res.result).length).to.equal(3);
                expect(res.result.field1).to.exist;
                expect(res.result.field1.length).to.equal(2);
                expect(res.result.field1[1]).to.equal('Repeated name segment');
                expect(res.result.pics).to.exist;
                done();
            });
        });

        it('parses file without content-type', function (done) {

            var multipartPayload =
                    '--AaB03x\r\n' +
                    'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
                    '\r\n' +
                    '... contents of file1.txt ...\r\r\n' +
                    '--AaB03x--\r\n';

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/echo', config: { handler: function (request, reply) { reply(request.payload.pics); } } });

            server.inject({ method: 'POST', url: '/echo', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(res.result.toString()).to.equal('... contents of file1.txt ...\r');
                done();
            });
        });

        it('parses empty file', function (done) {

            var multipartPayload =
                    '--AaB03x\r\n' +
                    'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
                    'Content-Type: text/plain\r\n' +
                    '\r\n' +
                    '\r\n' +
                    '--AaB03x--\r\n';

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/echo', config: { handler: function (request, reply) { reply(request.payload); } } });

            server.inject({ method: 'POST', url: '/echo', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(res.result).to.deep.equal({ pics: {} });
                done();
            });
        });

        it('errors on missing upload folder', function (done) {

            var multipartPayload =
                    '--AaB03x\r\n' +
                    'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
                    'Content-Type: text/plain\r\n' +
                    '\r\n' +
                    'something to fail with\r\n' +
                    '--AaB03x--\r\n';

            var server = new Hapi.Server({ payload: { uploads: '/a/b/c/d/e/f/g/not' } });
            server.route({ method: 'POST', path: '/echo', config: { handler: function (request, reply) { reply(request.payload); }, payload: { output: 'file' } } });

            server.inject({ method: 'POST', url: '/echo', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(res.statusCode).to.equal(500);
                done();
            });
        });

        it('errors while processing a parsed data stream in multiple form', function (done) {

            var payload = '--AaB03x\r\n' +
                          'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
                          'Content-Type: text/plain\r\n' +
                          '\r\n';

            var server = new Hapi.Server(0);
            server.route({ method: 'POST', path: '/', handler: function () { } });
            server.ext('onPreResponse', function (request, reply) {

                expect(request.response.isBoom).to.equal(true);
                expect(request.response.output.statusCode).to.equal(400);
                expect(request.response.message).to.equal('Invalid multipart payload format');
                done();
            });

            server.start(function () {

                var options = {
                    hostname: '127.0.0.1',
                    port: server.info.port,
                    path: '/',
                    method: 'POST',
                    headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' }
                };

                var req = Http.request(options, function (res) { });
                req.write(payload);
                setTimeout(function () {

                    req.destroy();
                }, 100);

                req.on('error', function () { });
            });
        });

        it('parses multiple files as streams', function (done) {

            var multipartPayload =
                    '--AaB03x\r\n' +
                    'content-disposition: form-data; name="files"; filename="file1.txt"\r\n' +
                    'Content-Type: text/plain\r\n' +
                    '\r\n' +
                    'one\r\n' +
                    '--AaB03x\r\n' +
                    'content-disposition: form-data; name="files"; filename="file2.txt"\r\n' +
                    'Content-Type: text/plain\r\n' +
                    '\r\n' +
                    'two\r\n' +
                    '--AaB03x\r\n' +
                    'content-disposition: form-data; name="files"; filename="file3.txt"\r\n' +
                    'Content-Type: text/plain\r\n' +
                    '\r\n' +
                    'three\r\n' +
                    '--AaB03x--\r\n';

            var handler = function (request, reply) {

                expect(request.payload.files[0].hapi).to.deep.equal({ filename: 'file1.txt', headers: { 'content-disposition': 'form-data; name="files"; filename="file1.txt"', 'content-type': 'text/plain' } });
                expect(request.payload.files[1].hapi).to.deep.equal({ filename: 'file2.txt', headers: { 'content-disposition': 'form-data; name="files"; filename="file2.txt"', 'content-type': 'text/plain' } });
                expect(request.payload.files[2].hapi).to.deep.equal({ filename: 'file3.txt', headers: { 'content-disposition': 'form-data; name="files"; filename="file3.txt"', 'content-type': 'text/plain' } });

                Wreck.read(request.payload.files[1], null, function (err, payload2) {

                    Wreck.read(request.payload.files[0], null, function (err, payload1) {

                        Wreck.read(request.payload.files[2], null, function (err, payload3) {

                            reply([payload1, payload2, payload3].join('-'));
                        });
                    });
                });
            }

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/echo', config: { handler: handler, payload: { output: 'stream' } } });

            server.inject({ method: 'POST', url: '/echo', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(res.result).to.equal('one-two-three');
                done();
            });
        });

        it('parses a file as file', function (done) {

            var path = Path.join(__dirname, './file/image.jpg');
            var stats = Fs.statSync(path);

            var handler = function (request, reply) {

                expect(request.headers['content-type']).to.contain('multipart/form-data');
                expect(request.payload.my_file.bytes).to.equal(stats.size);

                var sourceContents = Fs.readFileSync(path);
                var receivedContents = Fs.readFileSync(request.payload['my_file'].path);
                Fs.unlinkSync(request.payload['my_file'].path);
                expect(sourceContents).to.deep.equal(receivedContents);
                done();
            };

            var server = new Hapi.Server(0);
            server.route({ method: 'POST', path: '/file', config: { handler: handler, payload: { output: 'file' } } });
            server.start(function () {

                var form = new FormData();
                form.append('my_file', Fs.createReadStream(path));
                Wreck.post(server.info.uri + '/file', { payload: form, headers: form.getHeaders() }, function (err, res, payload) { });
            });
        });

        it('parses multiple files as files', function (done) {

            var path = Path.join(__dirname, './file/image.jpg');
            var stats = Fs.statSync(path);

            var handler = function (request, reply) {

                expect(request.payload.file1.bytes).to.equal(stats.size);
                expect(request.payload.file2.bytes).to.equal(stats.size);
                done();
            };

            var server = new Hapi.Server(0);
            server.route({ method: 'POST', path: '/file', config: { handler: handler, payload: { output: 'file' } } });
            server.start(function () {

                var form = new FormData();
                form.append('file1', Fs.createReadStream(path));
                form.append('file2', Fs.createReadStream(path));
                Wreck.post(server.info.uri + '/file', { payload: form, headers: form.getHeaders() }, function (err, res, payload) { });
            });
        });

        it('parses multiple files while waiting for last file to be written', { parallel: false }, function (done) {

            var path = Path.join(__dirname, './file/image.jpg');
            var stats = Fs.statSync(path);

            var orig = Fs.createWriteStream;
            Fs.createWriteStream = function () {        // Make the first file write happen faster by bypassing the disk

                Fs.createWriteStream = orig;
                var stream = new Stream.Writable();
                stream._write = function (chunk, encoding, callback) {

                    callback();
                };
                stream.once('finish', function () {

                    stream.emit('close');
                });
                return stream;
            };

            var handler = function (request, reply) {

                expect(request.payload.file1.bytes).to.equal(stats.size);
                expect(request.payload.file2.bytes).to.equal(stats.size);
                done();
            };

            var server = new Hapi.Server(0);
            server.route({ method: 'POST', path: '/file', config: { handler: handler, payload: { output: 'file' } } });
            server.start(function () {

                var form = new FormData();
                form.append('file1', Fs.createReadStream(path));
                form.append('file2', Fs.createReadStream(path));
                Wreck.post(server.info.uri + '/file', { payload: form, headers: form.getHeaders() }, function (err, res, payload) { });
            });
        });

        it('parses a file as data', function (done) {

            var path = Path.join(__dirname, '../package.json');

            var handler = function (request, reply) {

                var fileContents = Fs.readFileSync(path);
                expect(request.payload.my_file.name).to.equal('hapi');
                done();
            };

            var server = new Hapi.Server(0);
            server.route({ method: 'POST', path: '/file', config: { handler: handler, payload: { output: 'data' } } });
            server.start(function () {

                var form = new FormData();
                form.append('my_file', Fs.createReadStream(path));
                Wreck.post(server.info.uri + '/file', { payload: form, headers: form.getHeaders() }, function (err, res, payload) { });
            });
        });

        it('returns fields when multipart is set to stream mode', function (done) {

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/echo', config: { handler: echo, payload: { output: 'stream' } } });

            server.inject({ method: 'POST', url: '/echo', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(Object.keys(res.result).length).to.equal(3);
                expect(res.result.field1).to.exist;
                expect(res.result.field1.length).to.equal(2);
                expect(res.result.field1[1]).to.equal('Repeated name segment');
                expect(res.result.pics).to.exist;
                done();
            });
        });

        it('parses a file correctly on stream mode', function (done) {

            var path = Path.join(__dirname, './file/image.jpg');
            var stats = Fs.statSync(path);
            var fileStream = Fs.createReadStream(path);
            var fileContents = Fs.readFileSync(path);

            var fileHandler = function (request) {

                expect(request.headers['content-type']).to.contain('multipart/form-data');
                expect(request.payload['my_file'].hapi).to.deep.equal({
                    filename: 'image.jpg',
                    headers: {
                        'content-disposition': 'form-data; name="my_file"; filename="image.jpg"',
                        'content-type': 'image/jpeg'
                    }
                });

                Wreck.read(request.payload['my_file'], null, function (err, buffer) {

                    expect(err).to.not.exist;
                    expect(fileContents.length).to.equal(buffer.length);
                    expect(fileContents.toString('binary') === buffer.toString('binary')).to.equal(true);
                    done();
                });
            };

            var server = new Hapi.Server(0);
            server.route({ method: 'POST', path: '/file', config: { handler: fileHandler, payload: { output: 'stream' } } });
            server.start(function () {

                var form = new FormData();
                form.append('my_file', fileStream);
                Wreck.post(server.info.uri + '/file', { payload: form, headers: form.getHeaders() }, function (err, res, payload) { });
            });
        });

        it('peeks at parsed multipart data', function (done) {

            var data = null;
            var ext = function (request, reply) {

                var chunks = [];
                request.on('peek', function (chunk) {

                    chunks.push(chunk);
                });

                request.once('finish', function () {

                    data = Buffer.concat(chunks);
                });

                reply();
            };

            var handler = function (request, reply) {

                reply(data);
            };

            var server = new Hapi.Server();
            server.ext('onRequest', ext);
            server.route({ method: 'POST', path: '/', config: { handler: handler } });

            server.inject({ method: 'POST', url: '/', payload: multipartPayload, headers: { 'content-type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(res.result).to.equal(multipartPayload);
                done();
            });
        });

        it('parses field names with arrays', function (done) {

            var payload = '--AaB03x\r\n' +
                          'Content-Disposition: form-data; name="a[b]"\r\n' +
                          '\r\n' +
                          '3\r\n' +
                          '--AaB03x\r\n' +
                          'Content-Disposition: form-data; name="a[c]"\r\n' +
                          '\r\n' +
                          '4\r\n' +
                          '--AaB03x--\r\n';

            var handler = function (request, reply) {

                reply(request.payload.a.b + request.payload.a.c);
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/', handler: handler });

            server.inject({ method: 'POST', url: '/', payload: payload, headers: { 'content-Type': 'multipart/form-data; boundary=AaB03x' } }, function (res) {

                expect(res.result).to.equal('34');
                done();
            });
        });

        it('parses field names with arrays and file', function (done) {

            var payload = '----WebKitFormBoundaryE19zNvXGzXaLvS5C\r\n' +
                      'Content-Disposition: form-data; name="a[b]"\r\n' +
                      '\r\n' +
                      '3\r\n' +
                      '----WebKitFormBoundaryE19zNvXGzXaLvS5C\r\n' +
                      'Content-Disposition: form-data; name="a[c]"\r\n' +
                      '\r\n' +
                      '4\r\n' +
                      '----WebKitFormBoundaryE19zNvXGzXaLvS5C\r\n' +
                      'Content-Disposition: form-data; name="file"; filename="test.txt"\r\n' +
                      'Content-Type: plain/text\r\n' +
                      '\r\n' +
                      'and\r\n' +
                      '----WebKitFormBoundaryE19zNvXGzXaLvS5C--\r\n';

            var handler = function (request, reply) {

                reply(request.payload.a.b + request.payload.file + request.payload.a.c);
            };

            var server = new Hapi.Server();
            server.route({ method: 'POST', path: '/', handler: handler });

            server.inject({ method: 'POST', url: '/', payload: payload, headers: { 'content-Type': 'multipart/form-data; boundary=--WebKitFormBoundaryE19zNvXGzXaLvS5C' } }, function (res) {

                expect(res.result).to.equal('3and4');
                done();
            });
        });
    });

    describe('timeout', function () {

        it('returns client error message when client request taking too long', function (done) {

            var server = new Hapi.Server(0, { timeout: { client: 50 } });
            server.route({ method: 'POST', path: '/fast', config: { handler: function (request, reply) { reply('fast'); } } });
            server.start(function () {

                var timer = new Hoek.Bench();
                var options = {
                    hostname: '127.0.0.1',
                    port: server.info.port,
                    path: '/fast',
                    method: 'POST'
                };

                var req = Http.request(options, function (res) {

                    expect(res.statusCode).to.equal(408);
                    expect(timer.elapsed()).to.be.at.least(45);
                    done();
                });

                req.on('error', function (err) { });                    // Will error out, so don't allow error to escape test

                req.write('{}\n');
                var now = Date.now();
                setTimeout(function () {

                    req.end();
                }, 100);
            });
        });

        it('returns client error message when client request taking too long (route override', function (done) {

            var server = new Hapi.Server(0, { timeout: { client: false } });
            server.route({ method: 'POST', path: '/fast', config: { payload: { timeout: 50 }, handler: function (request, reply) { reply('fast'); } } });
            server.start(function () {

                var timer = new Hoek.Bench();
                var options = {
                    hostname: '127.0.0.1',
                    port: server.info.port,
                    path: '/fast',
                    method: 'POST'
                };

                var req = Http.request(options, function (res) {

                    expect(res.statusCode).to.equal(408);
                    expect(timer.elapsed()).to.be.at.least(45);
                    done();
                });

                req.on('error', function (err) { });                    // Will error out, so don't allow error to escape test

                req.write('{}\n');
                var now = Date.now();
                setTimeout(function () {

                    req.end();
                }, 100);
            });
        });

        it('does not return a client error message when client request is fast', function (done) {

            var server = new Hapi.Server(0, { timeout: { client: 50 } });
            server.route({ method: 'POST', path: '/fast', config: { handler: function (request, reply) { reply('fast'); } } });
            server.start(function () {

                var options = {
                    hostname: '127.0.0.1',
                    port: server.info.port,
                    path: '/fast',
                    method: 'POST'
                };

                var req = Http.request(options, function (res) {

                    expect(res.statusCode).to.equal(200);
                    done();
                });

                req.end();
            });
        });

        it('does not return a client error message when response is taking a long time to send', function (done) {

            var streamHandler = function (request, reply) {

                var TestStream = function () {

                    Stream.Readable.call(this);
                };

                Hoek.inherits(TestStream, Stream.Readable);

                TestStream.prototype._read = function (size) {

                    var self = this;

                    if (this.isDone) {
                        return;
                    }
                    this.isDone = true;

                    setTimeout(function () {

                        self.push('Hello');
                    }, 60);

                    setTimeout(function () {

                        self.push(null);
                    }, 70);
                };

                reply(new TestStream());
            };

            var server = new Hapi.Server(0, { timeout: { client: 50 } });
            server.route({ method: 'GET', path: '/', config: { handler: streamHandler } });
            server.start(function () {

                var timer = new Hoek.Bench();
                var options = {
                    hostname: '127.0.0.1',
                    port: server.info.port,
                    path: '/',
                    method: 'GET'
                };

                var req = Http.request(options, function (res) {

                    expect(timer.elapsed()).to.be.at.least(50);
                    expect(res.statusCode).to.equal(200);
                    done();
                });

                req.once('error', function (err) {

                    done();
                });

                req.end();
            });
        });

        it('does not return an error with timeout disabled', function (done) {

            var server = new Hapi.Server(0, { timeout: { client: false } });
            server.route({ method: 'POST', path: '/', config: { handler: function (request, reply) { reply('fast'); } } });

            server.start(function () {

                var timer = new Hoek.Bench();
                var options = {
                    hostname: '127.0.0.1',
                    port: server.info.port,
                    path: '/',
                    method: 'POST'
                };

                var req = Http.request(options, function (res) {

                    expect(res.statusCode).to.equal(200);
                    expect(timer.elapsed()).to.be.at.least(90);
                    done();
                });

                setTimeout(function () {

                    req.end();
                }, 100);
            });
        });
    });
});
