import retrieve from './retrieve.js';

const DELAY = 1;
const ENDPOINT_PATTERN = /\/(v\d+)\/\w+\/([a-z]+)$/i;

function fallbackBeacon(url, data, sync) {
  retrieve({
    method: 'post',
    url: url,
    data: data,
    sync: sync
  })
    .catch(function(err) {
      console.log(err);
    });
  return true;
}

export default function Emitter(endpoint) {
  const endpointMatch = endpoint.match(ENDPOINT_PATTERN);
  const v1api = endpointMatch && endpointMatch[1] === 'v1';
  // const disabled = v1api && endpointMatch[2] === 'analytics';
  const disabled = false;

  let messages = [];
  let timer;

  function send(url, data, sync) {
    if (typeof window !== 'undefined' && window.navigator.sendBeacon) {
      // Chrome does not yet support this
      // const encoded = new Blob([data], { type: 'application/json; charset=UTF-8' });
      // return window.navigator.sendBeacon(url, encoded);
      return window.navigator.sendBeacon(url, data);
    } else {
      return fallbackBeacon(url, data, sync);
    }
  }

  function transmit() {
    let sync = false;
    if (typeof this !== 'undefined') {
      const currentEvent = this.event && this.event.type;
      sync = currentEvent === 'unload' || currentEvent === 'beforeunload';
    }

    if (!messages.length) {
      return;
    }

    const batch = messages;
    messages = [];
    if (timer) {
      clearTimeout(timer);
    }
    timer = undefined;

    batch.forEach(function(message) {
      let editedMessage = message;
      if (v1api) {
        // change needed to support v1 of the participants api
        editedMessage = message[1] || {};
        editedMessage.type = message[0];
      }

      if (!send(endpoint, JSON.stringify(editedMessage), sync)) {
        messages.push(message);
        console.error('Evolv: Unable to send beacon');
      }
    });

    if (messages.length) {
      timer = setTimeout(transmit, DELAY);
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('unload', transmit);
    window.addEventListener('beforeunload', transmit);
  }

  this.emit = function(type, data, flush) {
    if (disabled) {
      return;
    }

    messages.push([type, data]);
    if (flush) {
      transmit();
      return;
    }

    if (!timer) {
      timer = setTimeout(transmit, DELAY);
    }
  };

  this.flush = transmit;
}
