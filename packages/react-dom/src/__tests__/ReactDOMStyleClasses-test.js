/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

describe('ReactDOMStyleClasses', () => {
  let React;
  let ReactDOM;
  let ReactDOMServer;
  let act;

  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMServer = require('react-dom/server');
    act = require('jest-react').act;
  });

  // @gate enableClassInStyle
  it('renders style classes as className', () => {
    const container = document.createElement('div');
    act(() => {
      ReactDOM.createRoot(container).render(
        <div style={{width: ';w-100', height: ';h-100'}} />,
      );
    });
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-100 h-100');
  });

  // @gate enableClassInStyle
  it('server renders style classes as classNames', () => {
    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(
      <div style={{width: ';w-100', height: ';h-100'}} />,
    );
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-100 h-100');

    act(() => {
      ReactDOM.hydrateRoot(
        container,
        <div style={{width: ';w-100', height: ';h-100'}} />,
      );
    });

    const node2 = container.firstChild;
    expect(node2.style.width).toBe('');
    expect(node2.style.height).toBe('');
    expect(node2.className).toBe('w-100 h-100');
    expect(node).toBe(node2);
  });

  // @gate enableClassInStyle
  it('renders style classes combined with className', () => {
    const container = document.createElement('div');
    act(() => {
      ReactDOM.createRoot(container).render(
        <div className="foo bar" style={{width: ';w-100', height: ';h-100'}} />,
      );
    });
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('foo bar w-100 h-100');
  });

  // @gate enableClassInStyle
  it('renders style classes combined with className regardless of enumeration order', () => {
    const container = document.createElement('div');
    act(() => {
      ReactDOM.createRoot(container).render(
        <div style={{width: ';w-100', height: ';h-100'}} className="foo bar" />,
      );
    });
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('foo bar w-100 h-100');
  });

  // @gate enableClassInStyle
  it('server renders style classes combined with classNames', () => {
    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(
      <div className="foo bar" style={{width: ';w-100', height: ';h-100'}} />,
    );
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('foo bar w-100 h-100');

    act(() => {
      ReactDOM.hydrateRoot(
        container,
        <div className="foo bar" style={{width: ';w-100', height: ';h-100'}} />,
      );
    });

    const node2 = container.firstChild;
    expect(node2.style.width).toBe('');
    expect(node2.style.height).toBe('');
    expect(node2.className).toBe('foo bar w-100 h-100');
    expect(node).toBe(node2);
  });

  // @gate enableClassInStyle
  it('warns if the server values mismatches', () => {
    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(
      <div style={{width: ';w-100', height: ';h-100'}} />,
    );
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-100 h-100');

    expect(() => {
      act(() => {
        ReactDOM.hydrateRoot(
          container,
          <div style={{width: ';w-150', height: ';h-200'}} />,
        );
      });
    }).toErrorDev('Expected className to be different.');

    const node2 = container.firstChild;
    expect(node2.style.width).toBe('');
    expect(node2.style.height).toBe('');
    expect(node2.className).toBe('w-150 h-200');
    expect(node).not.toBe(node2);
  });

  // @gate enableClassInStyle
  it('updates style classes as classNames', () => {
    const container = document.createElement('div');
    const root = ReactDOM.createRoot(container);
    act(() => {
      root.render(<div style={{width: ';w-100', height: ';h-100'}} />);
    });
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-100 h-100');

    act(() => {
      root.render(<div style={{width: ';w-150', height: ';h-200'}} />);
    });

    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-150 h-200');
  });

  // @gate enableClassInStyle
  it('updates removes classes', () => {
    const container = document.createElement('div');
    const root = ReactDOM.createRoot(container);
    act(() => {
      root.render(<div style={{width: ';w-100', height: ';h-100'}} />);
    });
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-100 h-100');

    act(() => {
      root.render(<div style={{width: ';w-100'}} />);
    });

    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-100');
  });

  // @gate enableClassInStyle
  it('updates from inline to styles and back', () => {
    const container = document.createElement('div');
    const root = ReactDOM.createRoot(container);
    act(() => {
      root.render(<div style={{width: ';w-100', height: '200px'}} />);
    });
    const node = container.firstChild;
    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('200px');
    expect(node.className).toBe('w-100');

    act(() => {
      root.render(<div style={{width: ';w-100', height: ';h-100'}} />);
    });

    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('');
    expect(node.className).toBe('w-100 h-100');

    act(() => {
      root.render(<div style={{width: ';w-100', height: '300px'}} />);
    });

    expect(node.style.width).toBe('');
    expect(node.style.height).toBe('300px');
    expect(node.className).toBe('w-100');
  });
});
