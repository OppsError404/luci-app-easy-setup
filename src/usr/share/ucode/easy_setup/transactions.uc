'use strict';

import { cursor } from 'uci';
import { readfile, writefile, open, mkdir, mkdtemp, lsdir, unlink, rmdir, chmod, access, lstat, rename } from 'fs';

const CONFIGS = ['network', 'wireless', 'firewall', 'dhcp'];

function now_ms(deps) {
    // The worker supplies dependencies, never RPC arguments. Injection is
    // solely for native fixture clocks; production uses a boot-wide clock.
    if (type(deps.now_ms) == 'function') return deps.now_ms();
    let stamp = clock(true);
    if (type(stamp) != 'array' || length(stamp) != 2) die('Monotonic clock unavailable');
    return stamp[0] * 1000 + stamp[1] / 1000000;
}

function confirm_wait(state, deps) {
    // Missing settlement metadata or a worker lost during apply must never
    // make the old pre-dispatch eligibility sufficient to disarm rollback.
    if (state?.apply_settled !== true) return 4000;
    if (type(state?.confirm_after_ms) != 'int' && type(state?.confirm_after_ms) != 'double') return 4000;
    let remaining = state.confirm_after_ms - now_ms(deps);
    return remaining > 0 ? int(remaining) + 1 : 0;
}

function paths(deps) {
    let runtime = deps.runtime_dir || '/tmp/easy_setup';
    return {
        config: deps.config_dir || '/etc/config', runtime,
        rpcd: deps.rpcd_dir || '/var/run/rpcd',
        cli: deps.cli_delta_dir || '/tmp/.uci',
        lock: runtime + '/write.lock'
    };
}

function guarded(p, fn) {
    mkdir(p.runtime, 0700);
    if (!chmod(p.runtime, 0700)) die('Unable to protect staging directory');
    // Never unlink this inode. CLOEXEC also prevents inherited child locks.
    let guard = open(p.runtime + '/transaction.guard', 'ae', 0600);
    if (!guard) die('Unable to open transaction mutex');
    if (!guard.lock('xn')) {
        guard.close();
        die('Another configuration request is running');
    }
    try {
        let result = fn();
        guard.close();
        return result;
    } catch (e) {
        guard.close();
        die('Configuration operation failed; reload and retry');
    }
}

function authorize(args, deps) {
    let sid = args?.ubus_rpc_session;
    if (type(sid) != 'string' || !match(sid, /^[0-9a-f]{32}$/) || sid == '00000000000000000000000000000000')
        die('An authenticated session is required');
    for (let config in CONFIGS) {
        let access = deps.bus.call('session', 'access', {
            ubus_rpc_session: sid, scope: 'uci', object: config, function: 'write'
        });
        if (!access || access.access !== true)
            die('Permission denied for configuration changes');
    }
    return sid;
}

function cli_clean(p) {
    for (let name in lsdir(p.cli) || [])
        if (length(readfile(p.cli + '/' + name)))
            die('Apply or discard command-line UCI changes before using Easy Setup');
}

function session_clean(p, sid) {
    cli_clean(p);
    for (let name in lsdir(p.rpcd + '/uci-' + sid) || [])
        if (length(readfile(p.rpcd + '/uci-' + sid + '/' + name)))
            die('Apply or discard existing LuCI changes before using Easy Setup');
}

function baseline_matches(op, p) {
    for (let config in CONFIGS) {
        let snapshot = op + '/config/' + config, persistent = p.config + '/' + config;
        let original = readfile(snapshot);
        if (original == null || lstat(snapshot)?.type != 'file' || lstat(persistent)?.type != 'file' ||
            readfile(persistent) != original) return false;
    }
    return true;
}

function snapshots_unchanged(op, p) {
    if (!baseline_matches(op, p)) die('Configuration changed outside Easy Setup; reload and retry');
}

function ipv4(value) {
    if (type(value) != 'string' || !match(value, /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/)) return false;
    for (let part in split(value, '.')) if (int(part) > 255 || length(part) > 3) return false;
    return true;
}

function valid_field(config, field, value) {
    if (config == 'network' && field == 'ipaddr') {
        let values = type(value) == 'array' ? value : [value];
        for (let ip in values) {
            let parts = split(ip, '/');
            if (!ipv4(parts[0]) || length(parts) > 2 ||
                (length(parts) == 2 && (!match(parts[1], /^[0-9]+$/) || int(parts[1]) > 32))) return false;
        }
    }
    if (config == 'wireless' && field == 'ssid')
        return type(value) == 'string' && length(value) >= 1 && length(value) <= 32;
    if (config == 'firewall' && field == 'flow_offloading') return value == '0' || value == '1';
    if (config == 'dhcp' && field == 'limit')
        return type(value) == 'string' && match(value, /^[0-9]+$/) && int(value) >= 1 && int(value) <= 65535;
    return true;
}

function validate_staged(op, configs) {
    let staged = cursor(op + '/config', op + '/delta', '');
    let baseline = cursor(op + '/config', op + '/config', '');
    if (!staged || !baseline) die('Unable to validate staging');
    for (let config in configs) {
        if (!staged.load(config) || !baseline.load(config)) die('Invalid UCI configuration');
        staged.foreach(config, null, function(section) {
            let original = baseline.get_all(config, section['.name']) || {};
            for (let field, value in section) {
                if (substr(field, 0, 1) == '.' || sprintf('%J', original[field]) == sprintf('%J', value)) continue;
                if (!valid_field(config, field, value)) die('Invalid staged configuration field');
            }
        });
        staged.unload(config); baseline.unload(config);
    }
    return staged;
}

function private_file(path, data, exclusive) {
    // Replacements are built beside the target; opening the live journal with
    // 'w' would destroy rollback ownership before buffered I/O can fail.
    if (!exclusive && lstat(path) && !access(path, 'w'))
        die('Unable to write private staging data');
    let temp = exclusive ? null : mkdtemp(path + '.tmp.XXXXXX');
    if (!exclusive && !temp) die('Unable to create private staging data');
    let target = exclusive ? path : temp + '/data';
    let file = open(target, 'wxe', 0600);
    if (!file) {
        if (temp) rmdir(temp);
        die('Unable to create private staging data');
    }
    let secured = chmod(target, 0600);
    let written = secured ? file.write(data) : null;
    // Native close() ignores fclose errors. fflush is the checked completion
    // boundary for this RAM-backed journal, not a claim of reboot durability.
    let flushed = written == length(data) ? file.flush() : null;
    let closed = file.close();
    if (!secured || written != length(data) || !flushed || !closed) {
        unlink(target);
        if (temp) rmdir(temp);
        die('Unable to write private staging data');
    }
    // Only private data is replaced. Session deltas use exclusive hard links.
    if (temp) {
        let published = rename(target, path);
        if (!published) unlink(target);
        rmdir(temp);
        if (!published) die('Unable to publish private staging data');
    }
}

function remove_node(path, directory) {
    // Missing nodes are normal after a killed cleanup worker. Any real
    // deletion failure must leave the ownership journal for a fresh retry.
    if (lstat(path) && !(directory ? rmdir(path) : unlink(path)))
        die('Unable to remove private staging data');
}

function cleanup(op, lock) {
    for (let dir in ['config', 'delta', 'expected', 'publish']) {
        for (let name in lsdir(op + '/' + dir) || []) {
            let path = op + '/' + dir + '/' + name;
            if (match(name, /^(network|wireless|firewall|dhcp)\.tmp\.[a-zA-Z0-9]{6}$/) && lstat(path)?.type == 'directory') {
                remove_node(path + '/data', false);
                remove_node(path, true);
            } else if (index(CONFIGS, name) >= 0) remove_node(path, false);
        }
        remove_node(op + '/' + dir, true);
    }
    remove_node(op, true);
    // A killed worker can leave a private unpublished journal in this owned
    // lock. Do not sweep the runtime or another operation's temporary data.
    for (let name in lsdir(lock) || []) {
        let path = lock + '/' + name;
        if (match(name, /^state\.json\.tmp\.[a-zA-Z0-9]{6}$/) && lstat(path)?.type == 'directory') {
            remove_node(path + '/data', false);
            remove_node(path, true);
        }
    }
    // Check owned directory cleanup before dropping its sole recovery record.
    for (let name in lsdir(lock) || [])
        if (name != 'state.json') die('Unrecognized staging lock entries');
    remove_node(lock + '/state.json', false);
    remove_node(lock, true);
}

function private_node(path, kind, mode) {
    let node = lstat(path);
    return node?.type == kind && (node.mode & 0777) == mode;
}

function recover_initial(p) {
    // Published journals are never removed for replacement. Under the guard,
    // absence means apply was never dispatched; malformed journals are not initial.
    if (lstat(p.lock + '/state.json') || !lstat(p.lock)) return false;
    if (!private_node(p.runtime, 'directory', 0700)) die('Unrecognized staging runtime');
    if (!private_node(p.lock, 'directory', 0700)) die('Unrecognized staging lock');
    for (let name in lsdir(p.lock) || []) {
        let temp = p.lock + '/' + name;
        if (!match(name, /^state\.json\.tmp\.[a-zA-Z0-9]{6}$/) ||
            !private_node(temp, 'directory', 0700)) continue;
        let entries = lsdir(temp) || [];
        if (length(entries) > 1 || (length(entries) && entries[0] != 'data')) continue;
        if (lstat(temp + '/data') && !private_node(temp + '/data', 'file', 0600)) continue;
        let initial = null;
        try { initial = json(readfile(temp + '/data') || 'null'); } catch (e) {}
        if (initial?.phase == 'building' && type(initial.sid) == 'string' &&
            match(initial.sid, /^[0-9a-f]{32}$/) && type(initial.configs) == 'array' && !length(initial.configs) &&
            type(initial.op) == 'string' && substr(initial.op, 0, length(p.runtime) + 1) == p.runtime + '/' &&
            match(substr(initial.op, length(p.runtime) + 1), /^operation\.[a-zA-Z0-9]{6}$/) &&
            private_node(initial.op, 'directory', 0700) && !length(lsdir(initial.op)))
            rmdir(initial.op);
        // Partial metadata cannot identify an operation. Leave those orphans,
        // not a global operation-directory sweep or foreign-runtime deletion.
        if (lstat(temp + '/data')) unlink(temp + '/data');
        rmdir(temp);
    }
    if (!rmdir(p.lock)) die('Unrecognized staging lock entries');
    return true;
}

function owned_inode(identity, node) {
    return node?.type == 'file' && identity?.inode == node.inode &&
        sprintf('%J', identity?.dev) == sprintf('%J', node.dev);
}

function release(state, p) {
    // A killed worker's ln child may still be runnable. Revoke every private
    // link source BEFORE observing session targets, so delayed publication
    // cannot race a successful discard/expiry and strand an untracked delta.
    for (let dir in [state.op, state.op + '/publish'])
        if (lstat(dir) && !access(dir, 'x')) die('Unable to inspect session publication');
    for (let config in state.configs) {
        let backing = state.op + '/publish/' + config, node = lstat(backing);
        if (node && (!owned_inode(state.delta_files?.[config], node) || !unlink(backing)))
            die('Unable to revoke session publication');
    }
    // Inaccessible ancestors are not absent targets. Keep the journal and
    // immutable deltas when the filesystem refuses ownership observation.
    let session = p.rpcd + '/uci-' + state.sid;
    for (let dir in [p.rpcd, session])
        if (lstat(dir) && !access(dir, 'x')) die('Unable to inspect session publication');
    for (let config in state.configs) {
        let target = session + '/' + config;
        let own = readfile(state.op + '/delta/' + config);
        let data = readfile(target), node = lstat(target), identity = state.delta_files?.[config];
        // Native commit truncates consumed session deltas instead of unlinking
        // them. Every removal requires our recorded regular-file identity,
        // even for identical bytes, symlinks or prepublication collisions.
        let consumed = state.phase == 'pending' && data == '';
        if (owned_inode(identity, node) && own != null && (data == own || consumed) && !unlink(target))
            die('Unable to remove owned session delta');
    }
    cleanup(state.op, p.lock);
}

function prepare_expected(op, staged, configs) {
    if (!mkdir(op + '/expected', 0700)) die('Unable to prepare confirmation proof');
    for (let config in CONFIGS) {
        if (index(configs, config) < 0) {
            private_file(op + '/expected/' + config, readfile(op + '/config/' + config));
            continue;
        }
        // Serialize the checked saved staging cursor, not unsaved edits on
        // the business-logic handle. Never commit its baseline or consume
        // the original saved deltas.
        let sections = [];
        staged.foreach(config, null, section => push(sections, section));
        private_file(op + '/expected/' + config, '');
        let expected = cursor(op + '/expected', op + '/expected', '');
        // Absolute load sets has_delta=false (libuci file.c), excluding ALL
        // delta_path entries, including the default CLI path.
        if (!expected || !expected.load(op + '/expected/' + config)) die('Unable to prepare confirmation proof');
        for (let section in sections) {
            let name = section['.anonymous'] ? expected.add(config, section['.type']) : section['.name'];
            if (!name || (!section['.anonymous'] && !expected.set(config, name, section['.type'])))
                die('Unable to prepare confirmation proof');
            for (let field, value in section)
                if (substr(field, 0, 1) != '.' && !expected.set(config, name, field, value))
                    die('Unable to prepare confirmation proof');
        }
        if (!expected.commit(config) || !private_node(op + '/expected/' + config, 'file', 0600))
            die('Unable to prepare confirmation proof');
    }
}

function desired_matches(state, p) {
    // An empty net delta can match both snapshots. Baseline equality proves
    // safe restoration, not that native confirm acknowledged the intent.
    if (baseline_matches(state.op, p)) return false;
    if (state.expected_ready !== true || !private_node(state.op + '/expected', 'directory', 0700)) return false;
    for (let config in CONFIGS) {
        let expected = state.op + '/expected/' + config;
        let persistent = p.config + '/' + config;
        // Persistent bytes, never a session/CLI-influenced cursor.
        if (!private_node(expected, 'file', 0600) || lstat(persistent)?.type != 'file' ||
            readfile(expected) == null || readfile(persistent) != readfile(expected)) return false;
    }
    return true;
}

function confirmed(state, p) {
    private_file(p.runtime + '/confirmed.json', sprintf('%J', {sid: state.sid, op: state.op, expires: time() + 90}));
    // Remove only identifiable receipts for this exact operation, not a
    // runtime-wide orphan sweep (partial or foreign metadata is preserved).
    for (let name in lsdir(p.runtime) || []) {
        let temp = p.runtime + '/' + name;
        if (!match(name, /^confirmed\.json\.tmp\.[a-zA-Z0-9]{6}$/) ||
            !private_node(temp, 'directory', 0700) || !private_node(temp + '/data', 'file', 0600) ||
            length(lsdir(temp)) != 1) continue;
        let receipt = null;
        try { receipt = json(readfile(temp + '/data') || 'null'); } catch (e) {}
        if (receipt?.sid != state.sid || receipt?.op != state.op) continue;
        unlink(temp + '/data'); rmdir(temp);
    }
    state.terminal_resolution = 'confirmed';
    private_file(p.lock + '/state.json', sprintf('%J', state));
    release(state, p);
    return 'confirmed';
}

function recover_terminal(state, p) {
    if (state?.phase != 'pending') return null;
    let outcome = state.terminal_resolution;
    if (outcome != 'confirmed' && outcome != 'rolled_back') {
        let receipt = null;
        try { receipt = json(readfile(p.runtime + '/confirmed.json') || 'null'); } catch (e) {}
        // This exact positive ACK belongs to the still-owned operation. Its
        // retry window limits journal-less retries, not unfinished cleanup.
        if (!private_node(p.runtime + '/confirmed.json', 'file', 0600) ||
            receipt?.sid != state.sid || receipt?.op != state.op) return null;
        outcome = 'confirmed';
        state.terminal_resolution = outcome;
        private_file(p.lock + '/state.json', sprintf('%J', state));
    }
    release(state, p);
    return outcome;
}

function rollback_expired(state, p, deps) {
    if (state.rollback_requested !== true) {
        state.rollback_requested = true;
        private_file(p.lock + '/state.json', sprintf('%J', state));
    }
    if (deps.bus.call('uci', 'rollback', {ubus_rpc_session: state.sid}) == null) {
        // rpcd has already rolled back only when it reports NO_DATA and the
        // persistent files really match the pre-apply snapshot.
        if (type(deps.bus.error) != 'function' || deps.bus.error(true) != 5)
            die('Rollback deadline expired; recovery could not be verified');
        if (state.confirm_requested === true && desired_matches(state, p)) return confirmed(state, p);
        snapshots_unchanged(state.op, p);
    }
    state.terminal_resolution = 'rolled_back';
    private_file(p.lock + '/state.json', sprintf('%J', state));
    release(state, p);
    return 'expired';
}

export function create_transaction(args, deps) {
    let p = paths(deps);
    let sid = authorize(args, deps);
    return guarded(p, function() {
    recover_initial(p);
    let previous = json(readfile(p.lock + '/state.json') || 'null');
    // Only a finite, elapsed server deadline permits foreign-session housekeeping.
    let expired = previous && (type(previous.expires) == 'int' || type(previous.expires) == 'double') &&
        previous.expires - previous.expires == 0 && previous.expires <= time();
    if (previous && previous.sid != sid && !expired)
        die('This configuration change belongs to another session');
    if (recover_terminal(previous, p)) previous = null;
    if (previous && expired) {
        if (previous.phase == 'pending') rollback_expired(previous, p, deps);
        else release(previous, p);
    }
    session_clean(p, sid);
    if (!mkdir(p.lock, 0700))
        die('Another configuration change is pending confirmation');
    unlink(p.runtime + '/confirmed.json');
    let op = mkdtemp(p.runtime + '/operation.XXXXXX');
    if (!op) {
        rmdir(p.lock);
        die('Unable to create private staging directory');
    }
    let c;
    try {
        private_file(p.lock + '/state.json', sprintf('%J', {
            sid, op, phase: 'building', configs: [], created: time(), expires: time() + 300
        }));
        if (!mkdir(op + '/config', 0700) || !mkdir(op + '/delta', 0700))
            die('Unable to create private staging directory');
        for (let config in CONFIGS) {
            let original = readfile(p.config + '/' + config);
            if (original == null) die('Unable to snapshot configuration');
            private_file(op + '/config/' + config, original);
        }
        c = cursor(op + '/config', op + '/delta', '');
        if (!c) die('Unable to create UCI staging cursor');
    } catch (e) {
        cleanup(op, p.lock);
        die('Unable to prepare private configuration staging');
    }
    let dirty = {};
    let closed = false;
    let adapter = {
        get: (...v) => c.get(...v),
        get_all: (...v) => c.get_all(...v),
        get_first: (...v) => c.get_first(...v),
        foreach: (...v) => c.foreach(...v),
        set: (...v) => c.set(...v),
        add: (...v) => c.add(...v),
        delete: (...v) => c.delete(...v),
        load: (...v) => c.load(...v),
        unload: (...v) => c.unload(...v),
        set_confdir: () => true,
        commit: function(config) {
            if (index(CONFIGS, config) < 0)
                die('Unsupported configuration');
            if (!c.save(config))
                die('Unable to stage UCI changes');
            dirty[config] = true;
            return true;
        }
    };
    return {
        new_uci: () => adapter,
        exec: function(command) {
            if (type(command) != 'string' || type(deps.exec) != 'function') return '';
            if (!match(command, /^bridge (-j )?fdb show br ('[a-zA-Z0-9_.:-]+'|[a-zA-Z0-9_.:-]+)$/) &&
                !match(command, /^ip (-j )?(-4 )?(addr|link) show dev ('[a-zA-Z0-9_.:-]+'|[a-zA-Z0-9_.:-]+)$/) &&
                !match(command, /^ip (-4 )?route get [0-9.]+$/)) return '';
            return deps.exec(command) || '';
        },
        abort: () => guarded(p, function() {
            if (closed) return;
            closed = true;
            let state = json(readfile(p.lock + '/state.json') || 'null');
            if (state?.op == op) cleanup(op, p.lock);
        }),
        finish: (result) => guarded(p, function() {
            if (closed) return {success: false, message: 'This operation has already finished'};
            closed = true;
            let state = json(readfile(p.lock + '/state.json') || 'null');
            if (state?.op != op) return {success: false, message: 'This operation is no longer active'};
            if (state.expires <= time()) {
                cleanup(op, p.lock);
                return {success: false, message: 'This staging operation expired'};
            }
            if (!result || result.success !== true) {
                cleanup(op, p.lock);
                return result || { success: false, message: 'Configuration operation failed' };
            }
            let configs = [];
            for (let config in keys(dirty)) {
                let delta = readfile(op + '/delta/' + config);
                if (length(delta)) push(configs, config);
            }
            if (!length(configs)) {
                cleanup(op, p.lock);
                result.staged = false;
                result.changed = false;
                return result;
            }
            try {
            authorize(args, deps);
            session_clean(p, sid); snapshots_unchanged(op, p);
            let staged = validate_staged(op, configs);
            prepare_expected(op, staged, configs);
            // Complete private copies before any session filesystem effects.
            // Native UCI may truncate the linked copy; keep saved deltas intact.
            if (!mkdir(op + '/publish', 0700)) die('Unable to prepare publication');
            let delta_files = {};
            for (let config in configs) {
                let backing = op + '/publish/' + config;
                private_file(backing, readfile(op + '/delta/' + config), true);
                let node = lstat(backing);
                if (node?.type != 'file' || (node.mode & 0777) != 0600 ||
                    readfile(backing) != readfile(op + '/delta/' + config)) die('Unable to prepare publication');
                delta_files[config] = {inode: node.inode, dev: node.dev};
            }
            let plan = {
                sid, phase: 'staged', op, configs, delta_files, expected_ready: true, created: time(), expires: time() + 300
            };
            private_file(p.lock + '/state.json', sprintf('%J', plan));
            state = plan;
            mkdir(p.rpcd, 0700);
            let session = p.rpcd + '/uci-' + sid;
            mkdir(session, 0700);
            for (let config in configs) {
                // Native fs has no link export. ln -T is atomic, exclusive,
                // refuses directories/EXDEV, and never overwrites a collision.
                // Fixed shell text suppresses authenticated paths in stderr;
                // paths are separate argv entries, never shell interpolation.
                let linked = system(['/bin/sh', '-c', 'exec /bin/ln -T -- "$1" "$2" 2>/dev/null',
                    'easy-setup-link', op + '/publish/' + config, session + '/' + config], 1000);
                let node = lstat(session + '/' + config), identity = delta_files[config];
                if (linked != 0 || !owned_inode(identity, node)) die('Unable to publish session delta');
            }
            result.staged = true;
            result.changed = true;
            return result;
            } catch (e) {
                // Before the plan's atomic rename, the building journal owns
                // no session entries. After it, cleanup uses the full plan.
                try { release(state, p); } catch (cleanup_error) {}
                return {success: false, message: 'Unable to publish configuration changes; reload and retry'};
            }
        })
    };
    });
};

function session_owned(state, p) {
    cli_clean(p);
    let session = p.rpcd + '/uci-' + state.sid;
    for (let name in lsdir(session) || []) {
        let data = readfile(session + '/' + name);
        if (length(data) && (index(state.configs, name) < 0 || data != readfile(state.op + '/delta/' + name)))
            die('Unrelated LuCI changes appeared; discard this Easy Setup operation');
    }
    for (let config in state.configs)
        if (!owned_inode(state.delta_files?.[config], lstat(session + '/' + config)) ||
            readfile(session + '/' + config) != readfile(state.op + '/delta/' + config))
            die('Staged configuration changes were modified or removed');
}

function control_impl(method, args, deps) {
    try {
        let sid = authorize(args, deps);
        let p = paths(deps);
        let recovered = recover_initial(p);
        let state = json(readfile(p.lock + '/state.json') || 'null');
        if (recovered && method == 'discard_changes')
            return {success: true, message: 'Unpublished staging discarded'};
        if (state && state.sid != sid)
            die('This configuration change belongs to another session');
        let terminal = recover_terminal(state, p);
        if (terminal) {
            if (method == 'status' || method == 'get_apply_status')
                return {success: true, pending: false, phase: terminal == 'confirmed' ? 'idle' : 'expired', expires: 0};
            if (terminal == 'confirmed')
                return {success: method == 'confirm_changes', pending: false, message: 'Changes were already confirmed'};
            return {success: method == 'rollback_changes', pending: false, rolled_back: true, message: 'Changes were rolled back'};
        }
        if (!state && method == 'confirm_changes') {
            let receipt = json(readfile(p.runtime + '/confirmed.json') || 'null');
            if (receipt?.sid == sid && receipt.expires > time())
                return {success: true, message: 'Changes confirmed'};
        }
        if (state?.phase == 'pending' && state.expires <= time()) {
            let outcome = rollback_expired(state, p, deps);
            if (outcome == 'confirmed') {
                if (method == 'status' || method == 'get_apply_status')
                    return {success: true, pending: false, phase: 'idle', expires: 0};
                return {success: method == 'confirm_changes', message: 'Changes were already confirmed'};
            }
            if (method == 'status' || method == 'get_apply_status')
                return {success: true, pending: false, phase: 'expired', expires: 0};
            return {success: false, rolled_back: true, message: 'Confirmation deadline expired; changes were rolled back'};
        }
        if (method == 'status' || method == 'get_apply_status')
            return { success: true, pending: state?.phase == 'pending',
                phase: state?.phase || 'idle', expires: state?.expires || 0,
                confirm_wait_ms: state?.phase == 'pending' ? confirm_wait(state, deps) : 0 };
        if (!state) die('No Easy Setup change is staged');
        if (method == 'apply_changes') {
            if (state.phase != 'staged') die('Configuration is already awaiting confirmation');
            session_owned(state, p);
            snapshots_unchanged(state.op, p);
            let timeout = type(args.timeout) == 'int' || type(args.timeout) == 'double' ? int(args.timeout) : 90;
            timeout = min(90, max(30, timeout));
            // Journal before ubus: a transport timeout may occur after rpcd
            // applied the changes. Never lose ownership of that rollback.
            state.phase = 'pending';
            state.expires = time() + timeout;
            state.apply_settled = false;
            state.confirm_after_ms = now_ms(deps) + 4000;
            private_file(p.lock + '/state.json', sprintf('%J', state));
            let applied = null;
            try {
                applied = deps.bus.call('uci', 'apply', {ubus_rpc_session: sid, timeout, rollback: true});
            } catch (e) {
                // The call may have applied changes before throwing. Keep its
                // status uncertain, but still journal the settlement holdoff.
            }
            // Every settlement starts a full activation holdoff, including
            // a lost acknowledgement after rpcd may have applied the changes.
            state.confirm_after_ms = max(state.confirm_after_ms, now_ms(deps) + 4000);
            state.apply_settled = true;
            private_file(p.lock + '/state.json', sprintf('%J', state));
            if (applied == null) die('Unable to verify configuration apply');
            return {success: true, confirm_wait_ms: confirm_wait(state, deps), message: 'Changes applied; confirmation is required'};
        }
        if (method == 'confirm_changes') {
            if (state.phase != 'pending') die('No changes are awaiting confirmation');
            let wait = confirm_wait(state, deps);
            if (wait > 0) return {success: false, pending: true, confirm_wait_ms: wait,
                message: 'Configuration activation is pending; retry confirmation after the holdoff'};
            let previous_intent = state.confirm_requested === true;
            if (!previous_intent) {
                state.confirm_requested = true;
                // Failed intent publication must leave rollback armed.
                private_file(p.lock + '/state.json', sprintf('%J', state));
            }
            if (deps.bus.call('uci', 'confirm', {ubus_rpc_session: sid}) == null) {
                if (!previous_intent || type(deps.bus.error) != 'function' || deps.bus.error(true) != 5)
                    die('Unable to confirm configuration');
                if (!desired_matches(state, p)) {
                    snapshots_unchanged(state.op, p);
                    state.terminal_resolution = 'rolled_back';
                    private_file(p.lock + '/state.json', sprintf('%J', state));
                    release(state, p);
                    return {success: false, rolled_back: true, message: 'Changes were rolled back'};
                }
            }
            confirmed(state, p);
            return {success: true, message: 'Changes confirmed'};
        }
        if (method == 'rollback_changes') {
            if (state.phase != 'pending') die('No changes are awaiting confirmation');
            let previous_rollback = state.rollback_requested === true;
            if (!previous_rollback) {
                state.rollback_requested = true;
                private_file(p.lock + '/state.json', sprintf('%J', state));
            }
            if (deps.bus.call('uci', 'rollback', {ubus_rpc_session: sid}) == null) {
                if ((!previous_rollback && state.confirm_requested !== true) ||
                    type(deps.bus.error) != 'function' || deps.bus.error(true) != 5)
                    die('Unable to roll back configuration');
                if (state.confirm_requested === true && desired_matches(state, p)) {
                    confirmed(state, p);
                    return {success: false, message: 'Changes were already confirmed'};
                }
                snapshots_unchanged(state.op, p);
            }
            state.terminal_resolution = 'rolled_back';
            private_file(p.lock + '/state.json', sprintf('%J', state));
            release(state, p);
            return {success: true, message: 'Changes rolled back'};
        }
        if (method == 'discard_changes') {
            if (state.phase != 'staged') die('Applied changes must be confirmed or rolled back');
            release(state, p);
            return {success: true, message: 'Staged changes discarded'};
        }
        die('Unsupported transaction action');
    } catch (e) {
        return {success: false, message: 'Unable to complete configuration action; check pending status and reload'};
    }
};

export function handle_control(method, args, deps) {
    try { return guarded(paths(deps), () => control_impl(method, args, deps)); }
    catch (e) { return {success: false, message: 'Unable to complete configuration action; reload and retry'}; }
};
