// Executed by file.exec, never in rpcd's main-loop VM. Secrets arrive only in
// EASY_SETUP_ARGS, not argv. Parent modules own staging/apply and reachability.
import * as fs from 'fs';
import { cursor } from 'uci';

import { create_backend } from './backend.uc';
import { create_transaction, handle_control } from './transactions.uc';
import { cached_connectivity, run_probe } from './connectivity.uc';

const MUTATIONS = ['save_wan','save_wireless','delete_iface','save_offload','save_pkt_steering','save_smart_ap','delete_smart_ap','save_guest','delete_guest_band','fix_guest_dependencies'];
const CONTROLS = ['apply_changes','confirm_changes','rollback_changes','discard_changes','get_apply_status'];

function execute(command) {
 if (match(command,/^ifdown /)) {
  // Do not leave child processes holding file.exec's output descriptors.
  system('(' + replace(command,/\s*&\s*$/,'') + ') >/dev/null 2>&1 &');
  return '';
 }
 let child = fs.popen(command + ' 2>/dev/null','r');
 if (!child) return '';
 let out = child.read('all') ?? ''; child.close(); return out;
}

function run_request(method, args, deps) {
 deps ??= {};
 args ??= {};
 let tx;
 try {
  if (type(args) != 'object') return {success:false,message:'Invalid Easy Setup arguments'};

  if (index(CONTROLS,method) >= 0) return handle_control(method,args,deps);
  let mutation = index(MUTATIONS,method) >= 0;
  if (mutation) tx = create_transaction(args,deps);
  let native = tx ? null : cursor(deps.config_dir, deps.cli_delta_dir, '');
  if (!tx && !native) die('Unable to read UCI configuration');
  let files = deps.fs ?? fs, real_exec = deps.exec ?? execute;
  let ctx = {
   new_uci:tx ? tx.new_uci : () => native,
   stage:(config) => {if (!tx) die('Read-only configuration request'); return tx.new_uci().commit(config);},
   exec:(command) => {
    // Hardware discovery is read-only even during private mutation staging.
    if (match(command,/^bridge fdb show br |^logread$/)) return real_exec(command);
    return tx ? tx.exec(command) : real_exec(command);
   },
   call:(object, action, data) => deps.bus ? deps.bus.call(object,action,data) : null,
   objects:() => deps.bus ? deps.bus.list() ?? [] : [],
   bus_available:!!deps.bus,
   connectivity:(device) => cached_connectivity(device,deps),
   readfile:files.readfile,stat:files.stat,lsdir:files.lsdir,readlink:files.readlink,
  };
  if (method == 'reconnect_wan') {
   let sid = args.ubus_rpc_session;
   if (type(sid) != 'string' || !match(sid,/^[0-9a-f]{32}$/) || sid == '00000000000000000000000000000000' || deps.bus?.call('session','access',{ubus_rpc_session:sid,scope:'uci',object:'network',function:'write'})?.access !== true) die('Permission denied for WAN reconnect');
  }
  let backend = create_backend(ctx);
  if (method == 'probe_connectivity')
   return run_probe(args,{...deps,wan_info:() => backend._wan_info()});
  if (type(backend[method]) != 'function') return {success:false,error:'unknown method: ' + method};
  let result = backend[method](args);
  return tx ? tx.finish(result) : result;
 } catch (e) {
  if (tx) tx.abort();
  return {success:false,message:e.message ?? 'Easy Setup request failed'};
 }
}

function run_worker(method, args, deps) {
 deps ??= {};
 let own_bus = !deps.bus, result;
 try {
  if (own_bus) deps.bus = require('ubus').connect(null,1);
  result = run_request(method,args,deps);
 } catch (e) {result = {success:false,message:e.message ?? 'Easy Setup request failed'};}
 if (own_bus && deps.bus) {deps.bus.disconnect(); delete deps.bus;}
 return result;
};

// A module import has no positional arguments in native regression fixtures.
if (ARGV[0] != null) {
 let result;
 try { result = run_worker(ARGV[0],json(getenv('EASY_SETUP_ARGS') ?? '{}'),{}); }
 catch (e) { result = {success:false,message:'Invalid Easy Setup request'}; }
 printf('%J\n',result);
}
return {run_worker};
