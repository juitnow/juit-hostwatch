/* eslint-disable no-template-curly-in-string */
import { Replacer } from '../src/utils/replacer'

describe('Replacer', () => {
  it('should replace local variables', async () => {
    const replacer = new Replacer()
    replacer.setVariable('aString', 'myString')
    replacer.setVariable('aNumber', 123)
    replacer.setVariable('aBoolean', true)

    expect(await replacer.replace({
      theFullString: '${aString}',
      theFullNumber: '${aNumber}',
      theFullBoolean: '${aBoolean}',

      theFullStringExtended: '${ ASTRING }',
      theFullNumberExtended: '${ ANUMBER }',
      theFullBooleanExtended: '${ ABOOLEAN }',

      thePartialString: '[[>${aString}<]]',
      thePartialNumber: '[[>${aNumber}<]]',
      thePartialBoolean: '[[>${aBoolean}<]]',

      thePartialStringExtended: '[[>${ ASTRING }<]]',
      thePartialNumberExtended: '[[>${ ANUMBER }<]]',
      thePartialBooleanExtended: '[[>${ ABOOLEAN }<]]',

      combined: '${aString}${ ANUMBER }${ABOOLEAN}',
    })).toEqual({
      theFullString: 'myString',
      theFullNumber: 123,
      theFullBoolean: true,
      theFullStringExtended: 'myString',
      theFullNumberExtended: 123,
      theFullBooleanExtended: true,
      thePartialString: '[[>myString<]]',
      thePartialNumber: '[[>123<]]',
      thePartialBoolean: '[[>true<]]',
      thePartialStringExtended: '[[>myString<]]',
      thePartialNumberExtended: '[[>123<]]',
      thePartialBooleanExtended: '[[>true<]]',
      combined: 'myString123true',
    })
  })

  it('should replace environment variables', async () => {
    expect(await new Replacer().replace('>>${env:path}<<'))
        .toEqual(`>>${process.env.PATH}<<`)
  })

  it('should convert values to numbers', async () => {
    const replacer = new Replacer()
    replacer.setVariable('theNumber', '123.456')
    replacer.setVariable('theHexNumber', '0x0FFFF')
    replacer.setVariable('theOctalNumber', '0o07777')
    replacer.setVariable('theBooleanNumber', '0b01111')
    replacer.setVariable('theExponentNumber', ' 1.23e4 ')
    replacer.setVariable('theNumberExtended', ' -123.456 ')
    replacer.setVariable('theHexNumberExtended', ' 0x0 ')
    replacer.setVariable('theOctalNumberExtended', ' 0o0 ')
    replacer.setVariable('theBooleanNumberExtended', ' 0b0 ')

    expect(await replacer.replace({
      theNumber: '${num:theNumber}',
      theHexNumber: '${num:theHexNumber}',
      theOctalNumber: '${num:theOctalNumber}',
      theBooleanNumber: '${num:theBooleanNumber}',
      theExponentNumber: '${num:theExponentNumber}',
      theNumberExtended: '${number:theNumberExtended}',
      theHexNumberExtended: '${number:theHexNumberExtended}',
      theOctalNumberExtended: '${number:theOctalNumberExtended}',
      theBooleanNumberExtended: '${number:theBooleanNumberExtended}',
    })).toEqual({
      theNumber: 123.456,
      theHexNumber: 65535,
      theOctalNumber: 4095,
      theBooleanNumber: 15,
      theExponentNumber: 12300,
      theNumberExtended: -123.456,
      theHexNumberExtended: 0,
      theOctalNumberExtended: 0,
      theBooleanNumberExtended: 0,
    })
  })

  it('should convert values to booleans', async () => {
    const replacer = new Replacer()
    replacer.setVariable('theTrue', ' true ')
    replacer.setVariable('theFalse', 'FALSE')

    expect(await replacer.replace({
      theTrue: '${ boolean:theTrue }',
      theFalse: '${ bool:theFalse }',
      theTrueNumber: '${ number:boolean:theTrue }',
      theFalseNumber: '${ num:bool:theFalse }',
    })).toEqual({
      theTrue: true,
      theFalse: false,
      theTrueNumber: 1,
      theFalseNumber: 0,
    })
  })

  it('should convert nested objects and arrays', async () => {
    const replacer = new Replacer()
    replacer.setVariable('one', '1')
    replacer.setVariable('two', '2')
    replacer.setVariable('arr', [ '${num:one}', '${num:two}' ])
    replacer.setVariable('obj', { '_1': '${num:one}', '_2': '${num:two}' })

    expect(await replacer.replace({
      '_arr': '${arr}',
      '_obj': '${obj}',
    })).toEqual({
      _arr: [ 1, 2 ],
      _obj: { _1: 1, _2: 2 },
    })
  })

  it('should set variables while parsing an object', async () => {
    expect(await new Replacer().replace({
      one: 1,
      two: true,
      three: '${one}/${two}',
      four: 'hello, "${one}/${two}/${three}"',
    }, true)).toEqual({
      one: 1,
      two: true,
      three: '1/true',
      four: 'hello, "1/true/1/true"',
    })
  })

  /* ======================================================================== */

  it('should fail replacing unknown local variables', async () => {
    await expectAsync(new Replacer().replace('${nope}'))
        .toBeRejectedWithError(TypeError, 'Unknown local variable "nope"')
  })

  it('should fail replacing unknown environment variables', async () => {
    await expectAsync(new Replacer().replace('${env:__fail_you_miserable_git__}'))
        .toBeRejectedWithError(TypeError, 'Unknown environment variable "__fail_you_miserable_git__"')
  })

  it('should fail converting invalid numbers', async () => {
    const replacer = new Replacer()
    replacer.setVariable('theNumber', 'hello!')
    await expectAsync(replacer.replace('${num:theNumber}'))
        .toBeRejectedWithError(TypeError, 'Invalid number in expression "num:theNumber" (value=hello!)')
  })

  it('should fail converting invalid booleans', async () => {
    const replacer = new Replacer()
    replacer.setVariable('theBoolean', 'hello!')
    await expectAsync(replacer.replace('${bool:theBoolean}'))
        .toBeRejectedWithError(TypeError, 'Invalid boolean in expression "bool:theBoolean" (value=hello!)')
  })

  it('should fail converting unsupported expressions', async () => {
    await expectAsync(new Replacer().replace('${ foo : bar}'))
        .toBeRejectedWithError(TypeError, 'Unsupported type "foo" in expression "foo : bar"')
  })

  it('should fail setting variables with an invalid name', async () => {
    const replacer = new Replacer()
    expect(() => replacer.setVariable('foo:bar', 1)).toThrowError(TypeError, 'Invalid variable name "foo:bar"')
    expect(() => replacer.setVariable('FOO BAR', 1)).toThrowError(TypeError, 'Invalid variable name "FOO BAR"')
  })

  it('should not set variables from nested object', async () => {
    await expectAsync(new Replacer().replace({
      one: { two: 3 },
      four: '${ two }',
    }, true)).toBeRejectedWithError(TypeError, 'Unknown local variable "two"')
  })
})
