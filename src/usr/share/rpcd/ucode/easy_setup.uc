// Only asynchronous file.exec runs inside rpcd's main-loop VM. The worker
// owns a separate ubus connection, so iwinfo/UCI calls cannot self-deadlock.
import { connect } from 'ubus';
let bus = connect();
const signatures = {
 get_config:{scope:''},get_ap_config:{},get_radio_config:{},get_radio_capabilities:{},
 status_wan:{fast:false},status_wireless:{},get_channels:{radio:''},get_wan_devices:{},
 get_smart_ap_config:{},get_guest_config:{},status_guest:{},
 save_wan:{proto:'',device:'',mtu:'',mac:'',peerdns:false,username:'',password:'',ipaddr:'',netmask:'',gateway:'',dns:'',packet_steering:'',wan_ipv6:false,lan_ipv6:false},
 save_wireless:{save_type:'',band:'',radio_sec:'',iface_sec:'',ssid:'',enc:'',key:'',hidden:'',iface_disabled:'',dev_disabled:'',roam:'',isolate:'',wnm:'',channel:'',htmode:'',txpower:'',country:'',noscan:''},
 reconnect_wan:{},delete_iface:{iface_sec:''},save_offload:{flow_offload:false,hw_flow_offload:false},save_pkt_steering:{packet_steering:''},
 save_smart_ap:{old_ssid:'',ssid:'',enc:'',key:'',hidden:'',disabled:'',isolate:'',roam:'',wnm:'',is_candidate:false},delete_smart_ap:{ssid:''},
 save_guest:{band:'',radio_sec:'',iface_sec:'',ssid:'',enc:'',key:'',hidden:'',disabled:'',isolate:'',roam:'',ipaddr:''},delete_guest_band:{iface_sec:'',radio_sec:''},fix_guest_dependencies:{},
 apply_changes:{timeout:90},confirm_changes:{},rollback_changes:{},discard_changes:{},get_apply_status:{},probe_connectivity:{},
};
let methods = {};
function register(method, signature) {
 signature.ubus_rpc_session = '';
 methods[method] = {
  args:signature,
  call:(request) => {
   let encoded = sprintf('%J',request.args || {});
   if (length(encoded) > 65536) return {success:false,error:'Request too large'};
   if (!bus) return {success:false,error:'ubus connection unavailable'};
   let deferred = bus.defer('file','exec',{
    command:'/usr/bin/ucode',
    params:['/usr/share/ucode/easy_setup/worker.uc',method],
    env:{EASY_SETUP_ARGS:encoded},
   },(status,response) => {
    if (status != 0 || !response || response.code != 0) {
     request.reply({success:false,error:'Easy Setup worker failed',code:status || response?.code || 1});
     return;
    }
    let result;
    try { result = json(response.stdout || ''); } catch (e) {}
    request.reply(type(result) == 'object' ? result : {success:false,error:'Invalid Easy Setup worker response'});
   });
   return deferred || {success:false,error:'Unable to start Easy Setup worker'};
  },
 };
}
for (let method, signature in signatures) register(method, signature);
return {easy_setup:methods};
