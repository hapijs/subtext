'use strict';

const Code = require('@hapi/code');
const Lab = require('@hapi/lab');


const { before, describe, it } = exports.lab = Lab.script();
const expect = Code.expect;


describe('import()', () => {

    let Subtext;

    before(async () => {

        Subtext = await import('../lib/index.js');
    });

    it('exposes all methods and classes as named imports', () => {

        expect(Object.keys(Subtext)).to.equal([
            'default',
            ...(process.version.match(/^v(\d+)/)[1] >= 23 ? ['module.exports'] : []),
            'parse'
        ]);
    });
});
