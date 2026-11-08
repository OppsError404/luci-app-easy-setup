'use strict';

import { readfile, writefile, mkdir, chmod, rename, unlink, rmdir, popen, open } from 'fs';

export function cached_connectivity(device, deps) {
    let cache = null;
    try { cache = json(readfile((deps.runtime_dir || '/tmp/easy_setup') + '/connectivity.json')); }
    catch (e) { }
    let valid = cache && cache.device == device && type(cache.checked_at) == 'int' &&
        (cache.internet == 'online' || cache.internet == 'offline');
    let stale = !valid || time() - cache.checked_at >= 15;
    return {
        internet: valid ? cache.internet : 'pending',
        internet_pending: !valid,
        internet_stale: stale,
        internet_checked_at: valid ? cache.checked_at : 0
    };
};

export function run_probe(args, deps) {
    let runtime = deps.runtime_dir || '/tmp/easy_setup';
    // The worker supplies the same discovery/identity used by local status,
    // including renamed WAN interfaces and logical PPP/bridge devices.
    let wan = (deps.wan_info ? deps.wan_info() : deps.bus.call('network.interface.wan', 'status', {})) || {};
    let device = wan.l3_device || wan.phys_device || wan.device || '';
    if (device != '' && !match(device, /^[A-Za-z0-9_.:-]{1,15}$/))
        die('Invalid runtime WAN device');
    let cached = cached_connectivity(device, deps);
    if (!cached.internet_stale) {
        cached.success = true;
        return cached;
    }
    mkdir(runtime, 0700);
    // Keep the inode: unlinking a lock allows contenders to lock different files.
    // CLOEXEC prevents the ping subprocess from retaining the worker's lock.
    let guard = open(runtime + '/probe.guard', 'ae', 0600);
    if (!guard)
        die('Unable to open reachability lock');
    if (!guard.lock('xn')) {
        guard.close();
        return cached_connectivity(device, deps);
    }
    cached = cached_connectivity(device, deps);
    if (!cached.internet_stale) {
        guard.close();
        cached.success = true;
        return cached;
    }
    let lock = runtime + '/probe.lock';
    unlink(lock + '/result.json');
    rmdir(lock);
    if (!mkdir(lock, 0700)) {
        guard.close();
        die('Unable to create reachability workspace');
    }
    let online = false;
    try {
        if (wan.up && device != '') {
            let command = deps.ping_command || '/bin/ping';
            command = "'" + replace(command, /'/g, "'\\''") + "'";
            for (let host in ['1.1.1.1', '9.9.9.9']) {
                let child = popen(command + ' -I ' + device + ' -c1 -W1 -w1 ' + host + ' >/dev/null 2>&1', 'r');
                if (child && child.close() == 0) {
                    online = true;
                    break;
                }
            }
        }
        let cache = { device, internet: online ? 'online' : 'offline', checked_at: time() };
        let temporary = lock + '/result.json';
        if (writefile(temporary, sprintf('%J', cache)) == null || !chmod(temporary, 0600) ||
            !rename(temporary, runtime + '/connectivity.json'))
            die('Unable to update reachability cache');
    }
    catch (e) {
        unlink(lock + '/result.json');
        rmdir(lock);
        guard.close();
        die('Connectivity probe failed');
    }
    rmdir(lock);
    guard.close();
    let result = cached_connectivity(device, deps);
    result.success = true;
    return result;
};
