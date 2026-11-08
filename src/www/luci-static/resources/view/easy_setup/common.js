/* Shared transport for the existing, server-rendered Easy Setup UI. */
(function(window, document) {
  'use strict';
  var session = window.EASY_SID || window.L.env.sessionid;
  var rpc, poll;
  var declarations = Object.create(null);
  var api = window.EasySetup = {};
  // header.ut creates L before custom templates; poll is built into luci.js.
  api.ready = Promise.all([window.L.require('rpc'), window.L.require('poll')]).then(function(modules) {
    rpc = modules[0]; poll = modules[1];
    if (session) rpc.setSessionID(session);
    return api;
  });

  function rawCall(method, params, onDispatch) {
    return api.ready.then(function() {
      if (!session || session === '00000000000000000000000000000000' || rpc.getSessionID() !== session)
        throw new Error('LuCI session changed or expired. Sign in again before saving.');
      params = params || {};
      var keys = Object.keys(params).filter(function(key) { return key !== 'ubus_rpc_session'; }).sort();
      var cacheKey = method + ':' + keys.join(',');
      if (!declarations[cacheKey])
        declarations[cacheKey] = rpc.declare({ object: 'easy_setup', method: method, params: keys, reject: true,
          nobatch: method === 'probe_connectivity' || method === 'status_wan' || isMutation(method) || isControl(method) });
      // admin/ubus injects ubus_rpc_session from the authenticated envelope.
      // Sending that field in the payload is rejected by LuCI's controller.
      if (onDispatch) onDispatch();
      return declarations[cacheKey].apply(rpc, keys.map(function(key) { return params[key]; }));
    });
  }
  function parseForm(text, params, decodePlus) {
    (text || '').split('&').forEach(function(pair) {
      var i = pair.indexOf('=');
      if (i < 1) return;
      function decode(value) { return decodeURIComponent(decodePlus ? value.replace(/\+/g, ' ') : value); }
      var key = decode(pair.slice(0, i));
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') params[key] = decode(pair.slice(i + 1));
    });
  }
  api.ajax = function(method, url, body, cb) {
    // The rejection handler belongs to the request, not the render callback.
    // A callback throwing must never be called a second time with null.
    return Promise.resolve().then(function() {
      var i = url.indexOf('?');
      var path = i < 0 ? url : url.slice(0, i);
      var params = {};
      parseForm(i < 0 ? '' : url.slice(i + 1), params, false);
      parseForm(body, params, true);
      ['peerdns', 'flow_offload', 'hw_flow_offload', 'is_candidate', 'fast', 'wan_ipv6', 'lan_ipv6'].forEach(function(key) {
        if (params[key] === '1') params[key] = true;
        else if (params[key] === '0') params[key] = false;
      });
      return api.call(path.slice(path.lastIndexOf('/') + 1), params);
    }).then(function(reply) { if (cb) cb(reply); return reply; }, function(error) {
      var failure = { success: false, error: error.message || 'Request failed', message: error.message || 'Request failed', pending: !!error.pending, rolled_back: !!error.rolled_back };
      if (cb) cb(failure);
      return failure;
    });
  };
  var writeQueue = Promise.resolve();
  api.pending = false;
  function pendingError(error) {
    if (error && (error.rolled_back || error.discarded)) { api.pending = false; return error; }
    var failure = new Error('Changes remain unconfirmed. Automatic rollback may be pending. Reconnect and retry confirmation before saving again. ' + (error && error.message || ''));
    failure.pending = true;
    return failure;
  }
  function isMutation(method) { return /^(save_|delete_)/.test(method) || method === 'fix_guest_dependencies'; }
  function isControl(method) { return /^(apply_changes|confirm_changes|rollback_changes|discard_changes)$/.test(method); }
  function delay(ms) { return new Promise(function(resolve) { window.setTimeout(resolve, ms); }); }
  var confirmNotBefore = null;
  function activationHoldoff() {
    var value = window.L.env.apply_holdoff;
    return typeof value === 'number' && isFinite(value) && value > 4 ? value * 1000 : 4000;
  }
  function deferConfirmation() { confirmNotBefore = Date.now() + activationHoldoff(); }
  function checkReply(reply, fallback) {
    if (reply && reply.success && !reply.rolled_back) return reply;
    var error = new Error((reply && reply.message) || fallback);
    error.rolled_back = !!(reply && reply.rolled_back);
    throw error;
  }
  function confirmUntil(deadline) {
    if (Date.now() >= deadline) return Promise.reject(pendingError());
    // A new/reloaded page has no apply timestamp. Wait locally as well as
    // relying on the server's eligibility guard; never probe the old link.
    if (confirmNotBefore === null) deferConfirmation();
    if (Date.now() < confirmNotBefore)
      return delay(Math.min(confirmNotBefore - Date.now(), deadline - Date.now())).then(function() { return confirmUntil(deadline); });
    return rawCall('status_wan', { fast: true }).then(function(status) {
      if (!status || typeof status !== 'object' || Array.isArray(status) || status.error || status.success === false)
        throw new Error('Authenticated router status is not available yet.');
      if (Date.now() >= deadline) throw pendingError();
      return rawCall('confirm_changes', {});
    }).then(function(confirmed) {
      return checkReply(confirmed, 'Changes were not confirmed.');
    }).catch(function(error) {
      if (error.rolled_back || Date.now() + 1500 >= deadline) throw error;
      return delay(1500).then(function() { return confirmUntil(deadline); });
    });
  }
  function save(method, params) {
    return rawCall(method, params, function() { api.pending = true; }).then(function(reply) {
      if (!reply || typeof reply !== 'object' || Array.isArray(reply) || typeof reply.success !== 'boolean')
        throw pendingError(new Error('The staging reply is missing or invalid. Check transaction status before resolving it.'));
      if (!reply.success || !(reply.changed === true || (reply.staged === true && reply.changed !== false))) {
        api.pending = false;
        return reply;
      }
      var deadline = Date.now() + 90000;
      return rawCall('apply_changes', { timeout: 90 }, deferConfirmation).then(function(applied) {
        deferConfirmation();
        try { checkReply(applied, 'Changes could not be applied.'); }
        catch (error) {
          if (error.rolled_back) throw error;
          return rawCall('get_apply_status', {}).then(function(status) {
            if (!status || !status.success || status.phase !== 'staged') throw error;
            return rawCall('discard_changes', {}).then(function(discarded) {
              checkReply(discarded, 'Unable to discard unapplied changes.');
              var failure = new Error('Changes were not applied; staged changes were discarded. ' + error.message);
              failure.discarded = true;
              throw failure;
            });
          });
        }
      }, function() {
        deferConfirmation();
        // Apply may have reached rpcd before its HTTP reply was lost. Do not
        // resend either the mutation or apply: reconnect and confirm instead.
      }).then(function() { return confirmUntil(deadline); }).then(function() {
        api.pending = false;
        confirmNotBefore = null;
        return reply;
      }).catch(function(error) { throw pendingError(error); });
    }, function(error) { throw api.pending ? pendingError(error) : error; });
  }
  api.call = function(method, params) {
    if (!isMutation(method) && !isControl(method) && method !== 'reconnect_wan') return rawCall(method, params);
    var result = writeQueue.then(function() {
      if (method === 'confirm_changes')
        return confirmUntil(Date.now() + 15000).then(function(reply) { api.pending = false; confirmNotBefore = null; return reply; }).catch(function(error) { throw pendingError(error); });
      if (method === 'rollback_changes' || method === 'discard_changes')
        return rawCall(method, params, function() { api.pending = true; }).then(function(reply) {
          checkReply(reply, 'Unable to resolve unconfirmed changes.');
          api.pending = false;
          confirmNotBefore = null;
          return reply;
        }).catch(function(error) { throw api.pending ? pendingError(error) : error; });
      if (api.pending) throw pendingError();
      if (method === 'apply_changes')
        return rawCall(method, params, function() { api.pending = true; deferConfirmation(); }).then(function(reply) {
          deferConfirmation();
          checkReply(reply, 'Changes could not be applied.');
          return reply;
        }).catch(function(error) { if (api.pending) deferConfirmation(); throw api.pending ? pendingError(error) : error; });
      return isMutation(method) ? save(method, params) : rawCall(method, params);
    });
    writeQueue = result.catch(function() {});
    return result;
  };
  api.retryConfirm = function() {
    var result = writeQueue.then(function() {
      if (!api.pending) return { success: true, changed: false };
      return confirmUntil(Date.now() + 15000).then(function(reply) { api.pending = false; confirmNotBefore = null; return reply; }).catch(function(error) { throw pendingError(error); });
    });
    writeQueue = result.catch(function() {});
    return result;
  };
  api.createPoll = function(refresh, interval) {
    var running = null, stopped = false, refreshAgain = false;
    var burstTimer = null, burstGeneration = 0;
    function cancelBurst() {
      burstGeneration++;
      if (burstTimer !== null) window.clearTimeout(burstTimer);
      burstTimer = null;
    }
    function burst(count, ms) {
      cancelBurst();
      var generation = burstGeneration;
      function step() {
        burstTimer = null;
        if (stopped || document.hidden || generation !== burstGeneration) return;
        run().then(function() {
          if (--count > 0 && !stopped && !document.hidden && generation === burstGeneration)
            burstTimer = window.setTimeout(step, ms);
        });
      }
      if (count > 0) step();
    }
    function run() {
      if (stopped || document.hidden) return Promise.resolve();
      if (running) return running;
      running = api.ready.then(refresh).catch(function(error) {
        // Rendering failures must release the guard too; LuCI.poll must
        // always receive a settled Promise instead of an unhandled rejection.
        console.error('Easy Setup refresh failed:', error);
      }).then(function(result) {
        running = null;
        if (refreshAgain) { refreshAgain = false; run(); }
        return result;
      });
      return running;
    }
    function visibility() {
      if (!poll || stopped) return;
      if (document.hidden) { cancelBurst(); poll.remove(run); }
      else {
        poll.add(run, interval);
        if (running) refreshAgain = true;
        else run();
      }
    }
    function stop() {
      stopped = true; refreshAgain = false;
      cancelBurst();
      if (poll) poll.remove(run);
      document.removeEventListener('visibilitychange', visibility);
    }
    api.ready.then(function() { if (!stopped && !document.hidden) poll.add(run, interval); }).catch(function(error) { console.error(error); });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    window.addEventListener('unload', stop);
    return { refresh: run, burst: burst, stop: stop };
  };
  window.ubusCall = function(method, params) { return api.call(method, params); };
})(window, document);
