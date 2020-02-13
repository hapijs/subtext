'use strict';

const Fs = require('fs');
const Http = require('http');
const Path = require('path');
const Stream = require('stream');
const Zlib = require('zlib');

const Code = require('@hapi/code');
const FormData = require('form-data');
const Hoek = require('@hapi/hoek');
const Lab = require('@hapi/lab');
const Subtext = require('..');
const Wreck = require('@hapi/wreck');


const internals = {};


const { describe, it } = exports.lab = Lab.script();
const expect = Code.expect;


describe('parse()', () => {

    it('returns a raw body', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: false, output: 'data' });
        expect(mime).to.equal('application/json');
        expect(Buffer.isBuffer(payload)).to.be.true();
        expect(payload.toString()).to.equal(body);
    });

    it('returns a parsed body', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/json');
        expect(payload).to.equal(JSON.parse(body));
    });

    it('returns a parsed body as stream', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const { payload: stream, mime } = await Subtext.parse(request, null, { parse: true, output: 'stream' });
        expect(mime).to.equal('application/json');
        const payload = await Wreck.read(stream);
        expect(payload.toString()).to.equal(body);
    });

    it('returns a raw body as stream', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const { payload: stream, mime } = await Subtext.parse(request, null, { parse: false, output: 'stream' });
        expect(mime).to.equal('application/json');
        const payload = await Wreck.read(stream);
        expect(payload.toString()).to.equal(body);
    });

    it('returns a parsed body (json-derived media type)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json-patch+json'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/json-patch+json');
        expect(payload).to.equal(JSON.parse(body));
    });

    it('returns an empty parsed body', async () => {

        const body = '';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/json');
        expect(payload).to.equal(null);
    });

    it('returns an empty string', async () => {

        const body = '';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'text/plain'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(payload).to.equal('');
    });

    it('removes __proto__ from input', async () => {

        const body = '{"x":1,"y":2,"z":3,"__proto__":{"a":1}}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data', protoAction: 'remove' });
        expect(mime).to.equal('application/json');
        expect(payload).to.equal({ x: 1, y: 2, z: 3 });
    });

    it('errors on invalid content type header', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'steve'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid content-type header');
    });

    it('errors on unsupported content type', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'james/bond'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Unsupported Media Type');
    });

    it('errors when content-length header greater than maxBytes', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-length': '50',
            'content-type': 'application/json'
        };

        const err = await expect(Subtext.parse(request, null, { parse: false, output: 'data', maxBytes: 10 })).to.reject('Payload content length greater than maximum allowed: 10');
        expect(err.output.statusCode).to.equal(413);
    });

    it('errors when content-length header greater than maxBytes (file)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const err = await expect(Subtext.parse(request, null, { parse: false, output: 'file', maxBytes: 10 })).to.reject('Payload content length greater than maximum allowed: 10');
        expect(err.output.statusCode).to.equal(413);
    });

    it('allows file within the maxBytes limit', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        await expect(Subtext.parse(request, null, { parse: false, output: 'file', maxBytes: 100 })).to.not.reject();
    });

    it('limits maxBytes when content-length header missing', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };
        request.destroy = function () { };

        await expect(Subtext.parse(request, null, { parse: false, output: 'data', maxBytes: 10 })).to.reject('Payload content length greater than maximum allowed: 10');
    });

    it('validates maxBytes when content is within limit', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-length': '50',
            'content-type': 'application/json'
        };

        await expect(Subtext.parse(request, null, { parse: false, output: 'data', maxBytes: 100 })).to.not.reject();
    });

    it('errors on invalid JSON payload', async () => {

        const body = '{"x":"1","y":"2","z":"3"';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const err = await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid request payload JSON format');
        expect(err.raw.toString()).to.equal(body);
    });

    it('errors on invalid JSON payload (__proto__)', async () => {

        const body = '{"x":1,"y":2,"z":3,"__proto__":{"a":1}}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        const err = await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid request payload JSON format');
        expect(err.raw.toString()).to.equal(body);
    });

    it('peeks at the unparsed stream of a parsed body', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        let raw = '';
        const tap = new Stream.Transform();
        tap._transform = function (chunk, encoding, callback) {

            raw = raw + chunk.toString();
            this.push(chunk, encoding);
            callback();
        };

        const { payload } = await Subtext.parse(request, tap, { parse: true, output: 'data' });
        expect(payload).to.equal(JSON.parse(body));
        expect(raw).to.equal(body);
    });

    it('peeks at the unparsed stream of an unparsed body', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/json'
        };

        let raw = '';
        const tap = new Stream.Transform();
        tap._transform = function (chunk, encoding, callback) {

            raw = raw + chunk.toString();
            this.push(chunk, encoding);
            callback();
        };

        const { payload } = await Subtext.parse(request, tap, { parse: false, output: 'data' });
        expect(payload.toString()).to.equal(body);
        expect(raw).to.equal(body);
    });

    it('saves file', async () => {

        const request = Wreck.toReadableStream('payload');
        request.headers = {
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: false, output: 'file' });
        expect(payload).to.only.contain(['path', 'bytes']);
        const receivedContents = Fs.readFileSync(payload.path);
        Fs.unlinkSync(payload.path);
        expect(receivedContents.toString()).to.equal('payload');
    });

    it('saves a file after content decoding', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const sourceContents = Fs.readFileSync(path);
        const stats = Fs.statSync(path);

        const compressed = await internals.compress('gzip', sourceContents);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'file', compression: {} });
        const receivedContents = Fs.readFileSync(payload.path);
        Fs.unlinkSync(payload.path);
        expect(receivedContents).to.equal(sourceContents);
        expect(payload.bytes).to.equal(stats.size);
    });

    it('saves a file ignoring content decoding when parse is false', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const sourceContents = Fs.readFileSync(path);

        const compressed = await internals.compress('gzip', sourceContents);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: false, output: 'file' });
        const receivedContents = Fs.readFileSync(payload.path);
        Fs.unlinkSync(payload.path);
        expect(receivedContents).to.equal(compressed);
    });

    it('errors on invalid upload directory (parse false)', async () => {

        const request = Wreck.toReadableStream('payload');
        request.headers = {
            'content-type': 'application/json'
        };

        await expect(Subtext.parse(request, null, { parse: false, output: 'file', uploads: '/a/b/c/no/such/folder' })).to.reject(/ENOENT/);
    });

    it('errors on invalid upload directory (parse true)', async () => {

        const request = Wreck.toReadableStream('payload');
        request.headers = {
            'content-type': 'application/json'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'file', uploads: '/a/b/c/no/such/folder' })).to.reject(/ENOENT/);
    });

    it('processes application/octet-stream', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/octet-stream'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/octet-stream');
        expect(Buffer.isBuffer(payload)).to.be.true();
        expect(payload.toString()).to.equal(body);
    });

    it('defaults to application/octet-stream', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {};

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/octet-stream');
        expect(Buffer.isBuffer(payload)).to.be.true();
        expect(payload.toString()).to.equal(body);
    });

    it('returns null on empty payload and application/octet-stream', async () => {

        const body = '';
        const request = Wreck.toReadableStream(body);
        request.headers = {};

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/octet-stream');
        expect(payload).to.be.null();
    });

    it('overrides content-type', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'text/plain'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data', override: 'application/json' });
        expect(mime).to.equal('application/json');
        expect(payload).to.equal(JSON.parse(body));
    });

    it('custom default content-type', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {};

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data', defaultContentType: 'application/json' });
        expect(mime).to.equal('application/json');
        expect(payload).to.equal(JSON.parse(body));
    });

    it('returns a parsed text payload', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'text/plain'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('text/plain');
        expect(payload).to.equal(body);
    });

    it('parses an allowed content-type', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'text/plain'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data', allow: 'text/plain' });
        expect(mime).to.equal('text/plain');
        expect(payload).to.equal(body);
    });

    it('parses an allowed content-type (array)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'text/plain'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data', allow: ['text/plain'] });
        expect(mime).to.equal('text/plain');
        expect(payload).to.equal(body);
    });

    it('errors on an unallowed content-type', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'text/plain'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data', allow: 'application/json' })).to.reject('Unsupported Media Type');
    });

    it('errors on an unallowed content-type (array)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'text/plain'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data', allow: ['application/json'] })).to.reject('Unsupported Media Type');
    });

    it('parses form encoded payload', async () => {

        const body = 'x=abc';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/x-www-form-urlencoded'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/x-www-form-urlencoded');
        expect(payload.x).to.equal('abc');
    });

    it('parses form encoded payload (custom parser)', async () => {

        const body = 'x=abc';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/x-www-form-urlencoded'
        };

        const querystring = (x) => {

            return { x };
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data', querystring });
        expect(mime).to.equal('application/x-www-form-urlencoded');
        expect(payload.x).to.equal(body);
    });

    it('parses empty form encoded payload', async () => {

        const body = '';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'application/x-www-form-urlencoded'
        };

        const { payload, mime } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(mime).to.equal('application/x-www-form-urlencoded');
        expect(payload).to.equal({});
    });

    it('errors on malformed zipped payload', async () => {

        const body = '7d8d78347h8347d58w347hd58w374d58w37h5d8w37hd4';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const err = await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid compressed payload');
        expect(err.output.statusCode).to.equal(400);
    });

    it('errors on malformed zipped payload (parse gunzip only)', async () => {

        const body = '7d8d78347h8347d58w347hd58w374d58w37h5d8w37hd4';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const err = await expect(Subtext.parse(request, null, { parse: 'gunzip', output: 'data' })).to.reject('Invalid compressed payload');
        expect(err.output.statusCode).to.equal(400);
    });

    it('errors on malformed zipped payloa (with tap and raw)', async () => {

        const body = '7d8d78347h8347d58w347hd58w374d58w37h5d8w37hd4';
        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        let raw = '';
        const tap = new Stream.Transform();
        tap._transform = function (chunk, encoding, callback) {

            raw = raw + chunk.toString();
            this.push(chunk, encoding);
            callback();
        };

        const { payload } = await Subtext.parse(request, tap, { parse: 'gunzip', output: 'stream' });
        const err = await expect(Wreck.read(payload)).to.reject('Invalid compressed payload');
        expect(err.output.statusCode).to.equal(400);
    });

    it('parses a gzipped payload', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('gzip', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(payload).to.equal(JSON.parse(body));
    });

    it('parses a gzipped payload (external decoders)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('gzip', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data', decoders: { gzip: (options) => Zlib.createGunzip(options) } });
        expect(payload).to.equal(JSON.parse(body));
    });

    it('unzips payload without parsing', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('gzip', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: 'gunzip', output: 'data' });
        expect(payload.toString()).to.equal(body);
    });

    it('unzips payload without parsing (deflate)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('deflate', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'deflate',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: 'gunzip', output: 'data' });
        expect(payload.toString()).to.equal(body);
    });

    it('leaves payload raw when encoding unknown', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('gzip', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'unknown',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: 'gunzip', output: 'data' });
        expect(payload.toString()).to.equal(compressed.toString());
    });

    it('unzips payload without parsing (external decoders)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('gzip', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: 'gunzip', output: 'data', compression: {}, decoders: { gzip: (options) => Zlib.createGunzip(options) } });
        expect(payload.toString()).to.equal(body);
    });

    it('unzips payload without parsing (gzip options)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('gzip', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const gzip = (options) => {

            expect(options).to.equal({ level: 5 });
            return Zlib.createGunzip();
        };

        const { payload } = await Subtext.parse(request, null, { parse: 'gunzip', output: 'data', decoders: { gzip }, compression: { gzip: { level: 5 } } });
        expect(payload.toString()).to.equal(body);
    });

    it('unzips payload (gzip options)', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('gzip', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'gzip',
            'content-type': 'application/json'
        };

        const gzip = (options) => {

            expect(options).to.equal({ level: 5 });
            return Zlib.createGunzip();
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data', decoders: { gzip }, compression: { gzip: { level: 5 } } });
        expect(payload).to.equal({ x: '1', y: '2', z: '3' });
    });

    it('parses a deflated payload', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('deflate', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'deflate',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(payload).to.equal(JSON.parse(body));
    });

    it('deflates payload without parsing', async () => {

        const body = '{"x":"1","y":"2","z":"3"}';
        const compressed = await internals.compress('deflate', body);
        const request = Wreck.toReadableStream(compressed);
        request.headers = {
            'content-encoding': 'deflate',
            'content-type': 'application/json'
        };

        const { payload } = await Subtext.parse(request, null, { parse: 'gunzip', output: 'data' });
        expect(payload.toString()).to.equal(body);
    });

    it('parses a multipart payload', async () => {

        const body =
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

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(payload).to.equal({
            x: ['First', 'Second', 'Third'],
            field1: ['Joe Blow\r\nalmost tricked you!', 'Repeated name segment'],
            pics: '... contents of file1.txt ...\r'
        });
    });

    it('parses a multipart payload (ignores unknown mime type)', async () => {

        const body =
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
            'Content-Type: unknown/X\r\n' +
            '\r\n' +
            '... contents of file1.txt ...\r\r\n' +
            '--AaB03x--\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(payload).to.equal({
            x: ['First', 'Second', 'Third'],
            field1: ['Joe Blow\r\nalmost tricked you!', 'Repeated name segment'],
            pics: Buffer.from('... contents of file1.txt ...\r')
        });
    });

    it('parses a multipart payload (empty file)', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            '\r\n' +
            '--AaB03x--\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(payload.pics).to.equal({});
    });

    it('errors on disabled multipart', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            'Content-Type: text/plain\r\n' +
            '\r\n' +
            '\r\n' +
            '--AaB03x--\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data', multipart: false })).to.reject();
    });

    it('errors on an invalid multipart header (missing boundary)', async () => {

        const body =
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

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid content-type header: multipart missing boundary');
    });

    it('errors on an invalid multipart payload', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="x"\r\n' +
            '\r\n' +
            'First\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid multipart payload format');
    });

    it('parses multipart file without content-type', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            '\r\n' +
            '... contents of file1.txt ...\r\r\n' +
            '--AaB03x--\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary="AaB03x"'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data' });
        expect(payload.pics.toString()).to.equal('... contents of file1.txt ...\r');
    });

    it('parses multipart file with annotation', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            'Content-Type: image/jpeg\r\n' +
            '\r\n' +
            '... contents of file1.txt ...\r\r\n' +
            '--AaB03x--\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary="AaB03x"'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'data', multipart: { output: 'annotated' } });
        expect(payload.pics).to.equal({
            payload: Buffer.from('... contents of file1.txt ...\r'),
            headers: {
                'content-disposition': 'form-data; name="pics"; filename="file1.txt"',
                'content-type': 'image/jpeg'
            },
            filename: 'file1.txt'
        });
    });

    it('errors on invalid uploads folder while processing multipart payload', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="pics"; filename="file1.txt"\r\n' +
            '\r\n' +
            '... contents of file1.txt ...\r\r\n' +
            '--AaB03x--\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary="AaB03x"'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'file', uploads: '/no/such/folder/a/b/c' })).to.reject(/no.such.folder/);
    });

    it('parses multiple files as streams', async () => {

        const body =
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

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary="AaB03x"'
        };

        const { payload } = await Subtext.parse(request, null, { parse: true, output: 'stream' });
        expect(payload.files[0].hapi).to.equal({ filename: 'file1.txt', headers: { 'content-disposition': 'form-data; name="files"; filename="file1.txt"', 'content-type': 'text/plain' } });
        expect(payload.files[1].hapi).to.equal({ filename: 'file2.txt', headers: { 'content-disposition': 'form-data; name="files"; filename="file2.txt"', 'content-type': 'text/plain' } });
        expect(payload.files[2].hapi).to.equal({ filename: 'file3.txt', headers: { 'content-disposition': 'form-data; name="files"; filename="file3.txt"', 'content-type': 'text/plain' } });

        const payload2 = await Wreck.read(payload.files[1]);
        const payload1 = await Wreck.read(payload.files[0]);
        const payload3 = await Wreck.read(payload.files[2]);

        expect(payload1.toString()).to.equal('one');
        expect(payload2.toString()).to.equal('two');
        expect(payload3.toString()).to.equal('three');
    });

    it('parses a multipart file as file', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const stats = Fs.statSync(path);

        const form = new FormData();
        form.append('my_file', Fs.createReadStream(path));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'file' });
        expect(payload.my_file.bytes).to.equal(stats.size);

        const sourceContents = Fs.readFileSync(path);
        const receivedContents = Fs.readFileSync(payload.my_file.path);
        Fs.unlinkSync(payload.my_file.path);
        expect(sourceContents).to.equal(receivedContents);
    });

    it('parses a multipart file as file (multipart override)', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const stats = Fs.statSync(path);

        const form = new FormData();
        form.append('my_file', Fs.createReadStream(path));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'data', multipart: { output: 'file' } });
        expect(payload.my_file.bytes).to.equal(stats.size);

        const sourceContents = Fs.readFileSync(path);
        const receivedContents = Fs.readFileSync(payload.my_file.path);
        Fs.unlinkSync(payload.my_file.path);
        expect(sourceContents).to.equal(receivedContents);
    });

    it('parses multiple files as files', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const stats = Fs.statSync(path);

        const form = new FormData();
        form.append('file1', Fs.createReadStream(path));
        form.append('file2', Fs.createReadStream(path));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'file' });
        expect(payload.file1.bytes).to.equal(stats.size);
        expect(payload.file2.bytes).to.equal(stats.size);
        Fs.unlinkSync(payload.file1.path);
        Fs.unlinkSync(payload.file2.path);
    });

    it('parses multiple files of different sizes', async () => {

        const path = Path.join(__dirname, './file/smallimage.png');
        const path2 = Path.join(__dirname, './file/image.jpg');
        const stats = Fs.statSync(path);
        const stats2 = Fs.statSync(path2);

        const form = new FormData();
        form.append('file1', Fs.createReadStream(path));
        form.append('file2', Fs.createReadStream(path2));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'file' });
        expect(payload.file1.bytes).to.equal(stats.size);
        expect(payload.file2.bytes).to.equal(stats2.size);
        Fs.unlinkSync(payload.file1.path);
        Fs.unlinkSync(payload.file2.path);
    });

    it('parses multiple files of different sizes', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const path2 = Path.join(__dirname, './file/smallimage.png');
        const stats = Fs.statSync(path);
        const stats2 = Fs.statSync(path2);

        const form = new FormData();
        form.append('file1', Fs.createReadStream(path));
        form.append('file2', Fs.createReadStream(path2));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'file' });
        expect(payload.file1.bytes).to.equal(stats.size);
        expect(payload.file2.bytes).to.equal(stats2.size);
        Fs.unlinkSync(payload.file1.path);
        Fs.unlinkSync(payload.file2.path);
    });


    it('parses multiple small files', async () => {

        const path = Path.join(__dirname, './file/smallimage.png');
        const stats = Fs.statSync(path);

        const form = new FormData();
        form.append('file1', Fs.createReadStream(path));
        form.append('file2', Fs.createReadStream(path));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'file' });
        expect(payload.file1.bytes).to.equal(stats.size);
        expect(payload.file2.bytes).to.equal(stats.size);
        Fs.unlinkSync(payload.file1.path);
    });


    it('parses multiple larger files', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const stats = Fs.statSync(path);

        const form = new FormData();
        form.append('file1', Fs.createReadStream(path));
        form.append('file2', Fs.createReadStream(path));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'file' });
        expect(payload.file1.bytes).to.equal(stats.size);
        expect(payload.file2.bytes).to.equal(stats.size);
        Fs.unlinkSync(payload.file1.path);
        Fs.unlinkSync(payload.file2.path);
    });

    it('parses multiple files while waiting for last file to be written', { parallel: false }, async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const stats = Fs.statSync(path);

        const orig = Fs.createWriteStream;
        Fs.createWriteStream = function () {        // Make the first file write happen faster by bypassing the disk

            Fs.createWriteStream = orig;
            const stream = new Stream.Writable();
            stream._write = (chunk, encoding, callback) => callback();
            stream.once('finish', () => stream.emit('close'));
            return stream;
        };

        const form = new FormData();
        form.append('a', Fs.createReadStream(path));
        form.append('b', Fs.createReadStream(path));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'file' });
        expect(payload.a.bytes).to.equal(stats.size);
        expect(payload.b.bytes).to.equal(stats.size);

        // The first file is never written due to createWriteStream() above
        Fs.unlinkSync(payload.b.path);
    });

    it('parses a multipart file as data', async () => {

        const path = Path.join(__dirname, '../package.json');

        const form = new FormData();
        form.append('my_file', Fs.createReadStream(path));
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'data' });
        expect(payload.my_file.name).to.equal('@hapi/subtext');
    });

    it('peeks at multipart in stream mode', async () => {

        const body =
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

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        let raw = '';
        const tap = new Stream.Transform();
        tap._transform = function (chunk, encoding, callback) {

            raw = raw + chunk.toString();
            this.push(chunk, encoding);
            callback();
        };

        const { payload } = await Subtext.parse(request, tap, { parse: true, output: 'stream' });
        expect(payload.x).to.equal(['First', 'Second', 'Third']);
        expect(payload.field1).to.equal(['Joe Blow\r\nalmost tricked you!', 'Repeated name segment']);
        expect(payload.pics.hapi.filename).to.equal('file1.txt');
        expect(raw).to.equal(body);
    });

    it('parses a multipart file correctly on stream mode', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const fileStream = Fs.createReadStream(path);
        const fileContents = Fs.readFileSync(path);

        const form = new FormData();
        form.append('my_file', fileStream);
        form.headers = form.getHeaders();

        const { payload } = await Subtext.parse(form, null, { parse: true, output: 'stream' });

        expect(payload.my_file.hapi).to.equal({
            filename: 'image.jpg',
            headers: {
                'content-disposition': 'form-data; name="my_file"; filename="image.jpg"',
                'content-type': 'image/jpeg'
            }
        });

        const buffer = await Wreck.read(payload.my_file);
        expect(fileContents.length).to.equal(buffer.length);
        expect(fileContents.toString('binary') === buffer.toString('binary')).to.equal(true);
    });

    it('cleans file when stream is aborted', { retry: true }, async () => {

        const path = Path.join(__dirname, 'file');
        const count = Fs.readdirSync(path).length;

        const server = Http.createServer();
        await new Promise((resolve) => server.listen(0, resolve));
        const receive = new Promise((resolve) => server.once('request', (req, res) => resolve(req)));

        const options = {
            hostname: 'localhost',
            port: server.address().port,
            path: '/',
            method: 'POST',
            headers: { 'content-length': 1000000 }
        };

        const req = Http.request(options, (res) => { });
        req.on('error', Hoek.ignore);
        const random = Buffer.alloc(100000);
        req.write(random);
        req.write(random);

        await Hoek.wait(10);
        req.abort();

        const incoming = await receive;
        await expect(Subtext.parse(incoming, null, { parse: false, output: 'file', uploads: path })).to.reject();
        expect(Fs.readdirSync(path).length).to.equal(count);
    });

    it('will timeout correctly for a multipart payload with output as stream', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const fileStream = Fs.createReadStream(path);

        const form = new FormData();
        form.append('my_file', fileStream);
        form.headers = form.getHeaders();

        const err = await expect(Subtext.parse(form, null, { parse: true, output: 'stream', timeout: 1 })).to.reject('Request Time-out');
        expect(err.output.statusCode).to.equal(408);
    });

    it('will timeout correctly for a multipart payload with output file', async () => {

        const path = Path.join(__dirname, './file/image.jpg');
        const fileStream = Fs.createReadStream(path);

        const form = new FormData();
        form.append('my_file', fileStream);
        form.headers = form.getHeaders();

        const err = await expect(Subtext.parse(form, null, { parse: true, output: 'file', timeout: 1 })).to.reject('Request Time-out');
        expect(err.output.statusCode).to.equal(408);
    });

    it('errors if the payload size exceeds the byte limit', async () => {

        const body =
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

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'stream', maxBytes: 10 })).to.reject();
    });

    it('handles __proto__ in multipart param', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="x"; __proto__="y"\r\n' +
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

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid multipart payload format');
    });

    it('handles __proto__ in multipart name', async () => {

        const body =
            '--AaB03x\r\n' +
            'content-disposition: form-data; name="__proto__"; filename="test"\r\n' +
            'Content-Type: application/json\r\n' +
            '\r\n' +
            '{"a":1}\r\r\n' +
            '--AaB03x--\r\n';

        const request = Wreck.toReadableStream(body);
        request.headers = {
            'content-type': 'multipart/form-data; boundary=AaB03x'
        };

        await expect(Subtext.parse(request, null, { parse: true, output: 'data' })).to.reject('Invalid multipart payload format');
    });
});


internals.compress = function (encoder, value) {

    return new Promise((resolve) => Zlib[encoder](value, (ignoreErr, compressed) => resolve(compressed)));
};
