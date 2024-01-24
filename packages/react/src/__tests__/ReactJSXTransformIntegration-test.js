/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let act;

let React;
let ReactDOMClient;
let ReactTestUtils;
let act;

// TODO: Historically this module was used to confirm that the JSX transform
// produces the correct output. However, most users (and indeed our own test
// suite) use a tool like Babel or TypeScript to transform JSX; unlike the
// runtime, the transform is not part of React itself. So this is really just an
// integration suite for the Babel transform. We might consider deleting it. We
// should prefer to test the JSX runtime directly, in ReactCreateElement-test
// and ReactJsxRuntime-test. In the meantime, there's lots of overlap between
// those modules and this one.
describe('ReactJSXTransformIntegration', () => {
  let Component;

  beforeEach(() => {
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactTestUtils = require('react-dom/test-utils');
    act = require('internal-test-utils').act;

    Component = class extends React.Component {
      render() {
        return <div />;
      }
    };
  });

  it('sanity check: test environment is configured to compile JSX to the jsx() runtime', async () => {
    function App() {
      return <div />;
    }
    const source = App.toString();
    if (__DEV__) {
      expect(source).toContain('jsxDEV(');
    } else {
      expect(source).toContain('jsx(');
    }
    expect(source).not.toContain('React.createElement');
  });

  it('returns a complete element according to spec', () => {
    const element = <Component />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe(null);
    expect(element.ref).toBe(null);
    if (__DEV__) {
      expect(Object.isFrozen(element)).toBe(true);
      expect(Object.isFrozen(element.props)).toBe(true);
    }
    expect(element.props).toEqual({});
  });

  it('should warn when `key` is being accessed on composite element', async () => {
    class Child extends React.Component {
      render() {
        return <div>{this.props.key}</div>;
      }
    }
    class Parent extends React.Component {
      render() {
        return (
          <div>
            <Child key="0" />
            <Child key="1" />
            <Child key="2" />
          </div>
        );
      }
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));
    await expect(async () => {
      await act(() => {
        root.render(<Parent />);
      });
    }).toErrorDev(
      'Child: `key` is not a prop. Trying to access it will result ' +
        'in `undefined` being returned. If you need to access the same ' +
        'value within the child component, you should pass it as a different ' +
        'prop. (https://reactjs.org/link/special-props)',
    );
  });

  it('should warn when `key` is being accessed on a host element', () => {
    const element = <div key="3" />;
    expect(() => void element.props.key).toErrorDev(
      'div: `key` is not a prop. Trying to access it will result ' +
        'in `undefined` being returned. If you need to access the same ' +
        'value within the child component, you should pass it as a different ' +
        'prop. (https://reactjs.org/link/special-props)',
      {withoutStack: true},
    );
  });

  it('should warn when `ref` is being accessed', async () => {
    class Child extends React.Component {
      render() {
        return <div> {this.props.ref} </div>;
      }
    }
    class Parent extends React.Component {
      render() {
        return (
          <div>
            <Child ref={React.createRef()} />
          </div>
        );
      }
    }
    const root = ReactDOMClient.createRoot(document.createElement('div'));

    await expect(async () => {
      await act(() => {
        root.render(<Parent />);
      });
    }).toErrorDev(
      'Child: `ref` is not a prop. Trying to access it will result ' +
        'in `undefined` being returned. If you need to access the same ' +
        'value within the child component, you should pass it as a different ' +
        'prop. (https://reactjs.org/link/special-props)',
    );
  });

  it('allows a lower-case to be passed as the string type', () => {
    const element = <div />;
    expect(element.type).toBe('div');
    expect(element.key).toBe(null);
    expect(element.ref).toBe(null);
    const expectation = {};
    Object.freeze(expectation);
    expect(element.props).toEqual(expectation);
  });

  it('allows a string to be passed as the type', () => {
    const element = <div />;
    expect(element.type).toBe('div');
    expect(element.key).toBe(null);
    expect(element.ref).toBe(null);
    if (__DEV__) {
      expect(Object.isFrozen(element)).toBe(true);
      expect(Object.isFrozen(element.props)).toBe(true);
    }
    expect(element.props).toEqual({});
  });

  it('returns an immutable element', () => {
    const element = <Component />;
    if (__DEV__) {
      expect(() => (element.type = 'div')).toThrow();
    } else {
      expect(() => (element.type = 'div')).not.toThrow();
    }
  });

  it('does not reuse the object that is spread into props', () => {
    const config = {foo: 1};
    const element = <Component {...config} />;
    expect(element.props.foo).toBe(1);
    config.foo = 2;
    expect(element.props.foo).toBe(1);
  });

  it('extracts key and ref from the rest of the props', () => {
    const ref = React.createRef();
    const element = <Component key="12" ref={ref} foo="56" />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe('12');
    expect(element.ref).toBe(ref);
    if (__DEV__) {
      expect(Object.isFrozen(element)).toBe(true);
      expect(Object.isFrozen(element.props)).toBe(true);
    }
    expect(element.props).toEqual({foo: '56'});
  });

  it('extracts null key and ref', () => {
    const element = <Component key={null} ref={null} foo="12" />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe('null');
    expect(element.ref).toBe(null);
    if (__DEV__) {
      expect(Object.isFrozen(element)).toBe(true);
      expect(Object.isFrozen(element.props)).toBe(true);
    }
    expect(element.props).toEqual({foo: '12'});
  });

  it('ignores undefined key and ref', () => {
    const props = {
      foo: '56',
      key: undefined,
      ref: undefined,
    };
    const element = <Component {...props} />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe(null);
    expect(element.ref).toBe(null);
    if (__DEV__) {
      expect(Object.isFrozen(element)).toBe(true);
      expect(Object.isFrozen(element.props)).toBe(true);
    }
    expect(element.props).toEqual({foo: '56'});
  });

  it('ignores key and ref warning getters', () => {
    const elementA = <div />;
    const elementB = <div {...elementA.props} />;
    expect(elementB.key).toBe(null);
    expect(elementB.ref).toBe(null);
  });

  it('coerces the key to a string', () => {
    const element = <Component key={12} foo="56" />;
    expect(element.type).toBe(Component);
    expect(element.key).toBe('12');
    expect(element.ref).toBe(null);
    if (__DEV__) {
      expect(Object.isFrozen(element)).toBe(true);
      expect(Object.isFrozen(element.props)).toBe(true);
    }
    expect(element.props).toEqual({foo: '56'});
  });

  it('preserves the owner on the element', () => {
    let element;

    class Wrapper extends React.Component {
      render() {
        element = <Component />;
        return element;
      }
    }

    const instance = ReactTestUtils.renderIntoDocument(<Wrapper />);
    expect(element._owner.stateNode).toBe(instance);
  });

  it('merges JSX children onto the children prop', () => {
    const a = 1;
    const element = <Component children="text">{a}</Component>;
    expect(element.props.children).toBe(a);
  });

  it('does not override children if no JSX children are provided', () => {
    const element = <Component children="text" />;
    expect(element.props.children).toBe('text');
  });

  it('overrides children if null is provided as a JSX child', () => {
    const element = <Component children="text">{null}</Component>;
    expect(element.props.children).toBe(null);
  });

  it('overrides children if undefined is provided as an argument', () => {
    const element = <Component children="text">{undefined}</Component>;
    expect(element.props.children).toBe(undefined);

    const element2 = React.cloneElement(
      <Component children="text" />,
      {},
      undefined,
    );
    expect(element2.props.children).toBe(undefined);
  });

  it('merges JSX children onto the children prop in an array', () => {
    const a = 1;
    const b = 2;
    const c = 3;
    const element = (
      <Component>
        {a}
        {b}
        {c}
      </Component>
    );
    expect(element.props.children).toEqual([1, 2, 3]);
  });

  it('allows static methods to be called using the type property', () => {
    class StaticMethodComponent {
      static someStaticMethod() {
        return 'someReturnValue';
      }
      render() {
        return <div />;
      }
    }

    const element = <StaticMethodComponent />;
    expect(element.type.someStaticMethod()).toBe('someReturnValue');
  });

  it('identifies valid elements', () => {
    expect(React.isValidElement(<div />)).toEqual(true);
    expect(React.isValidElement(<Component />)).toEqual(true);

    expect(React.isValidElement(null)).toEqual(false);
    expect(React.isValidElement(true)).toEqual(false);
    expect(React.isValidElement({})).toEqual(false);
    expect(React.isValidElement('string')).toEqual(false);
    expect(React.isValidElement(Component)).toEqual(false);
    expect(React.isValidElement({type: 'div', props: {}})).toEqual(false);
  });

  it('is indistinguishable from a plain object', () => {
    const element = <div className="foo" />;
    const object = {};
    expect(element.constructor).toBe(object.constructor);
  });

  it('should use default prop value when removing a prop', async () => {
    class Component extends React.Component {
      render() {
        return <span />;
      }
    }
    Component.defaultProps = {fruit: 'persimmon'};

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    let instance;
    await act(() => {
      root.render(<Component fruit="mango" ref={ref => (instance = ref)} />);
    });
    expect(instance.props.fruit).toBe('mango');

    await act(() => {
      root.render(<Component ref={ref => (instance = ref)} />);
    });
    expect(instance.props.fruit).toBe('persimmon');
  });

  it('should normalize props with default values', () => {
    class NormalizingComponent extends React.Component {
      render() {
        return <span>{this.props.prop}</span>;
      }
    }
    NormalizingComponent.defaultProps = {prop: 'testKey'};

    const instance = ReactTestUtils.renderIntoDocument(
      <NormalizingComponent />,
    );
    expect(instance.props.prop).toBe('testKey');

    const inst2 = ReactTestUtils.renderIntoDocument(
      <NormalizingComponent prop={null} />,
    );
    expect(inst2.props.prop).toBe(null);
  });

  it('throws when changing a prop (in dev) after element creation', async () => {
    class Outer extends React.Component {
      render() {
        const el = <div className="moo" />;

        if (__DEV__) {
          expect(function () {
            el.props.className = 'quack';
          }).toThrow();
          expect(el.props.className).toBe('moo');
        } else {
          el.props.className = 'quack';
          expect(el.props.className).toBe('quack');
        }

        return el;
      }
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);

    await act(() => {
      root.render(<Outer color="orange" />);
    });
    if (__DEV__) {
      expect(container.firstChild.className).toBe('moo');
    } else {
      expect(container.firstChild.className).toBe('quack');
    }
  });

  it('throws when adding a prop (in dev) after element creation', async () => {
    const container = document.createElement('div');
    class Outer extends React.Component {
      render() {
        const el = <div>{this.props.sound}</div>;

        if (__DEV__) {
          expect(function () {
            el.props.className = 'quack';
          }).toThrow();
          expect(el.props.className).toBe(undefined);
        } else {
          el.props.className = 'quack';
          expect(el.props.className).toBe('quack');
        }

        return el;
      }
    }
    Outer.defaultProps = {sound: 'meow'};
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<Outer />);
    });
    expect(container.firstChild.textContent).toBe('meow');
    if (__DEV__) {
      expect(container.firstChild.className).toBe('');
    } else {
      expect(container.firstChild.className).toBe('quack');
    }
  });

  it('does not warn for NaN props', () => {
    class Test extends React.Component {
      render() {
        return <div />;
      }
    }
    const test = ReactTestUtils.renderIntoDocument(<Test value={+undefined} />);
    expect(test.props.value).toBeNaN();
  });
});
