/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Chunk, BinaryChunk, Destination} from './ReactServerStreamConfig';

import type {Postpone} from 'react/src/ReactPostpone';

import {
  enableBinaryFlight,
  enablePostpone,
  enableTaint,
  enableServerContext,
  enableServerComponentKeys,
} from 'shared/ReactFeatureFlags';

import {
  scheduleWork,
  flushBuffered,
  beginWriting,
  writeChunkAndReturn,
  stringToChunk,
  typedArrayToBinaryChunk,
  byteLengthOfChunk,
  byteLengthOfBinaryChunk,
  completeWriting,
  close,
  closeWithError,
} from './ReactServerStreamConfig';

export type {Destination, Chunk} from './ReactServerStreamConfig';

import type {
  ClientManifest,
  ClientReferenceMetadata,
  ClientReference,
  ClientReferenceKey,
  ServerReference,
  ServerReferenceId,
  Hints,
  HintCode,
  HintModel,
} from './ReactFlightServerConfig';
import type {ContextSnapshot} from './ReactFlightNewContext';
import type {ThenableState} from './ReactFlightThenable';
import type {
  ReactProviderType,
  ServerContextJSONValue,
  Wakeable,
  Thenable,
  PendingThenable,
  FulfilledThenable,
  RejectedThenable,
  ReactServerContext,
} from 'shared/ReactTypes';
import type {LazyComponent} from 'react/src/ReactLazy';

import {
  resolveClientReferenceMetadata,
  getServerReferenceId,
  getServerReferenceBoundArguments,
  getClientReferenceKey,
  isClientReference,
  isServerReference,
  supportsRequestStorage,
  requestStorage,
  prepareHostDispatcher,
  createHints,
  initAsyncDebugInfo,
} from './ReactFlightServerConfig';

import {
  HooksDispatcher,
  prepareToUseHooksForRequest,
  prepareToUseHooksForComponent,
  getThenableStateAfterSuspending,
  resetHooksForRequest,
} from './ReactFlightHooks';
import {DefaultCacheDispatcher} from './flight/ReactFlightServerCache';
import {
  pushProvider,
  popProvider,
  switchContext,
  getActiveContext,
  rootContextSnapshot,
} from './ReactFlightNewContext';

import {
  getIteratorFn,
  REACT_ELEMENT_TYPE,
  REACT_FORWARD_REF_TYPE,
  REACT_FRAGMENT_TYPE,
  REACT_LAZY_TYPE,
  REACT_MEMO_TYPE,
  REACT_POSTPONE_TYPE,
  REACT_PROVIDER_TYPE,
} from 'shared/ReactSymbols';

import {
  describeValueForErrorMessage,
  describeObjectForErrorMessage,
  isSimpleObject,
  jsxPropsParents,
  jsxChildrenParents,
  objectName,
} from 'shared/ReactSerializationErrors';

import {getOrCreateServerContext} from 'shared/ReactServerContextRegistry';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import ReactServerSharedInternals from './ReactServerSharedInternals';
import isArray from 'shared/isArray';
import getPrototypeOf from 'shared/getPrototypeOf';
import binaryToComparableString from 'shared/binaryToComparableString';

import {SuspenseException, getSuspendedThenable} from './ReactFlightThenable';

initAsyncDebugInfo();

const ObjectPrototype = Object.prototype;

type JSONValue =
  | string
  | boolean
  | number
  | null
  | {+[key: string]: JSONValue}
  | $ReadOnlyArray<JSONValue>;

const stringify = JSON.stringify;

type ReactJSONValue =
  | string
  | boolean
  | number
  | null
  | $ReadOnlyArray<ReactJSONValue>
  | ReactClientObject;

// Serializable values
export type ReactClientValue =
  // Server Elements and Lazy Components are unwrapped on the Server
  | React$Element<React$AbstractComponent<any, any>>
  | LazyComponent<ReactClientValue, any>
  // References are passed by their value
  | ClientReference<any>
  | ServerReference<any>
  // The rest are passed as is. Sub-types can be passed in but lose their
  // subtype, so the receiver can only accept once of these.
  | React$Element<string>
  | React$Element<ClientReference<any> & any>
  | ReactServerContext<any>
  | string
  | boolean
  | number
  | symbol
  | null
  | void
  | bigint
  | Iterable<ReactClientValue>
  | Array<ReactClientValue>
  | Map<ReactClientValue, ReactClientValue>
  | Set<ReactClientValue>
  | Date
  | ReactClientObject
  | Promise<ReactClientValue>; // Thenable<ReactClientValue>

type ReactClientObject = {+[key: string]: ReactClientValue};

const PENDING = 0;
const COMPLETED = 1;
const ABORTED = 3;
const ERRORED = 4;

type Task = {
  id: number,
  status: 0 | 1 | 3 | 4,
  model: ReactClientValue,
  ping: () => void,
  context: ContextSnapshot,
  thenableState: ThenableState | null,
};

interface Reference {}

export type Request = {
  status: 0 | 1 | 2,
  flushScheduled: boolean,
  fatalError: mixed,
  destination: null | Destination,
  bundlerConfig: ClientManifest,
  cache: Map<Function, mixed>,
  nextChunkId: number,
  pendingChunks: number,
  hints: Hints,
  abortableTasks: Set<Task>,
  pingedTasks: Array<Task>,
  completedImportChunks: Array<Chunk>,
  completedHintChunks: Array<Chunk>,
  completedRegularChunks: Array<Chunk | BinaryChunk>,
  completedErrorChunks: Array<Chunk>,
  writtenSymbols: Map<symbol, number>,
  writtenClientReferences: Map<ClientReferenceKey, number>,
  writtenServerReferences: Map<ServerReference<any>, number>,
  writtenProviders: Map<string, number>,
  writtenObjects: WeakMap<Reference, number>, // -1 means "seen" but not outlined.
  identifierPrefix: string,
  identifierCount: number,
  taintCleanupQueue: Array<string | bigint>,
  onError: (error: mixed) => ?string,
  onPostpone: (reason: string) => void,
  toJSON: (key: string, value: ReactClientValue) => ReactJSONValue,
};

const {
  TaintRegistryObjects,
  TaintRegistryValues,
  TaintRegistryByteLengths,
  TaintRegistryPendingRequests,
  ReactCurrentCache,
} = ReactServerSharedInternals;
const ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;

function throwTaintViolation(message: string) {
  // eslint-disable-next-line react-internal/prod-error-codes
  throw new Error(message);
}

function cleanupTaintQueue(request: Request): void {
  const cleanupQueue = request.taintCleanupQueue;
  TaintRegistryPendingRequests.delete(cleanupQueue);
  for (let i = 0; i < cleanupQueue.length; i++) {
    const entryValue = cleanupQueue[i];
    const entry = TaintRegistryValues.get(entryValue);
    if (entry !== undefined) {
      if (entry.count === 1) {
        TaintRegistryValues.delete(entryValue);
      } else {
        entry.count--;
      }
    }
  }
  cleanupQueue.length = 0;
}

function defaultErrorHandler(error: mixed) {
  console['error'](error);
  // Don't transform to our wrapper
}

function defaultPostponeHandler(reason: string) {
  // Noop
}

const OPEN = 0;
const CLOSING = 1;
const CLOSED = 2;

export function createRequest(
  model: ReactClientValue,
  bundlerConfig: ClientManifest,
  onError: void | ((error: mixed) => ?string),
  context?: Array<[string, ServerContextJSONValue]>,
  identifierPrefix?: string,
  onPostpone: void | ((reason: string) => void),
): Request {
  if (
    ReactCurrentCache.current !== null &&
    ReactCurrentCache.current !== DefaultCacheDispatcher
  ) {
    throw new Error(
      'Currently React only supports one RSC renderer at a time.',
    );
  }
  prepareHostDispatcher();
  ReactCurrentCache.current = DefaultCacheDispatcher;

  const abortSet: Set<Task> = new Set();
  const pingedTasks: Array<Task> = [];
  const cleanupQueue: Array<string | bigint> = [];
  if (enableTaint) {
    TaintRegistryPendingRequests.add(cleanupQueue);
  }
  const hints = createHints();
  const request: Request = {
    status: OPEN,
    flushScheduled: false,
    fatalError: null,
    destination: null,
    bundlerConfig,
    cache: new Map(),
    nextChunkId: 0,
    pendingChunks: 0,
    hints,
    abortableTasks: abortSet,
    pingedTasks: pingedTasks,
    completedImportChunks: ([]: Array<Chunk>),
    completedHintChunks: ([]: Array<Chunk>),
    completedRegularChunks: ([]: Array<Chunk | BinaryChunk>),
    completedErrorChunks: ([]: Array<Chunk>),
    writtenSymbols: new Map(),
    writtenClientReferences: new Map(),
    writtenServerReferences: new Map(),
    writtenProviders: new Map(),
    writtenObjects: new WeakMap(),
    identifierPrefix: identifierPrefix || '',
    identifierCount: 1,
    taintCleanupQueue: cleanupQueue,
    onError: onError === undefined ? defaultErrorHandler : onError,
    onPostpone: onPostpone === undefined ? defaultPostponeHandler : onPostpone,
    // $FlowFixMe[missing-this-annot]
    toJSON: function (key: string, value: ReactClientValue): ReactJSONValue {
      return resolveModelToJSON(request, this, key, value);
    },
  };
  request.pendingChunks++;
  const rootContext = createRootContext(context);
  const rootTask = createTask(request, model, rootContext, abortSet);
  pingedTasks.push(rootTask);
  return request;
}

let currentRequest: null | Request = null;

export function resolveRequest(): null | Request {
  if (currentRequest) return currentRequest;
  if (supportsRequestStorage) {
    const store = requestStorage.getStore();
    if (store) return store;
  }
  return null;
}

function createRootContext(
  reqContext?: Array<[string, ServerContextJSONValue]>,
) {
  return importServerContexts(reqContext);
}

const POP = {};

function serializeThenable(request: Request, thenable: Thenable<any>): number {
  request.pendingChunks++;
  const newTask = createTask(
    request,
    null,
    getActiveContext(),
    request.abortableTasks,
  );

  switch (thenable.status) {
    case 'fulfilled': {
      // We have the resolved value, we can go ahead and schedule it for serialization.
      newTask.model = thenable.value;
      pingTask(request, newTask);
      return newTask.id;
    }
    case 'rejected': {
      const x = thenable.reason;
      if (
        enablePostpone &&
        typeof x === 'object' &&
        x !== null &&
        (x: any).$$typeof === REACT_POSTPONE_TYPE
      ) {
        const postponeInstance: Postpone = (x: any);
        logPostpone(request, postponeInstance.message);
        emitPostponeChunk(request, newTask.id, postponeInstance);
      } else {
        const digest = logRecoverableError(request, x);
        emitErrorChunk(request, newTask.id, digest, x);
      }
      return newTask.id;
    }
    default: {
      if (typeof thenable.status === 'string') {
        // Only instrument the thenable if the status if not defined. If
        // it's defined, but an unknown value, assume it's been instrumented by
        // some custom userspace implementation. We treat it as "pending".
        break;
      }
      const pendingThenable: PendingThenable<mixed> = (thenable: any);
      pendingThenable.status = 'pending';
      pendingThenable.then(
        fulfilledValue => {
          if (thenable.status === 'pending') {
            const fulfilledThenable: FulfilledThenable<mixed> = (thenable: any);
            fulfilledThenable.status = 'fulfilled';
            fulfilledThenable.value = fulfilledValue;
          }
        },
        (error: mixed) => {
          if (thenable.status === 'pending') {
            const rejectedThenable: RejectedThenable<mixed> = (thenable: any);
            rejectedThenable.status = 'rejected';
            rejectedThenable.reason = error;
          }
        },
      );
      break;
    }
  }

  thenable.then(
    value => {
      newTask.model = value;
      pingTask(request, newTask);
    },
    reason => {
      if (
        enablePostpone &&
        typeof reason === 'object' &&
        reason !== null &&
        (reason: any).$$typeof === REACT_POSTPONE_TYPE
      ) {
        const postponeInstance: Postpone = (reason: any);
        logPostpone(request, postponeInstance.message);
        emitPostponeChunk(request, newTask.id, postponeInstance);
      } else {
        newTask.status = ERRORED;
        const digest = logRecoverableError(request, reason);
        emitErrorChunk(request, newTask.id, digest, reason);
      }
      request.abortableTasks.delete(newTask);
      if (request.destination !== null) {
        flushCompletedChunks(request, request.destination);
      }
    },
  );

  return newTask.id;
}

export function emitHint<Code: HintCode>(
  request: Request,
  code: Code,
  model: HintModel<Code>,
): void {
  emitHintChunk(request, code, model);
  enqueueFlush(request);
}

export function getHints(request: Request): Hints {
  return request.hints;
}

export function getCache(request: Request): Map<Function, mixed> {
  return request.cache;
}

function readThenable<T>(thenable: Thenable<T>): T {
  if (thenable.status === 'fulfilled') {
    return thenable.value;
  } else if (thenable.status === 'rejected') {
    throw thenable.reason;
  }
  throw thenable;
}

function createLazyWrapperAroundWakeable(wakeable: Wakeable) {
  // This is a temporary fork of the `use` implementation until we accept
  // promises everywhere.
  const thenable: Thenable<mixed> = (wakeable: any);
  switch (thenable.status) {
    case 'fulfilled':
    case 'rejected':
      break;
    default: {
      if (typeof thenable.status === 'string') {
        // Only instrument the thenable if the status if not defined. If
        // it's defined, but an unknown value, assume it's been instrumented by
        // some custom userspace implementation. We treat it as "pending".
        break;
      }
      const pendingThenable: PendingThenable<mixed> = (thenable: any);
      pendingThenable.status = 'pending';
      pendingThenable.then(
        fulfilledValue => {
          if (thenable.status === 'pending') {
            const fulfilledThenable: FulfilledThenable<mixed> = (thenable: any);
            fulfilledThenable.status = 'fulfilled';
            fulfilledThenable.value = fulfilledValue;
          }
        },
        (error: mixed) => {
          if (thenable.status === 'pending') {
            const rejectedThenable: RejectedThenable<mixed> = (thenable: any);
            rejectedThenable.status = 'rejected';
            rejectedThenable.reason = error;
          }
        },
      );
      break;
    }
  }
  const lazyType: LazyComponent<any, Thenable<any>> = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: thenable,
    _init: readThenable,
  };
  return lazyType;
}

function renderClientElement(
  parentKey: void | null | string,
  type: any,
  key: null | React$Key,
  props: any,
  childIndex: number,
): ReactClientValue {
  if (parentKey === undefined) {
    // We have no parent server component abstraction wrapping this node.
    return [REACT_ELEMENT_TYPE, type, key, props];
  }
  /*
  if (parentKey === null) {
    // We had parent abstractions that were their own slots but they don't
    // have any keys by themselves. We wrap the child in a fragment to ensure
    // that the slot gets consumed because a single child in an abstraction
    // is the same as a single item set.
    if (key !== null) {
      // return [REACT_ELEMENT_TYPE, type, null, props];
      // return [REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, 'hello' + childIndex, {children: 
      //   [REACT_ELEMENT_TYPE, type, key, props]
      // }];
      return [[REACT_ELEMENT_TYPE, type, key, props]];
    }
    return [REACT_ELEMENT_TYPE, type, key, props];
  }
  */
  // We had a parent for this sequence of abstractions. We can combine it with
  // the key of the element and key the result. This is not actually correct
  // because it should reconcile with a set containing that single key.

  if (parentKey[0] === '0' && (parentKey.length === 1 || parentKey[1] === ',') && childIndex === undefined) {
    // The root grand parent had a null key.
    // To separate it from other parents we give it a null key.
    if (key === null) {
      key = parentKey + (childIndex || 0);
    } else {
      key = parentKey + ',' + key;
    }
    return [[REACT_ELEMENT_TYPE, type, key, props]];
    // return [REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, null, {children: 
    //   [REACT_ELEMENT_TYPE, type, key, props]
    // }];
    // return [];
  }

  /*
  if (parentKey[0] === '@') {
    // The root grand parent had a null key, but then an inner parent had key.
    if (key === null) {
      key = parentKey.substr(1);
    } else {
      key = parentKey.substr(1) + ',' + key;
    }
    return [[REACT_ELEMENT_TYPE, type, key, props]];
    // return [REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, null, {children: 
    //   [REACT_ELEMENT_TYPE, type, key, props]
    // }];
    // return [];
  }
  */
  if (key === null) {
    key = parentKey + ',' + (childIndex || 0);
  } else {
    key = parentKey + ',' + key;
  }
  return [REACT_ELEMENT_TYPE, type, key, props];
}

let isInArray = false;
function wrap(request: Request, grandParentKey: void | null | string, key: null | React$Key, result: any) {
  if (Array.isArray(result)) {
    console.log('split', result)
  }
  if (Array.isArray(result) && !isInArray) {
    const newArray = [];
    for (let i = 0; i< result.length; i++) {
      let parentKey = grandParentKey;
      let value = result[i];
      isInArray = true;
      while (
        typeof value === 'object' &&
        value !== null &&
        ((value: any).$$typeof === REACT_ELEMENT_TYPE ||
          (value: any).$$typeof === REACT_LAZY_TYPE)
      ) {
        switch ((value: any).$$typeof) {
          case REACT_ELEMENT_TYPE: {
            const nextElement: React$Element<any> = (value: any);
            const key2: null | React$Key = nextElement.key;
            console.log('render', parentKey, '|', key2);
            value = renderElement(
              request,
              parentKey,
              nextElement.type,
              key2,
              nextElement.ref,
              nextElement.props,
              null,
              i
            );
            // Add the key before rendering the next parent.
            if (parentKey == null) {
              if (key2 === null) {
                // We're inside a Server Component or Fragment.
                parentKey = '' + i;
              } else {
                parentKey = '' + key2;
              }
            } else {
              if (key2 === null) {
                // Nothing to add.
                parentKey += ',' + i;
              } else {
                // Combine the key into a composite key.
                parentKey += ',' + key2;
              }
            }
            break;
          }
          case REACT_LAZY_TYPE: {
            const payload = (value: any)._payload;
            const init = (value: any)._init;
            value = init(payload);
            break;
          }
        }
      }
      isInArray = false;
      newArray.push(value);
    }
    return newArray;
  }

  // if (key !== null && Array.isArray(result)) {
  //  return [REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, key, {children: result}];
  // }
  return result;
  /*
  if (key !== null) {
    return [REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, key, {children: result}];
  }
  if (parentKey !== undefined) {
    // This would be wrong if the component in a different condition returns an
    // array. Then it would no longer line up. This would only be an issue if this
    // is happening more than one level down.
    return result;
  }
  if (
    typeof result === 'object' &&
    result !== null &&
    result.$$typeof === REACT_ELEMENT_TYPE &&
    result.type !== REACT_FRAGMENT_TYPE
  ) {
    return [result];
  }
  return result;
  */
}

function renderElement(
  request: Request,
  parentKey: void | null | string,
  type: any,
  key: null | React$Key,
  ref: mixed,
  props: any,
  prevThenableState: ThenableState | null,
  childIndex: number,
): ReactClientValue {
  if (ref !== null && ref !== undefined) {
    // When the ref moves to the regular props object this will implicitly
    // throw for functions. We could probably relax it to a DEV warning for other
    // cases.
    throw new Error(
      'Refs cannot be used in Server Components, nor passed to Client Components.',
    );
  }
  if (__DEV__) {
    jsxPropsParents.set(props, type);
    if (typeof props.children === 'object' && props.children !== null) {
      jsxChildrenParents.set(props.children, type);
    }
  }
  if (typeof type === 'function') {
    if (isClientReference(type)) {
      // This is a reference to a Client Component.
      return renderClientElement(parentKey, type, key, props, childIndex);
    }
    // This is a server-side component.
    prepareToUseHooksForComponent(prevThenableState);
    const result = type(props);
    if (
      typeof result === 'object' &&
      result !== null &&
      typeof result.then === 'function'
    ) {
      // When the return value is in children position we can resolve it immediately,
      // to its value without a wrapper if it's synchronously available.
      const thenable: Thenable<any> = result;
      if (thenable.status === 'fulfilled') {
        return wrap(request, parentKey, key, thenable.value);
      }
      // TODO: Once we accept Promises as children on the client, we can just return
      // the thenable here.
      return wrap(request, parentKey, key, createLazyWrapperAroundWakeable(result));
    }
    return wrap(request, parentKey, key, result);
  } else if (typeof type === 'string') {
    // This is a host element. E.g. HTML.
    return renderClientElement(parentKey, type, key, props, childIndex);
  } else if (typeof type === 'symbol') {
    if (type === REACT_FRAGMENT_TYPE) {
      // For key-less fragments, we add a small optimization to avoid serializing
      // it as a wrapper.
      if (Array.isArray(props.children) && parentKey != null) {
        // return [REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, parentKey, props];
      }
      return wrap(request, parentKey, key, props.children);
    }
    // This might be a built-in React component. We'll let the client decide.
    // Any built-in works as long as its props are serializable.
    return renderClientElement(parentKey, type, key, props, childIndex);
  } else if (type != null && typeof type === 'object') {
    if (isClientReference(type)) {
      // This is a reference to a Client Component.
      return renderClientElement(parentKey, type, key, props, childIndex);
    }
    switch (type.$$typeof) {
      case REACT_LAZY_TYPE: {
        const payload = type._payload;
        const init = type._init;
        const wrappedType = init(payload);
        return renderElement(
          request,
          parentKey,
          wrappedType,
          key,
          ref,
          props,
          prevThenableState,
          childIndex
        );
      }
      case REACT_FORWARD_REF_TYPE: {
        const render = type.render;
        prepareToUseHooksForComponent(prevThenableState);
        return render(props, undefined);
      }
      case REACT_MEMO_TYPE: {
        return renderElement(
          request,
          parentKey,
          type.type,
          key,
          ref,
          props,
          prevThenableState,
          childIndex,
        );
      }
      case REACT_PROVIDER_TYPE: {
        if (enableServerContext) {
          pushProvider(type._context, props.value);
          if (__DEV__) {
            const extraKeys = Object.keys(props).filter(value => {
              if (value === 'children' || value === 'value') {
                return false;
              }
              return true;
            });
            if (extraKeys.length !== 0) {
              console.error(
                'ServerContext can only have a value prop and children. Found: %s',
                JSON.stringify(extraKeys),
              );
            }
          }
          return renderClientElement(
            parentKey,
            type,
            key,
            // Rely on __popProvider being serialized last to pop the provider.
            {value: props.value, children: props.children, __pop: POP},
            childIndex
          );
        }
        // Fallthrough
      }
    }
  }
  throw new Error(
    `Unsupported Server Component type: ${describeValueForErrorMessage(type)}`,
  );
}

function pingTask(request: Request, task: Task): void {
  const pingedTasks = request.pingedTasks;
  pingedTasks.push(task);
  if (pingedTasks.length === 1) {
    request.flushScheduled = request.destination !== null;
    scheduleWork(() => performWork(request));
  }
}

function createTask(
  request: Request,
  model: ReactClientValue,
  context: ContextSnapshot,
  abortSet: Set<Task>,
): Task {
  const id = request.nextChunkId++;
  const task: Task = {
    id,
    status: PENDING,
    model,
    context,
    ping: () => pingTask(request, task),
    thenableState: null,
  };
  abortSet.add(task);
  return task;
}

function serializeByValueID(id: number): string {
  return '$' + id.toString(16);
}

function serializeLazyID(id: number): string {
  return '$L' + id.toString(16);
}

function serializePromiseID(id: number): string {
  return '$@' + id.toString(16);
}

function serializeServerReferenceID(id: number): string {
  return '$F' + id.toString(16);
}

function serializeSymbolReference(name: string): string {
  return '$S' + name;
}

function serializeProviderReference(name: string): string {
  return '$P' + name;
}

function serializeNumber(number: number): string | number {
  if (Number.isFinite(number)) {
    if (number === 0 && 1 / number === -Infinity) {
      return '$-0';
    } else {
      return number;
    }
  } else {
    if (number === Infinity) {
      return '$Infinity';
    } else if (number === -Infinity) {
      return '$-Infinity';
    } else {
      return '$NaN';
    }
  }
}

function serializeUndefined(): string {
  return '$undefined';
}

function serializeDateFromDateJSON(dateJSON: string): string {
  // JSON.stringify automatically calls Date.prototype.toJSON which calls toISOString.
  // We need only tack on a $D prefix.
  return '$D' + dateJSON;
}

function serializeBigInt(n: bigint): string {
  return '$n' + n.toString(10);
}

function serializeRowHeader(tag: string, id: number) {
  return id.toString(16) + ':' + tag;
}

function encodeReferenceChunk(
  request: Request,
  id: number,
  reference: string,
): Chunk {
  const json = stringify(reference);
  const row = id.toString(16) + ':' + json + '\n';
  return stringToChunk(row);
}

function serializeClientReference(
  request: Request,
  parent:
    | {+[key: string | number]: ReactClientValue}
    | $ReadOnlyArray<ReactClientValue>,
  key: string,
  clientReference: ClientReference<any>,
): string {
  const clientReferenceKey: ClientReferenceKey =
    getClientReferenceKey(clientReference);
  const writtenClientReferences = request.writtenClientReferences;
  const existingId = writtenClientReferences.get(clientReferenceKey);
  if (existingId !== undefined) {
    if (parent[0] === REACT_ELEMENT_TYPE && key === '1') {
      // If we're encoding the "type" of an element, we can refer
      // to that by a lazy reference instead of directly since React
      // knows how to deal with lazy values. This lets us suspend
      // on this component rather than its parent until the code has
      // loaded.
      return serializeLazyID(existingId);
    }
    return serializeByValueID(existingId);
  }
  try {
    const clientReferenceMetadata: ClientReferenceMetadata =
      resolveClientReferenceMetadata(request.bundlerConfig, clientReference);
    request.pendingChunks++;
    const importId = request.nextChunkId++;
    emitImportChunk(request, importId, clientReferenceMetadata);
    writtenClientReferences.set(clientReferenceKey, importId);
    if (parent[0] === REACT_ELEMENT_TYPE && key === '1') {
      // If we're encoding the "type" of an element, we can refer
      // to that by a lazy reference instead of directly since React
      // knows how to deal with lazy values. This lets us suspend
      // on this component rather than its parent until the code has
      // loaded.
      return serializeLazyID(importId);
    }
    return serializeByValueID(importId);
  } catch (x) {
    request.pendingChunks++;
    const errorId = request.nextChunkId++;
    const digest = logRecoverableError(request, x);
    emitErrorChunk(request, errorId, digest, x);
    return serializeByValueID(errorId);
  }
}

function outlineModel(request: Request, value: any): number {
  request.pendingChunks++;
  const newTask = createTask(
    request,
    value,
    getActiveContext(),
    request.abortableTasks,
  );
  retryTask(request, newTask);
  return newTask.id;
}

function serializeServerReference(
  request: Request,
  parent:
    | {+[key: string | number]: ReactClientValue}
    | $ReadOnlyArray<ReactClientValue>,
  key: string,
  serverReference: ServerReference<any>,
): string {
  const writtenServerReferences = request.writtenServerReferences;
  const existingId = writtenServerReferences.get(serverReference);
  if (existingId !== undefined) {
    return serializeServerReferenceID(existingId);
  }

  const bound: null | Array<any> = getServerReferenceBoundArguments(
    request.bundlerConfig,
    serverReference,
  );
  const serverReferenceMetadata: {
    id: ServerReferenceId,
    bound: null | Promise<Array<any>>,
  } = {
    id: getServerReferenceId(request.bundlerConfig, serverReference),
    bound: bound ? Promise.resolve(bound) : null,
  };
  const metadataId = outlineModel(request, serverReferenceMetadata);
  writtenServerReferences.set(serverReference, metadataId);
  return serializeServerReferenceID(metadataId);
}

function serializeLargeTextString(request: Request, text: string): string {
  request.pendingChunks += 2;
  const textId = request.nextChunkId++;
  const textChunk = stringToChunk(text);
  const binaryLength = byteLengthOfChunk(textChunk);
  const row = textId.toString(16) + ':T' + binaryLength.toString(16) + ',';
  const headerChunk = stringToChunk(row);
  request.completedRegularChunks.push(headerChunk, textChunk);
  return serializeByValueID(textId);
}

function serializeMap(
  request: Request,
  map: Map<ReactClientValue, ReactClientValue>,
): string {
  const entries = Array.from(map);
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i][0];
    if (typeof key === 'object' && key !== null) {
      const writtenObjects = request.writtenObjects;
      const existingId = writtenObjects.get(key);
      if (existingId === undefined) {
        // Mark all object keys as seen so that they're always outlined.
        writtenObjects.set(key, -1);
      }
    }
  }
  const id = outlineModel(request, entries);
  return '$Q' + id.toString(16);
}

function serializeSet(request: Request, set: Set<ReactClientValue>): string {
  const entries = Array.from(set);
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i];
    if (typeof key === 'object' && key !== null) {
      const writtenObjects = request.writtenObjects;
      const existingId = writtenObjects.get(key);
      if (existingId === undefined) {
        // Mark all object keys as seen so that they're always outlined.
        writtenObjects.set(key, -1);
      }
    }
  }
  const id = outlineModel(request, entries);
  return '$W' + id.toString(16);
}

function serializeTypedArray(
  request: Request,
  tag: string,
  typedArray: $ArrayBufferView,
): string {
  if (enableTaint) {
    if (TaintRegistryByteLengths.has(typedArray.byteLength)) {
      // If we have had any tainted values of this length, we check
      // to see if these bytes matches any entries in the registry.
      const tainted = TaintRegistryValues.get(
        binaryToComparableString(typedArray),
      );
      if (tainted !== undefined) {
        throwTaintViolation(tainted.message);
      }
    }
  }
  request.pendingChunks += 2;
  const bufferId = request.nextChunkId++;
  // TODO: Convert to little endian if that's not the server default.
  const binaryChunk = typedArrayToBinaryChunk(typedArray);
  const binaryLength = byteLengthOfBinaryChunk(binaryChunk);
  const row =
    bufferId.toString(16) + ':' + tag + binaryLength.toString(16) + ',';
  const headerChunk = stringToChunk(row);
  request.completedRegularChunks.push(headerChunk, binaryChunk);
  return serializeByValueID(bufferId);
}

function escapeStringValue(value: string): string {
  if (value[0] === '$') {
    // We need to escape $ prefixed strings since we use those to encode
    // references to IDs and as special symbol values.
    return '$' + value;
  } else {
    return value;
  }
}

let insideContextProps = null;
let isInsideContextValue = false;
let modelRoot: null | ReactClientValue = false;

function resolveModelToJSON(
  request: Request,
  parent:
    | {+[key: string | number]: ReactClientValue}
    | $ReadOnlyArray<ReactClientValue>,
  key: string,
  value: ReactClientValue,
): ReactJSONValue {
  // Make sure that `parent[key]` wasn't JSONified before `value` was passed to us
  if (__DEV__) {
    // $FlowFixMe[incompatible-use]
    const originalValue = parent[key];
    if (
      typeof originalValue === 'object' &&
      originalValue !== value &&
      !(originalValue instanceof Date)
    ) {
      if (objectName(originalValue) !== 'Object') {
        const jsxParentType = jsxChildrenParents.get(parent);
        if (typeof jsxParentType === 'string') {
          console.error(
            '%s objects cannot be rendered as text children. Try formatting it using toString().%s',
            objectName(originalValue),
            describeObjectForErrorMessage(parent, key),
          );
        } else {
          console.error(
            'Only plain objects can be passed to Client Components from Server Components. ' +
              '%s objects are not supported.%s',
            objectName(originalValue),
            describeObjectForErrorMessage(parent, key),
          );
        }
      } else {
        console.error(
          'Only plain objects can be passed to Client Components from Server Components. ' +
            'Objects with toJSON methods are not supported. Convert it manually ' +
            'to a simple value before passing it to props.%s',
          describeObjectForErrorMessage(parent, key),
        );
      }
    }
  }

  // Special Symbols
  switch (value) {
    case REACT_ELEMENT_TYPE:
      return '$';
  }

  if (__DEV__) {
    if (
      enableServerContext &&
      parent[0] === REACT_ELEMENT_TYPE &&
      parent[1] &&
      (parent[1]: any).$$typeof === REACT_PROVIDER_TYPE &&
      key === '3'
    ) {
      insideContextProps = value;
    } else if (insideContextProps === parent && key === 'value') {
      isInsideContextValue = true;
    } else if (insideContextProps === parent && key === 'children') {
      isInsideContextValue = false;
    }
  }

  // Resolve Server Components.
  let parentKey: void | null | string = undefined; // undefined means we're not inside a parent
  while (
    typeof value === 'object' &&
    value !== null &&
    ((value: any).$$typeof === REACT_ELEMENT_TYPE ||
      (value: any).$$typeof === REACT_LAZY_TYPE)
  ) {
    if (__DEV__) {
      if (enableServerContext && isInsideContextValue) {
        console.error('React elements are not allowed in ServerContext');
      }
    }

    try {
      switch ((value: any).$$typeof) {
        case REACT_ELEMENT_TYPE: {
          const writtenObjects = request.writtenObjects;
          const existingId = writtenObjects.get(value);
          if (existingId !== undefined) {
            if (existingId === -1) {
              // Seen but not yet outlined.
              const newId = outlineModel(request, value);
              return serializeByValueID(newId);
            } else if (modelRoot === value) {
              // This is the ID we're currently emitting so we need to write it
              // once but if we discover it again, we refer to it by id.
              modelRoot = null;
            } else {
              // We've already emitted this as an outlined object, so we can
              // just refer to that by its existing ID.
              return serializeByValueID(existingId);
            }
          } else {
            // This is the first time we've seen this object. We may never see it again
            // so we'll inline it. Mark it as seen. If we see it again, we'll outline.
            writtenObjects.set(value, -1);
          }

          const element: React$Element<any> = (value: any);
          // Attempt to render the Server Component.
          value = renderElement(
            request,
            parentKey,
            element.type,
            element.key,
            element.ref,
            element.props,
            null,
          );
          // Add the key before rendering the next parent.
          const key: null | React$Key = element.key;
          if (parentKey == null) {
            if (key === null) {
              // We're inside a Server Component or Fragment.
              parentKey = '0';
            } else {
              parentKey = '0,' + key;
            }
          } else {
            if (key === null) {
              // Nothing to add.
              parentKey += ',0';
            } else {
              // Combine the key into a composite key.
              parentKey += ',' + key;
            }
          }
          break;
        }
        case REACT_LAZY_TYPE: {
          const payload = (value: any)._payload;
          const init = (value: any)._init;
          value = init(payload);
          break;
        }
      }
    } catch (thrownValue) {
      const x =
        thrownValue === SuspenseException
          ? // This is a special type of exception used for Suspense. For historical
            // reasons, the rest of the Suspense implementation expects the thrown
            // value to be a thenable, because before `use` existed that was the
            // (unstable) API for suspending. This implementation detail can change
            // later, once we deprecate the old API in favor of `use`.
            getSuspendedThenable()
          : thrownValue;
      if (typeof x === 'object' && x !== null) {
        // $FlowFixMe[method-unbinding]
        if (typeof x.then === 'function') {
          // Something suspended, we'll need to create a new task and resolve it later.
          request.pendingChunks++;
          const newTask = createTask(
            request,
            value,
            getActiveContext(),
            request.abortableTasks,
          );
          newTask.parentKey = parentKey;
          const ping = newTask.ping;
          x.then(ping, ping);
          newTask.thenableState = getThenableStateAfterSuspending();
          return serializeLazyID(newTask.id);
        } else if (enablePostpone && x.$$typeof === REACT_POSTPONE_TYPE) {
          // Something postponed. We'll still send everything we have up until this point.
          // We'll replace this element with a lazy reference that postpones on the client.
          const postponeInstance: Postpone = (x: any);
          request.pendingChunks++;
          const postponeId = request.nextChunkId++;
          logPostpone(request, postponeInstance.message);
          emitPostponeChunk(request, postponeId, postponeInstance);
          return serializeLazyID(postponeId);
        }
      }
      // Something errored. We'll still send everything we have up until this point.
      // We'll replace this element with a lazy reference that throws on the client
      // once it gets rendered.
      request.pendingChunks++;
      const errorId = request.nextChunkId++;
      const digest = logRecoverableError(request, x);
      emitErrorChunk(request, errorId, digest, x);
      return serializeLazyID(errorId);
    }
  }

  if (value === null) {
    return null;
  }

  if (typeof value === 'object') {
    if (enableTaint) {
      const tainted = TaintRegistryObjects.get(value);
      if (tainted !== undefined) {
        throwTaintViolation(tainted);
      }
    }
    if (isClientReference(value)) {
      return serializeClientReference(request, parent, key, (value: any));
    }

    const writtenObjects = request.writtenObjects;
    const existingId = writtenObjects.get(value);
    // $FlowFixMe[method-unbinding]
    if (typeof value.then === 'function') {
      if (existingId !== undefined) {
        if (modelRoot === value) {
          // This is the ID we're currently emitting so we need to write it
          // once but if we discover it again, we refer to it by id.
          modelRoot = null;
        } else {
          // We've seen this promise before, so we can just refer to the same result.
          return serializePromiseID(existingId);
        }
      }
      // We assume that any object with a .then property is a "Thenable" type,
      // or a Promise type. Either of which can be represented by a Promise.
      const promiseId = serializeThenable(request, (value: any));
      writtenObjects.set(value, promiseId);
      return serializePromiseID(promiseId);
    }

    if (enableServerContext) {
      if ((value: any).$$typeof === REACT_PROVIDER_TYPE) {
        const providerKey = ((value: any): ReactProviderType<any>)._context
          ._globalName;
        const writtenProviders = request.writtenProviders;
        let providerId = writtenProviders.get(key);
        if (providerId === undefined) {
          request.pendingChunks++;
          providerId = request.nextChunkId++;
          writtenProviders.set(providerKey, providerId);
          emitProviderChunk(request, providerId, providerKey);
        }
        return serializeByValueID(providerId);
      } else if (value === POP) {
        popProvider();
        if (__DEV__) {
          insideContextProps = null;
          isInsideContextValue = false;
        }
        return (undefined: any);
      }
    }

    if (existingId !== undefined) {
      if (existingId === -1) {
        // Seen but not yet outlined.
        const newId = outlineModel(request, value);
        return serializeByValueID(newId);
      } else if (modelRoot === value) {
        // This is the ID we're currently emitting so we need to write it
        // once but if we discover it again, we refer to it by id.
        modelRoot = null;
      } else {
        // We've already emitted this as an outlined object, so we can
        // just refer to that by its existing ID.
        return serializeByValueID(existingId);
      }
    } else {
      // This is the first time we've seen this object. We may never see it again
      // so we'll inline it. Mark it as seen. If we see it again, we'll outline.
      writtenObjects.set(value, -1);
    }

    if (isArray(value)) {
      // $FlowFixMe[incompatible-return]
      return value;
    }

    if (value instanceof Map) {
      return serializeMap(request, value);
    }
    if (value instanceof Set) {
      return serializeSet(request, value);
    }

    if (enableBinaryFlight) {
      if (value instanceof ArrayBuffer) {
        return serializeTypedArray(request, 'A', new Uint8Array(value));
      }
      if (value instanceof Int8Array) {
        // char
        return serializeTypedArray(request, 'C', value);
      }
      if (value instanceof Uint8Array) {
        // unsigned char
        return serializeTypedArray(request, 'c', value);
      }
      if (value instanceof Uint8ClampedArray) {
        // unsigned clamped char
        return serializeTypedArray(request, 'U', value);
      }
      if (value instanceof Int16Array) {
        // sort
        return serializeTypedArray(request, 'S', value);
      }
      if (value instanceof Uint16Array) {
        // unsigned short
        return serializeTypedArray(request, 's', value);
      }
      if (value instanceof Int32Array) {
        // long
        return serializeTypedArray(request, 'L', value);
      }
      if (value instanceof Uint32Array) {
        // unsigned long
        return serializeTypedArray(request, 'l', value);
      }
      if (value instanceof Float32Array) {
        // float
        return serializeTypedArray(request, 'F', value);
      }
      if (value instanceof Float64Array) {
        // double
        return serializeTypedArray(request, 'D', value);
      }
      if (value instanceof BigInt64Array) {
        // number
        return serializeTypedArray(request, 'N', value);
      }
      if (value instanceof BigUint64Array) {
        // unsigned number
        // We use "m" instead of "n" since JSON can start with "null"
        return serializeTypedArray(request, 'm', value);
      }
      if (value instanceof DataView) {
        return serializeTypedArray(request, 'V', value);
      }
    }

    const iteratorFn = getIteratorFn(value);
    if (iteratorFn) {
      return Array.from((value: any));
    }

    // Verify that this is a simple plain object.
    const proto = getPrototypeOf(value);
    if (
      proto !== ObjectPrototype &&
      (proto === null || getPrototypeOf(proto) !== null)
    ) {
      throw new Error(
        'Only plain objects, and a few built-ins, can be passed to Client Components ' +
          'from Server Components. Classes or null prototypes are not supported.',
      );
    }
    if (__DEV__) {
      if (objectName(value) !== 'Object') {
        console.error(
          'Only plain objects can be passed to Client Components from Server Components. ' +
            '%s objects are not supported.%s',
          objectName(value),
          describeObjectForErrorMessage(parent, key),
        );
      } else if (!isSimpleObject(value)) {
        console.error(
          'Only plain objects can be passed to Client Components from Server Components. ' +
            'Classes or other objects with methods are not supported.%s',
          describeObjectForErrorMessage(parent, key),
        );
      } else if (Object.getOwnPropertySymbols) {
        const symbols = Object.getOwnPropertySymbols(value);
        if (symbols.length > 0) {
          console.error(
            'Only plain objects can be passed to Client Components from Server Components. ' +
              'Objects with symbol properties like %s are not supported.%s',
            symbols[0].description,
            describeObjectForErrorMessage(parent, key),
          );
        }
      }
    }

    // $FlowFixMe[incompatible-return]
    return value;
  }

  if (typeof value === 'string') {
    if (enableTaint) {
      const tainted = TaintRegistryValues.get(value);
      if (tainted !== undefined) {
        throwTaintViolation(tainted.message);
      }
    }
    // TODO: Maybe too clever. If we support URL there's no similar trick.
    if (value[value.length - 1] === 'Z') {
      // Possibly a Date, whose toJSON automatically calls toISOString
      // $FlowFixMe[incompatible-use]
      const originalValue = parent[key];
      if (originalValue instanceof Date) {
        return serializeDateFromDateJSON(value);
      }
    }
    if (value.length >= 1024) {
      // For large strings, we encode them outside the JSON payload so that we
      // don't have to double encode and double parse the strings. This can also
      // be more compact in case the string has a lot of escaped characters.
      return serializeLargeTextString(request, value);
    }
    return escapeStringValue(value);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return serializeNumber(value);
  }

  if (typeof value === 'undefined') {
    return serializeUndefined();
  }

  if (typeof value === 'function') {
    if (enableTaint) {
      const tainted = TaintRegistryObjects.get(value);
      if (tainted !== undefined) {
        throwTaintViolation(tainted);
      }
    }
    if (isClientReference(value)) {
      return serializeClientReference(request, parent, key, (value: any));
    }
    if (isServerReference(value)) {
      return serializeServerReference(request, parent, key, (value: any));
    }
    if (/^on[A-Z]/.test(key)) {
      throw new Error(
        'Event handlers cannot be passed to Client Component props.' +
          describeObjectForErrorMessage(parent, key) +
          '\nIf you need interactivity, consider converting part of this to a Client Component.',
      );
    } else {
      throw new Error(
        'Functions cannot be passed directly to Client Components ' +
          'unless you explicitly expose it by marking it with "use server".' +
          describeObjectForErrorMessage(parent, key),
      );
    }
  }

  if (typeof value === 'symbol') {
    const writtenSymbols = request.writtenSymbols;
    const existingId = writtenSymbols.get(value);
    if (existingId !== undefined) {
      return serializeByValueID(existingId);
    }
    // $FlowFixMe[incompatible-type] `description` might be undefined
    const name: string = value.description;

    if (Symbol.for(name) !== value) {
      throw new Error(
        'Only global symbols received from Symbol.for(...) can be passed to Client Components. ' +
          `The symbol Symbol.for(${
            // $FlowFixMe[incompatible-type] `description` might be undefined
            value.description
          }) cannot be found among global symbols.` +
          describeObjectForErrorMessage(parent, key),
      );
    }

    request.pendingChunks++;
    const symbolId = request.nextChunkId++;
    emitSymbolChunk(request, symbolId, name);
    writtenSymbols.set(value, symbolId);
    return serializeByValueID(symbolId);
  }

  if (typeof value === 'bigint') {
    if (enableTaint) {
      const tainted = TaintRegistryValues.get(value);
      if (tainted !== undefined) {
        throwTaintViolation(tainted.message);
      }
    }
    return serializeBigInt(value);
  }

  throw new Error(
    `Type ${typeof value} is not supported in Client Component props.` +
      describeObjectForErrorMessage(parent, key),
  );
}

function logPostpone(request: Request, reason: string): void {
  const onPostpone = request.onPostpone;
  onPostpone(reason);
}

function logRecoverableError(request: Request, error: mixed): string {
  const onError = request.onError;
  const errorDigest = onError(error);
  if (errorDigest != null && typeof errorDigest !== 'string') {
    // eslint-disable-next-line react-internal/prod-error-codes
    throw new Error(
      `onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "${typeof errorDigest}" instead`,
    );
  }
  return errorDigest || '';
}

function fatalError(request: Request, error: mixed): void {
  if (enableTaint) {
    cleanupTaintQueue(request);
  }
  // This is called outside error handling code such as if an error happens in React internals.
  if (request.destination !== null) {
    request.status = CLOSED;
    closeWithError(request.destination, error);
  } else {
    request.status = CLOSING;
    request.fatalError = error;
  }
}

function emitPostponeChunk(
  request: Request,
  id: number,
  postponeInstance: Postpone,
): void {
  let row;
  if (__DEV__) {
    let reason = '';
    let stack = '';
    try {
      // eslint-disable-next-line react-internal/safe-string-coercion
      reason = String(postponeInstance.message);
      // eslint-disable-next-line react-internal/safe-string-coercion
      stack = String(postponeInstance.stack);
    } catch (x) {}
    row = serializeRowHeader('P', id) + stringify({reason, stack}) + '\n';
  } else {
    // No reason included in prod.
    row = serializeRowHeader('P', id) + '\n';
  }
  const processedChunk = stringToChunk(row);
  request.completedErrorChunks.push(processedChunk);
}

function emitErrorChunk(
  request: Request,
  id: number,
  digest: string,
  error: mixed,
): void {
  let errorInfo: any;
  if (__DEV__) {
    let message;
    let stack = '';
    try {
      if (error instanceof Error) {
        // eslint-disable-next-line react-internal/safe-string-coercion
        message = String(error.message);
        // eslint-disable-next-line react-internal/safe-string-coercion
        stack = String(error.stack);
      } else {
        message = 'Error: ' + (error: any);
      }
    } catch (x) {
      message = 'An error occurred but serializing the error message failed.';
    }
    errorInfo = {digest, message, stack};
  } else {
    errorInfo = {digest};
  }
  const row = serializeRowHeader('E', id) + stringify(errorInfo) + '\n';
  const processedChunk = stringToChunk(row);
  request.completedErrorChunks.push(processedChunk);
}

function emitImportChunk(
  request: Request,
  id: number,
  clientReferenceMetadata: ClientReferenceMetadata,
): void {
  // $FlowFixMe[incompatible-type] stringify can return null
  const json: string = stringify(clientReferenceMetadata);
  const row = serializeRowHeader('I', id) + json + '\n';
  const processedChunk = stringToChunk(row);
  request.completedImportChunks.push(processedChunk);
}

function emitHintChunk<Code: HintCode>(
  request: Request,
  code: Code,
  model: HintModel<Code>,
): void {
  const json: string = stringify(model);
  const id = request.nextChunkId++;
  const row = serializeRowHeader('H' + code, id) + json + '\n';
  const processedChunk = stringToChunk(row);
  request.completedHintChunks.push(processedChunk);
}

function emitSymbolChunk(request: Request, id: number, name: string): void {
  const symbolReference = serializeSymbolReference(name);
  const processedChunk = encodeReferenceChunk(request, id, symbolReference);
  request.completedImportChunks.push(processedChunk);
}

function emitProviderChunk(
  request: Request,
  id: number,
  contextName: string,
): void {
  const contextReference = serializeProviderReference(contextName);
  const processedChunk = encodeReferenceChunk(request, id, contextReference);
  request.completedRegularChunks.push(processedChunk);
}

function emitModelChunk(
  request: Request,
  id: number,
  model: ReactClientValue,
): void {
  // Track the root so we know that we have to emit this object even though it
  // already has an ID. This is needed because we might see this object twice
  // in the same toJSON if it is cyclic.
  modelRoot = model;
  // $FlowFixMe[incompatible-type] stringify can return null
  const json: string = stringify(model, request.toJSON);
  const row = id.toString(16) + ':' + json + '\n';
  const processedChunk = stringToChunk(row);
  request.completedRegularChunks.push(processedChunk);
}

function retryTask(request: Request, task: Task): void {
  if (task.status !== PENDING) {
    // We completed this by other means before we had a chance to retry it.
    return;
  }

  switchContext(task.context);
  try {
    let value = task.model;
    let parentKey: void | null | string = task.parentKey; // undefined means we're not inside a parent
    if (
      typeof value === 'object' &&
      value !== null &&
      ((value: any).$$typeof === REACT_ELEMENT_TYPE ||
        (value: any).$$typeof === REACT_LAZY_TYPE)
    ) {
      switch ((value: any).$$typeof) {
        case REACT_ELEMENT_TYPE: {
          request.writtenObjects.set(value, task.id);

          const element: React$Element<any> = (value: any);

          // When retrying a component, reuse the thenableState from the
          // previous attempt.
          const prevThenableState = task.thenableState;

          // Attempt to render the Server Component.
          // Doing this here lets us reuse this same task if the next component
          // also suspends.
          task.model = value;
          task.parentKey = parentKey;
          value = renderElement(
            request,
            parentKey,
            element.type,
            element.key,
            element.ref,
            element.props,
            prevThenableState,
          );

          // Add the key before rendering the next parent.
          const key: null | React$Key = element.key;
          if (parentKey == null) {
            if (key === null) {
              // We're inside a Server Component or Fragment.
              parentKey = '0';
            } else {
              parentKey = '0,' + key;
            }
          } else {
            if (key === null) {
              // Nothing to add.
              parentKey += ',0'
            } else {
              // Combine the key into a composite key.
              parentKey += ',' + key;
            }
          }
          break;
        }
        case REACT_LAZY_TYPE: {
          task.model = value;
          task.parentKey = parentKey;
          const payload = (value: any)._payload;
          const init = (value: any)._init;
          value = init(payload);
          break;
        }
      }

      // Successfully finished this component. We're going to keep rendering
      // using the same task, but we reset its thenable state before continuing.
      task.thenableState = null;

      // Keep rendering and reuse the same task. This inner loop is separate
      // from the render above because we don't need to reset the thenable state
      // until the next time something suspends and retries.
      while (
        typeof value === 'object' &&
        value !== null &&
        ((value: any).$$typeof === REACT_ELEMENT_TYPE ||
          (value: any).$$typeof === REACT_LAZY_TYPE)
      ) {
        switch ((value: any).$$typeof) {
          case REACT_ELEMENT_TYPE: {
            request.writtenObjects.set(value, task.id);
            const nextElement: React$Element<any> = (value: any);
            task.model = value;
            task.parentKey = parentKey;
            value = renderElement(
              request,
              parentKey,
              nextElement.type,
              nextElement.key,
              nextElement.ref,
              nextElement.props,
              null,
            );
            // Add the key before rendering the next parent.
            const key2: null | React$Key = nextElement.key;
            if (parentKey == null) {
              if (key2 === null) {
                // We're inside a Server Component or Fragment.
                parentKey = '0';
              } else {
                parentKey = '0,' + key2;
              }
            } else {
              if (key2 === null) {
                parentKey += ',0';
                // Nothing to add.
              } else {
                // Combine the key into a composite key.
                parentKey += ',' + key2;
              }
            }
            break;
          }
          case REACT_LAZY_TYPE: {
            task.model = value;
            task.parentKey = parentKey;
            const payload = (value: any)._payload;
            const init = (value: any)._init;
            value = init(payload);
            break;
          }
        }
      }
    }

    // Track that this object is outlined and has an id.
    if (typeof value === 'object' && value !== null) {
      request.writtenObjects.set(value, task.id);
    }

    emitModelChunk(request, task.id, value);
    request.abortableTasks.delete(task);
    task.status = COMPLETED;
  } catch (thrownValue) {
    const x =
      thrownValue === SuspenseException
        ? // This is a special type of exception used for Suspense. For historical
          // reasons, the rest of the Suspense implementation expects the thrown
          // value to be a thenable, because before `use` existed that was the
          // (unstable) API for suspending. This implementation detail can change
          // later, once we deprecate the old API in favor of `use`.
          getSuspendedThenable()
        : thrownValue;
    if (typeof x === 'object' && x !== null) {
      // $FlowFixMe[method-unbinding]
      if (typeof x.then === 'function') {
        // Something suspended again, let's pick it back up later.
        const ping = task.ping;
        x.then(ping, ping);
        task.thenableState = getThenableStateAfterSuspending();
        return;
      } else if (enablePostpone && x.$$typeof === REACT_POSTPONE_TYPE) {
        request.abortableTasks.delete(task);
        task.status = ERRORED;
        const postponeInstance: Postpone = (x: any);
        logPostpone(request, postponeInstance.message);
        emitPostponeChunk(request, task.id, postponeInstance);
        return;
      }
    }
    request.abortableTasks.delete(task);
    task.status = ERRORED;
    const digest = logRecoverableError(request, x);
    emitErrorChunk(request, task.id, digest, x);
  }
}

function performWork(request: Request): void {
  const prevDispatcher = ReactCurrentDispatcher.current;
  ReactCurrentDispatcher.current = HooksDispatcher;
  const prevRequest = currentRequest;
  currentRequest = request;
  prepareToUseHooksForRequest(request);

  try {
    const pingedTasks = request.pingedTasks;
    request.pingedTasks = [];
    for (let i = 0; i < pingedTasks.length; i++) {
      const task = pingedTasks[i];
      retryTask(request, task);
    }
    if (request.destination !== null) {
      flushCompletedChunks(request, request.destination);
    }
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  } finally {
    ReactCurrentDispatcher.current = prevDispatcher;
    resetHooksForRequest();
    currentRequest = prevRequest;
  }
}

function abortTask(task: Task, request: Request, errorId: number): void {
  task.status = ABORTED;
  // Instead of emitting an error per task.id, we emit a model that only
  // has a single value referencing the error.
  const ref = serializeByValueID(errorId);
  const processedChunk = encodeReferenceChunk(request, task.id, ref);
  request.completedErrorChunks.push(processedChunk);
}

function flushCompletedChunks(
  request: Request,
  destination: Destination,
): void {
  beginWriting(destination);
  try {
    // We emit module chunks first in the stream so that
    // they can be preloaded as early as possible.
    const importsChunks = request.completedImportChunks;
    let i = 0;
    for (; i < importsChunks.length; i++) {
      request.pendingChunks--;
      const chunk = importsChunks[i];
      const keepWriting: boolean = writeChunkAndReturn(destination, chunk);
      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }
    importsChunks.splice(0, i);

    // Next comes hints.
    const hintChunks = request.completedHintChunks;
    i = 0;
    for (; i < hintChunks.length; i++) {
      const chunk = hintChunks[i];
      const keepWriting: boolean = writeChunkAndReturn(destination, chunk);
      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }
    hintChunks.splice(0, i);

    // Next comes model data.
    const regularChunks = request.completedRegularChunks;
    i = 0;
    for (; i < regularChunks.length; i++) {
      request.pendingChunks--;
      const chunk = regularChunks[i];
      const keepWriting: boolean = writeChunkAndReturn(destination, chunk);
      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }
    regularChunks.splice(0, i);

    // Finally, errors are sent. The idea is that it's ok to delay
    // any error messages and prioritize display of other parts of
    // the page.
    const errorChunks = request.completedErrorChunks;
    i = 0;
    for (; i < errorChunks.length; i++) {
      request.pendingChunks--;
      const chunk = errorChunks[i];
      const keepWriting: boolean = writeChunkAndReturn(destination, chunk);
      if (!keepWriting) {
        request.destination = null;
        i++;
        break;
      }
    }
    errorChunks.splice(0, i);
  } finally {
    request.flushScheduled = false;
    completeWriting(destination);
  }
  flushBuffered(destination);
  if (request.pendingChunks === 0) {
    // We're done.
    if (enableTaint) {
      cleanupTaintQueue(request);
    }
    close(destination);
  }
}

export function startWork(request: Request): void {
  request.flushScheduled = request.destination !== null;
  if (supportsRequestStorage) {
    scheduleWork(() => requestStorage.run(request, performWork, request));
  } else {
    scheduleWork(() => performWork(request));
  }
}

function enqueueFlush(request: Request): void {
  if (
    request.flushScheduled === false &&
    // If there are pinged tasks we are going to flush anyway after work completes
    request.pingedTasks.length === 0 &&
    // If there is no destination there is nothing we can flush to. A flush will
    // happen when we start flowing again
    request.destination !== null
  ) {
    const destination = request.destination;
    request.flushScheduled = true;
    scheduleWork(() => flushCompletedChunks(request, destination));
  }
}

export function startFlowing(request: Request, destination: Destination): void {
  if (request.status === CLOSING) {
    request.status = CLOSED;
    closeWithError(destination, request.fatalError);
    return;
  }
  if (request.status === CLOSED) {
    return;
  }
  if (request.destination !== null) {
    // We're already flowing.
    return;
  }
  request.destination = destination;
  try {
    flushCompletedChunks(request, destination);
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  }
}

export function stopFlowing(request: Request): void {
  request.destination = null;
}

// This is called to early terminate a request. It creates an error at all pending tasks.
export function abort(request: Request, reason: mixed): void {
  try {
    const abortableTasks = request.abortableTasks;
    if (abortableTasks.size > 0) {
      // We have tasks to abort. We'll emit one error row and then emit a reference
      // to that row from every row that's still remaining.
      request.pendingChunks++;
      const errorId = request.nextChunkId++;
      if (
        enablePostpone &&
        typeof reason === 'object' &&
        reason !== null &&
        (reason: any).$$typeof === REACT_POSTPONE_TYPE
      ) {
        const postponeInstance: Postpone = (reason: any);
        logPostpone(request, postponeInstance.message);
        emitPostponeChunk(request, errorId, postponeInstance);
      } else {
        const error =
          reason === undefined
            ? new Error(
                'The render was aborted by the server without a reason.',
              )
            : reason;
        const digest = logRecoverableError(request, error);
        emitErrorChunk(request, errorId, digest, error);
      }
      abortableTasks.forEach(task => abortTask(task, request, errorId));
      abortableTasks.clear();
    }
    if (request.destination !== null) {
      flushCompletedChunks(request, request.destination);
    }
  } catch (error) {
    logRecoverableError(request, error);
    fatalError(request, error);
  }
}

function importServerContexts(
  contexts?: Array<[string, ServerContextJSONValue]>,
) {
  if (enableServerContext && contexts) {
    const prevContext = getActiveContext();
    switchContext(rootContextSnapshot);
    for (let i = 0; i < contexts.length; i++) {
      const [name, value] = contexts[i];
      const context = getOrCreateServerContext(name);
      pushProvider(context, value);
    }
    const importedContext = getActiveContext();
    switchContext(prevContext);
    return importedContext;
  }
  return rootContextSnapshot;
}
