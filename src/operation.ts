/*!
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/*!
 * @module common/operation
 */

import * as events from 'events';
import * as extend from 'extend';
const modelo = require('modelo');

/**
 * @type {module:common/serviceObject}
 * @private
 */
const ServiceObject = require('./service-object');

// TODO: improve the typing and required-ness of these properties
export interface OperationConfig {
  /**
   * The parent object.
   */
  parent: any;

  /**
   * The operation ID.
   */
  id: string;

  methods: any;
}

// jscs:disable maximumLineLength
/**
 * An Operation object allows you to interact with APIs that take longer to
 * process things.
 *
 * @constructor
 * @alias module:common/operation
 *
 * @param {object} config - Configuration object.
 * @param {module:common/service|module:common/serviceObject|module:common/grpcService|module:common/grpcServiceObject} config.parent - The
 *     parent object.
 * @param {string} id - The operation ID.
 */
// jscs:enable maximumLineLength
function Operation(config: OperationConfig) {
  const methods = {
    /**
     * Checks to see if an operation exists.
     */
    exists: true,

    /**
     * Retrieves the operation.
     */
    get: true,

    /**
     * Retrieves metadata for the operation.
     */
    getMetadata: {
      reqOpts: {
        name: config.id,
      },
    },
  };

  config = extend(
    {
      baseUrl: '',
    },
    config
  );

  config.methods = config.methods || methods;

  ServiceObject.call(this, config);
  events.EventEmitter.call(this);

  this.completeListeners = 0;
  this.hasActiveListeners = false;

  this.listenForEvents_();
}

modelo.inherits(Operation, ServiceObject, events.EventEmitter);

/**
 * Wraps the `complete` and `error` events in a Promise.
 *
 * @return {promise}
 */
Operation.prototype.promise = function() {
  const self = this;

  return new self.Promise((resolve: Function, reject: (err: Error) => void) => {
    self.on('error', reject).on('complete', (metadata: any) => {
      resolve([metadata]);
    });
  });
};

/**
 * Begin listening for events on the operation. This method keeps track of how
 * many "complete" listeners are registered and removed, making sure polling is
 * handled automatically.
 *
 * As long as there is one active "complete" listener, the connection is open.
 * When there are no more listeners, the polling stops.
 *
 * @private
 */
Operation.prototype.listenForEvents_ = function() {
  const self = this;

  this.on('newListener', (event: string) => {
    if (event === 'complete') {
      self.completeListeners++;

      if (!self.hasActiveListeners) {
        self.hasActiveListeners = true;
        self.startPolling_();
      }
    }
  });

  this.on('removeListener', (event: string) => {
    if (event === 'complete' && --self.completeListeners === 0) {
      self.hasActiveListeners = false;
    }
  });
};

/**
 * Poll for a status update. Execute the callback:
 *
 *   - callback(err): Operation failed
 *   - callback(): Operation incomplete
 *   - callback(null, metadata): Operation complete
 *
 * @private
 *
 * @param {function} callback
 */
Operation.prototype.poll_ = function(callback: (err?: Error|null, resp?: any) => void) {
  this.getMetadata((err: Error|null, resp: any) => {
    if (err || resp.error) {
      callback(err || resp.error);
      return;
    }

    if (!resp.done) {
      callback();
      return;
    }

    callback(null, resp);
  });
};

/**
 * Poll `getMetadata` to check the operation's status. This runs a loop to ping
 * the API on an interval.
 *
 * Note: This method is automatically called once a "complete" event handler is
 * registered on the operation.
 *
 * @private
 */
Operation.prototype.startPolling_ = function() {
  const self = this;

  if (!this.hasActiveListeners) {
    return;
  }

  this.poll_((err: Error|null, metadata: any) => {
    if (err) {
      self.emit('error', err);
      return;
    }

    if (!metadata) {
      setTimeout(self.startPolling_.bind(self), 500);
      return;
    }

    self.emit('complete', metadata);
  });
};

module.exports = Operation;
