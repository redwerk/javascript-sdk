import * as objects from './ponyfills/objects.js';
import { emit } from './waitforit.js';

export const CONTEXT_CHANGED = 'context.changed';
export const CONTEXT_INITIALIZED = 'context.initialized';
export const CONTEXT_VALUE_REMOVED = 'context.value.removed';
export const CONTEXT_VALUE_ADDED = 'context.value.added';
export const CONTEXT_VALUE_CHANGED = 'context.value.changed';
export const CONTEXT_DESTROYED = 'context.destroyed';

/**
 * The EvolvContext provides functionality to manage data relating to the client state, or context in which the
 * variants will be applied.
 *
 * This data is used for determining which variables are active, and for general analytics.
 *
 * @constructor
 */
function EvolvContext() {
  let uid;
  let sid;
  let remoteContext;
  let localContext;
  let initialized = false;

  /**
   * A unique identifier for the participant.
   */
  Object.defineProperty(this, 'uid', { get: function() { return uid; } });

  /**
   * A unique identifier for the current session of the participant.
   */
  Object.defineProperty(this, 'sid', { get: function() { return sid; } });

  /**
   * The context information for evaluation of predicates and analytics.
   */
  Object.defineProperty(this, 'remoteContext', { get: function() { return objects.deepClone(remoteContext); } });

  /**
   * The context information for evaluation of predicates only, and not used for analytics.
   */
  Object.defineProperty(this, 'localContext', { get: function() { return objects.deepClone(localContext); } });

  function mutableResolve() {
    return objects.deepMerge(localContext, remoteContext);
  }

  function ensureInitialized() {
    if (!initialized) {
      throw new Error('Evolv: The evolv context is not initialized')
    }
  }

  this.initialize = function(_uid, _sid, _remoteContext, _localContext) {
    if (initialized) {
      throw new Error('Evolv: The context is already initialized');
    }
    uid = _uid;
    sid = _sid;
    remoteContext = _remoteContext ? objects.deepClone(_remoteContext) : {};
    localContext = _localContext ? objects.deepClone(_localContext) : {};
    initialized = true;
    emit(this, CONTEXT_INITIALIZED, this.resolve());
  };

  this.destroy = function() {
    remoteContext = undefined;
    localContext = undefined;
    emit(this, CONTEXT_DESTROYED, this);
  };

  /**
   * Computes the effective context from the local and remote contexts.
   *
   * @returns {Object} The effective context from the local and remote contexts.
   */
  this.resolve = function() {
    ensureInitialized();
    return objects.deepClone(mutableResolve());
  };

  /**
   * Sets a value in the current context.
   *
   * Note: This will cause the effective genome to be recomputed.
   *
   * @param key {String} The key to associate the value to.
   * @param value {*} The value to associate with the key.
   * @param local {Boolean} If true, the value will only be added to the localContext.
   */
  this.set = function(key, value, local) {
    ensureInitialized();
    const context = local ? localContext : remoteContext;
    const before = objects.getValueForKey(key, context);

    if (before === value) {
      return false;
    }

    objects.setKeyToValue(key, value, context);

    const updated = this.resolve();
    if (typeof before === 'undefined') {
      emit(this, CONTEXT_VALUE_ADDED, key, value, local, updated);
    } else {
      emit(this, CONTEXT_VALUE_CHANGED, key, value, before, local, updated);
    }
    emit(this, CONTEXT_CHANGED, updated);
    return true;
  };

  /**
   * Merge the specified object into the current context.
   *
   * Note: This will cause the effective genome to be recomputed.
   *
   * @param update {Object} The values to update the context with.
   * @param local {Boolean} If true, the values will only be added to the localContext.
   */
  this.update = function(update, local) {
    ensureInitialized();
    let context = local ? localContext : remoteContext;
    const flattened = objects.flatten(update);
    const flattenedBefore = {};
    Object.keys(flattened).forEach(function(key) {
      flattenedBefore[key] = context[key];
    });

    if (local) {
      localContext = objects.deepMerge(localContext, update);
      context = localContext;
    } else {
      remoteContext = objects.deepMerge(remoteContext, update);
      context = remoteContext;
    }

    const updated = this.resolve();
    Object.keys(flattened).forEach(function(key) {
      if (typeof flattenedBefore[key] === 'undefined') {
        emit(this, CONTEXT_VALUE_ADDED, key, context[key], local, updated);
      } else if (flattenedBefore[key] !== context[key]) {
        emit(this, CONTEXT_VALUE_CHANGED, key, context[key], flattenedBefore[key], local, updated);
      }
    });
    emit(this, CONTEXT_CHANGED, updated);
  };

  /**
   * Remove a specified key from the context.
   *
   * Note: This will cause the effective genome to be recomputed.
   *
   * @param key {String} The key to remove from the context.
   */
  this.remove = function(key) {
    ensureInitialized();
    const local = objects.removeValueForKey(key, localContext);
    const remote = objects.removeValueForKey(key, remoteContext);
    const removed = local || remote;

    if (removed) {
      const updated = this.resolve();
      emit(this, CONTEXT_VALUE_REMOVED, key, !remote, updated);
      emit(this, CONTEXT_CHANGED, updated);
    }

    return removed;
  };

  /**
   * Retrieve a value from the context.
   *
   * @param {String} key The kay associated with the value to retrieve.
   * @returns {*} The value associated with the specified key.
   */
  this.get = function(key) {
    ensureInitialized();
    return objects.getValueForKey(key, remoteContext) || objects.getValueForKey(key, localContext);
  };

  /**
   * Checks if the specified key is currently defined in the context.
   *
   * @param key The key to check.
   * @returns {boolean} True if the key has an associated value in the context.
   */
  this.contains = function(key) {
    ensureInitialized();
    return key in remoteContext || key in localContext;
  };
}

export default EvolvContext;
