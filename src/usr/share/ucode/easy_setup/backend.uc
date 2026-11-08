// Native, injectable business logic. No UCI commit or service activation here.
// ctx.new_uci() returns the shared operation cursor; ctx.stage(config) saves
// session deltas only. Filesystem and ubus hooks allow native isolated fixtures.
const COUNTRIES = [["00", "00 - World"], ["AD", "AD - Andorra"], ["AE", "AE - United Arab Emirates"], ["AF", "AF - Afghanistan"], ["AG", "AG - Antigua and Barbuda"], ["AI", "AI - Anguilla"], ["AL", "AL - Albania"], ["AM", "AM - Armenia"], ["AN", "AN - Netherlands Antilles"], ["AO", "AO - Angola"], ["AQ", "AQ - Antarctica"], ["AR", "AR - Argentina"], ["AS", "AS - American Samoa"], ["AT", "AT - Austria"], ["AU", "AU - Australia"], ["AW", "AW - Aruba"], ["AZ", "AZ - Azerbaijan"], ["BA", "BA - Bosnia and Herzegovina"], ["BB", "BB - Barbados"], ["BD", "BD - Bangladesh"], ["BE", "BE - Belgium"], ["BF", "BF - Burkina Faso"], ["BG", "BG - Bulgaria"], ["BH", "BH - Bahrain"], ["BL", "BL - Saint Barthelemy"], ["BM", "BM - Bermuda"], ["BN", "BN - Brunei Darussalam"], ["BO", "BO - Bolivia"], ["BR", "BR - Brazil"], ["BS", "BS - Bahamas"], ["BT", "BT - Bhutan"], ["BY", "BY - Belarus"], ["BZ", "BZ - Belize"], ["CA", "CA - Canada"], ["CF", "CF - Central African Republic"], ["CH", "CH - Switzerland"], ["CI", "CI - Cote d'Ivoire"], ["CL", "CL - Chile"], ["CN", "CN - China"], ["CO", "CO - Colombia"], ["CR", "CR - Costa Rica"], ["CU", "CU - Cuba"], ["CX", "CX - Christmas Island"], ["CY", "CY - Cyprus"], ["CZ", "CZ - Czech Republic"], ["DE", "DE - Germany"], ["DJ", "DJ - Djibouti"], ["DK", "DK - Denmark"], ["DM", "DM - Dominica"], ["DO", "DO - Dominican Republic"], ["DZ", "DZ - Algeria"], ["EC", "EC - Ecuador"], ["EE", "EE - Estonia"], ["EG", "EG - Egypt"], ["ES", "ES - Spain"], ["ET", "ET - Ethiopia"], ["FI", "FI - Finland"], ["FM", "FM - Micronesia"], ["FR", "FR - France"], ["GA", "GA - Gabon"], ["GB", "GB - United Kingdom"], ["GD", "GD - Grenada"], ["GE", "GE - Georgia"], ["GF", "GF - French Guiana"], ["GH", "GH - Ghana"], ["GL", "GL - Greenland"], ["GP", "GP - Guadeloupe"], ["GR", "GR - Greece"], ["GT", "GT - Guatemala"], ["GU", "GU - Guam"], ["GY", "GY - Guyana"], ["HK", "HK - Hong Kong"], ["HN", "HN - Honduras"], ["HR", "HR - Croatia"], ["HT", "HT - Haiti"], ["HU", "HU - Hungary"], ["ID", "ID - Indonesia"], ["IE", "IE - Ireland"], ["IL", "IL - Israel"], ["IN", "IN - India"], ["IR", "IR - Iran"], ["IS", "IS - Iceland"], ["IT", "IT - Italy"], ["JM", "JM - Jamaica"], ["JO", "JO - Jordan"], ["JP", "JP - Japan"], ["KE", "KE - Kenya"], ["KH", "KH - Cambodia"], ["KN", "KN - Saint Kitts and Nevis"], ["KP", "KP - North Korea"], ["KR", "KR - South Korea"], ["KW", "KW - Kuwait"], ["KY", "KY - Cayman Islands"], ["KZ", "KZ - Kazakhstan"], ["LA", "LA - Laos"], ["LB", "LB - Lebanon"], ["LC", "LC - Saint Lucia"], ["LI", "LI - Liechtenstein"], ["LK", "LK - Sri Lanka"], ["LS", "LS - Lesotho"], ["LT", "LT - Lithuania"], ["LU", "LU - Luxembourg"], ["LV", "LV - Latvia"], ["MA", "MA - Morocco"], ["MC", "MC - Monaco"], ["MD", "MD - Moldova"], ["ME", "ME - Montenegro"], ["MF", "MF - Saint Martin"], ["MH", "MH - Marshall Islands"], ["MK", "MK - North Macedonia"], ["MN", "MN - Mongolia"], ["MO", "MO - Macao"], ["MP", "MP - Northern Mariana Islands"], ["MQ", "MQ - Martinique"], ["MR", "MR - Mauritania"], ["MT", "MT - Malta"], ["MU", "MU - Mauritius"], ["MV", "MV - Maldives"], ["MX", "MX - Mexico"], ["MY", "MY - Malaysia"], ["NG", "NG - Nigeria"], ["NI", "NI - Nicaragua"], ["NL", "NL - Netherlands"], ["NO", "NO - Norway"], ["NP", "NP - Nepal"], ["NZ", "NZ - New Zealand"], ["OM", "OM - Oman"], ["PA", "PA - Panama"], ["PE", "PE - Peru"], ["PF", "PF - French Polynesia"], ["PG", "PG - Papua New Guinea"], ["PH", "PH - Philippines"], ["PK", "PK - Pakistan"], ["PL", "PL - Poland"], ["PM", "PM - Saint Pierre and Miquelon"], ["PR", "PR - Puerto Rico"], ["PT", "PT - Portugal"], ["PW", "PW - Palau"], ["PY", "PY - Paraguay"], ["QA", "QA - Qatar"], ["RE", "RE - Reunion"], ["RO", "RO - Romania"], ["RS", "RS - Serbia"], ["RU", "RU - Russia"], ["RW", "RW - Rwanda"], ["SA", "SA - Saudi Arabia"], ["SE", "SE - Sweden"], ["SG", "SG - Singapore"], ["SI", "SI - Slovenia"], ["SK", "SK - Slovakia"], ["SN", "SN - Senegal"], ["SR", "SR - Suriname"], ["SV", "SV - El Salvador"], ["SY", "SY - Syria"], ["TC", "TC - Turks and Caicos Islands"], ["TD", "TD - Chad"], ["TG", "TG - Togo"], ["TH", "TH - Thailand"], ["TN", "TN - Tunisia"], ["TR", "TR - Turkey"], ["TT", "TT - Trinidad and Tobago"], ["TW", "TW - Taiwan"], ["TZ", "TZ - Tanzania"], ["UA", "UA - Ukraine"], ["UG", "UG - Uganda"], ["US", "US - United States"], ["UY", "UY - Uruguay"], ["UZ", "UZ - Uzbekistan"], ["VA", "VA - Vatican City"], ["VC", "VC - Saint Vincent and the Grenadines"], ["VE", "VE - Venezuela"], ["VI", "VI - US Virgin Islands"], ["VN", "VN - Vietnam"], ["VU", "VU - Vanuatu"], ["WS", "WS - Samoa"], ["YE", "YE - Yemen"], ["YT", "YT - Mayotte"], ["ZA", "ZA - South Africa"], ["ZW", "ZW - Zimbabwe"], ["OTHER", "Other..."]];

export function create_backend(ctx) {
 let methods = {};
 function str(u, config, section, option) { let v = u.get(config, section, option); return v == null ? null : type(v) == 'array' ? join(' ', v) : '' + v; }
 function read(path) { let s = ctx.readfile(path); return s == null ? null : trim(split(s, '\n')[0]); }
 function call(object, method, args) { try { return ctx.call(object, method, args || {}); } catch (e) { return null; } }
 function words(v) { return filter(split(v || '', /\s+/), (s) => s != ''); }
 function generation(htmode) { let h = uc(htmode || ''); return !h ? null : match(h, /^EHT/) ? '11be' : match(h, /^HE/) ? '11ax' : match(h, /^VHT/) ? '11ac' : match(h, /^HT/) ? '11n' : 'legacy'; }
 function radios(u) {
  let out = {};
  u.foreach('wireless','wifi-device', (d) => {
   let band = lc(d.band || '');
   if (index(['2g','5g','6g'],band) < 0) { let hw = lc(d.hwmode || ''); band = index(['11a','11na','11ac','11ax'],hw) >= 0 || index(hw,'5g') >= 0 ? '5g' : '2g'; }
   let ifaces = [], smart_ifaces = [];
   u.foreach('wireless','wifi-iface',(s) => { if (s.device == d['.name'] && s.mode == 'ap' && s.network != 'guest_zone') push(s.is_smart_ap == '1' ? smart_ifaces : ifaces, s['.name']); });
   if (!length(ifaces)) u.foreach('wireless','wifi-iface',(s) => { if (s.device == d['.name'] && s.network != 'guest_zone' && s.is_smart_ap != '1' && !length(ifaces)) push(ifaces,s['.name']); });
   let key = band, n = 2; while (out[key]) key = band + '_' + n++;
   out[key] = {radio_sec:d['.name'],ifaces,smart_ifaces};
  });
  return out;
 }
 function radio(u, section) {
  let get = (key) => str(u,'wireless',section,key), h = get('htmode') || '', gen = generation(h), band = lc(get('band') || ''), hw = lc(get('hwmode') || '');
  if (!gen || gen == 'legacy') gen = hw == '11be' ? '11be' : index(['11ax','11ax_6g'],hw) >= 0 ? '11ax' : hw == '11ac' ? '11ac' : index(['11n','11na'],hw) >= 0 ? '11n' : band == '5g' ? '11ac' : '11n';
  return {radio_sec:section, channel:get('channel') || 'auto', txpower:get('txpower') || '', country:get('country') || '', htmode:h || ({'11n':'HT20','11ac':'VHT80','11ax':'HE80','11be':'EHT80'}[gen]) || 'HT20', wifi_gen:gen, band, noscan:get('noscan') || '0', disabled:get('disabled') || '0'};
 }
 function iface(u, section, disabled) {
  let get = (key) => str(u,'wireless',section,key), out = {iface_sec:section,ssid:get('ssid') || '',enc:get('encryption') || 'none',key:get('key') || '',network:get('network') || 'lan'};
  for (let key in ['hidden','bss_transition','ieee80211k','isolate','wnm_sleep_mode','is_smart_ap']) out[key] = get(key) || '0';
  out.disabled = disabled == '1' || get('disabled') == '1' ? '1' : '0';
  return out;
 }
 function candidates(groups) {
  let out = [];
  for (let k, g in groups) if (length(g.interfaces) > 1) {
   g.mismatch = false;
   for (let i = 1; i < length(g.interfaces); i++) for (let key in ['enc','hidden','isolate','bss_transition','ieee80211k','wnm_sleep_mode']) if (g.interfaces[i][key] != g.interfaces[0][key]) g.mismatch = true;
   push(out,g);
  }
  return out;
 }
 let wpa3_cache;
 function wpa3() {
  if (wpa3_cache != null) return wpa3_cache;
  let cached = read('/tmp/easy_setup/wpa3_support');
  if (cached == '0' || cached == '1') return wpa3_cache = cached == '1';
  let scanned = {};
  for (let path in ['/usr/sbin/wpad','/usr/sbin/hostapd']) {
   let link = ctx.readlink(path); if (link) path = substr(link,0,1) == '/' ? link : '/usr/sbin/' + link;
   if (scanned[path]) continue; scanned[path] = true;
   let data = ctx.readfile(path);
   if (data && match(data,/sae_password|sae_pwe|sae_anti_clogging/)) return wpa3_cache = true;
  }
  for (let f in ctx.lsdir('/usr/lib/opkg/info') || []) {
   if (match(f,/^(wpad|wpa)-(basic|mini)/)) return wpa3_cache = false;
   if (match(f,/^wpad\.|^wpad-mbedtls|^hostapd\./)) return wpa3_cache = true;
  }
  return wpa3_cache = false;
 }
 function hwmax(info, fallback) {
  let best;
  if (type(info?.hwmodes) == 'array') for (let m in info.hwmodes) {
   m = lc('' + m);
   if (m == 'be' || m == '11be') {best = '11be'; break;}
   if (m == 'ax' || m == '11ax') best = '11ax';
   else if (!best && (m == 'ac' || m == '11ac')) best = '11ac';
   else if (!best && (m == 'n' || m == '11n')) best = '11n';
  }
  if (!best && type(info?.htmodes) == 'array') for (let h in info.htmodes) {
   h = uc('' + h); if (match(h,/^EHT/)) {best = '11be'; break;} if (match(h,/^HE/)) best = '11ax'; else if (!best && match(h,/^VHT/)) best = '11ac'; else if (!best && match(h,/^HT/)) best = '11n';
  }
  return best ?? fallback ?? '11n';
 }
 function wireless_config(caps, features) {
  let u = ctx.new_uci(), rs = radios(u), groups = {}, out = {countries:COUNTRIES};
  for (let b in ['2g','5g','5g_2','6g']) if (rs[b]) for (let sec in rs[b].ifaces) {
   let s = iface(u,sec,'0'), mode = str(u,'wireless',sec,'mode') || 'ap';
   if (s.ssid && s.network == 'lan' && mode == 'ap') { let k = s.ssid + '||' + s.key; if (!groups[k]) groups[k] = {ssid:s.ssid,key:s.key,interfaces:[]}; s.band = b; push(groups[k].interfaces,s); }
  }
  if (features) { out.smart_candidates = candidates(groups); out.wpa3_supported = wpa3(); }
  let base = rs['2g'] && rs['2g'].ifaces[0] ? str(u,'wireless',rs['2g'].ifaces[0],'ssid') ?? 'OpenWrt' : 'OpenWrt';
  for (let b, field in {'2g':'w2','5g':'w5','5g_2':'w5b','6g':'w6'}) if (rs[b]) {
   let r = radio(u,rs[b].radio_sec); if (caps) r.hw_max = hwmax(call('iwinfo','info',{device:r.radio_sec}),r.wifi_gen);
   r.ifaces = [];
   for (let i, sec in rs[b].ifaces) { let s = iface(u,sec,r.disabled); if (!s.ssid && i == 0 && b != '2g') s.ssid = base + ({'5g':'_5G','5g_2':'_5G_2','6g':'_6G'}[b]); push(r.ifaces,s); }
   for (let sec in rs[b].smart_ifaces) { let s = iface(u,sec,r.disabled); s.is_smart_ap = '1'; push(r.ifaces,s); }
   out[field] = r;
  }
  return out;
 }
 methods.get_ap_config = () => wireless_config(false,true);
 methods.get_radio_config = () => wireless_config(false,false);
 methods.get_smart_ap_config = () => {
  let u = ctx.new_uci(), rs = radios(u), ssids = [], seen = {}, groups = {};
  u.foreach('wireless','wifi-iface',(s) => {
   let ssid = s.ssid || '', key = s.key || '', net = s.network || 'lan', mode = s.mode || 'ap';
   if (!ssid || net != 'lan' || mode != 'ap') return;
   if (s.is_smart_ap == '1') {
    if (!seen[ssid]) { let v = {ssid,encryption:s.encryption || 'none',key,network:net,radios:[]}; for (let k in ['hidden','disabled','isolate','bss_transition','ieee80211k','wnm_sleep_mode']) v[k] = s[k] || '0'; seen[ssid] = v; push(ssids,v); }
    push(seen[ssid].radios,s.device);
   } else {
    let k = ssid + '||' + key; if (!groups[k]) groups[k] = {ssid,key,interfaces:[]}; let v = iface(u,s['.name'],'0'); for (let b,r in rs) if (r.radio_sec == s.device) { v.band = b; break; } push(groups[k].interfaces,v);
   }
  });
  return {success:true,ssids,candidates:candidates(groups),radios:rs,wpad_mini:!!length(filter(ctx.lsdir('/usr/lib/opkg/info') || [],(f) => match(f,/^wpad-(basic|mini)/))),wpa3_supported:wpa3(),countries:COUNTRIES};
 };

 function physical(dev) {
  return !match(dev, /^(lo|br-|tun|tap|ppp|sit|gre|ip6|ifb|dummy|veth|vlan|wlan|phy|imq|teql|bond|team|ovs-|virbr)/) && !match(dev, /\.[0-9]+$/) && !!ctx.stat('/sys/class/net/' + dev + '/device');
 }
 function devices() { return sort(filter(ctx.lsdir('/sys/class/net') || [], physical)); }
 methods.get_wan_devices = () => ({success:true, devices:devices()});
 function param(args, key, fallback) { let v = args[key]; return v == null ? fallback : v === true ? '1' : v === false ? '0' : '' + v; }
 function pbool(args,key) { return args[key] === true || args[key] === '1'; }
 function stage(u, config) { if (type(ctx.stage) != 'function') die('Session staging hook is required'); return ctx.stage(config); }
 function toggle(u, config, sec, field, value) { if (value == '1') u.set(config,sec,field,'1'); else u.delete(config,sec,field); }
 function require_section(u, config, sec, kind) { if (!sec || u.get(config,sec) != kind) die('Invalid ' + kind + ' target'); }
 function validate_radio(u, sec, band) {
  require_section(u,'wireless',sec,'wifi-device');
  if (band != null && radios(u)[band == '5gb' ? '5g_2' : band]?.radio_sec != sec) die('Radio does not belong to the selected band');
 }
 function validate_radio_settings(u, sec, htmode, channel, txpower, country) {
  let band;
  for (let b, r in radios(u)) if (r.radio_sec == sec) {band = match(b,/^5g/) ? '5g' : b; break;}
  if (country != '' && !length(filter(COUNTRIES,(c) => c[0] == country))) die('Invalid regulatory country');
  if (!match(htmode,/^(NOHT|HT(20|40)|VHT(20|40|80|160|80\+80)|HE(20|40|80|160|80\+80)|EHT(20|40|80|160|320))$/)) die('Invalid radio HT mode');
  if (band == '2g' && (match(htmode,/^VHT/) || int(match(htmode,/[0-9]+/)?.[0] ?? '20') > 40)) die('Invalid 2.4 GHz channel width');
  if (band == '6g' && !match(htmode,/^(HE|EHT)/)) die('Invalid 6 GHz radio mode');
  if (channel != 'auto' && (!match(channel,/^[0-9]+$/) || int(channel) < 1 || int(channel) > (band == '2g' ? 14 : band == '5g' ? 196 : 233))) die('Invalid radio channel');
  if (txpower != '' && (!match(txpower,/^[0-9]+(\.[0-9]+)?$/) || +txpower > 40)) die('Invalid transmit power');
  // Use actual hardware replies, never synthetic capability fallbacks. A
  // country change may unlock currently restricted channels/power levels.
  let ws = call('network.wireless','status',{}), dev = ws?.[sec]?.interfaces?.[0]?.ifname ?? sec;
  function hw(method) { let v = call('iwinfo',method,{device:dev}); return (!v || (method == 'freqlist' && !length(v.results ?? []))) && dev != sec ? call('iwinfo',method,{device:sec}) : v; }
  let freqs = hw('freqlist'), info = hw('info'), power = hw('txpowerlist'), same_country = (country || '00') == (uc(str(u,'wireless',sec,'country') ?? '') || '00');
  let available = filter(freqs?.results ?? [],(f) => f.channel > 0 && (!same_country || (f.restricted !== true && f.restricted !== 1)));
  if (channel != 'auto' && length(freqs?.results ?? []) && !length(filter(available,(f) => f.channel == int(channel)))) die('Channel is unavailable on this radio');
  if (htmode != 'NOHT' && length(info?.htmodes ?? []) && index(info.htmodes,htmode) < 0) die('HT mode is unsupported by this radio');
  let maximum;
  for (let e in power?.results ?? []) if (e.dbm != null && +e.dbm >= 0 && (maximum == null || +e.dbm > maximum)) maximum = +e.dbm;
  if (same_country && txpower != '' && maximum != null && +txpower > maximum) die('Transmit power exceeds the radio maximum');
 }
 function validate_iface(u, sec, rsec, guest) {
  require_section(u,'wireless',sec,'wifi-iface');
  let device = str(u,'wireless',sec,'device');
  validate_radio(u,device);
  if (rsec && device != rsec) die('Interface does not belong to the selected radio');
  if (guest && (str(u,'wireless',sec,'network') != 'guest_zone' || str(u,'wireless',sec,'mode') != 'ap')) die('Not a guest AP interface');
 }
 function validate_encryption(enc) { if (index(['none','psk','psk2','psk-mixed','sae'],enc) < 0) die('Unsupported wireless encryption'); }
 function validate_ssid(ssid) { if (type(ssid) != 'string' || !length(ssid) || length(ssid) > 32 || (index(ssid,'\x00') >= 0 || match(ssid,/[[:cntrl:]]/))) die('SSID must contain 1 to 32 UTF-8 bytes without control characters'); }
 function validate_key(enc, key) {
  if (enc == 'none') return;
  if (type(key) != 'string' || (index(key,'\x00') >= 0 || match(key,/[[:cntrl:]]/)) || !((length(key) >= 8 && length(key) <= 63) || (enc != 'sae' && match(key,/^[a-fA-F0-9]{64}$/)))) die('Invalid wireless password');
 }
 function slug(s, limit) { return substr(replace(lc(s),/[^A-Za-z0-9]/g,'_'),0,limit); }
 function free_section(u,config,base) { let sec = base, n = 2; while (u.get(config,sec) != null) sec = base + '_' + n++; return sec; }
 methods.save_wireless = (a) => {
  let u = ctx.new_uci(), p = (k,d) => param(a,k,d), save_type = p('save_type','iface'), band = p('band','2g'), base_band = match(band,/^5g/) ? '5g' : match(band,/^6g/) ? '6g' : '2g';
  if (index(['iface','new_iface','radio'],save_type) < 0) die('Invalid wireless save type');
  if (a.band != null && index(['2g','5g','5gb','5g_2','6g'],band) < 0) die('Invalid wireless band');
  if (save_type == 'radio') {
   let sec = p('radio_sec','radio0');
   validate_radio(u,sec,a.band);
   for (let b, r in radios(u)) if (r.radio_sec == sec) {base_band = match(b,/^5g/) ? '5g' : b; break;}
   let htmode = p('htmode',base_band == '6g' ? 'HE80' : base_band == '5g' ? 'VHT80' : 'HT20'), tx = +p('txpower',''), country = uc(p('country',''));
   validate_radio_settings(u,sec,htmode,p('channel','auto'),p('txpower',''),country);
   u.set('wireless',sec,'htmode',htmode);
   if (base_band == '6g') u.delete('wireless',sec,'hwmode'); else u.set('wireless',sec,'hwmode',base_band == '5g' ? '11a' : '11g');
   u.set('wireless',sec,'channel',p('channel','auto'));
   if (p('txpower','') != '') u.set('wireless',sec,'txpower','' + int(tx)); else u.delete('wireless',sec,'txpower');
   if (country != '') u.set('wireless',sec,'country',country); else u.delete('wireless',sec,'country');
   toggle(u,'wireless',sec,'noscan',base_band == '2g' ? p('noscan') : '0');
   toggle(u,'wireless',sec,'disabled',p('dev_disabled','0'));
  } else {
   let is_new = save_type == 'new_iface', sec = is_new ? free_section(u,'wireless',slug(p('ssid','OpenWrt'),20)) : p('iface_sec','default_radio0'), ssid = p('ssid','OpenWrt'), enc = p('enc',is_new ? 'psk2' : 'none'), key = p('key',''), hidden = p('hidden','0'), disabled = p('iface_disabled','0'), roam = p('roam') == '1' ? '1' : '0', isolate = p('isolate') == '1' ? '1' : '0', wnm = p('wnm') == '1' ? '1' : '0';
   validate_ssid(ssid); validate_encryption(enc);
   validate_key(enc,key != '' ? key : is_new ? '' : str(u,'wireless',sec,'key') ?? '');
   if (is_new) {
    validate_radio(u,p('radio_sec','radio0'),a.band);
    if (p('iface_sec','') != '') validate_iface(u,p('iface_sec'),p('radio_sec','radio0'));
   }
   else {validate_iface(u,sec,p('radio_sec','')); validate_radio(u,str(u,'wireless',sec,'device'),a.band);}
   if (!is_new) {
    let cur = (field,d) => str(u,'wireless',sec,field) ?? d;
    let cur_enc = cur('encryption','none');
    if (cur('ssid','') == ssid && cur_enc == enc && (cur_enc == 'none' ? '' : cur('key','')) == (enc == 'none' ? '' : key) && cur('hidden','0') == hidden && cur('disabled','0') == disabled && cur('bss_transition','0') == roam && cur('isolate','0') == isolate && cur('wnm_sleep_mode','0') == wnm) return {success:true,message:'No changes.'};
   } else {
    u.set('wireless',sec,'wifi-iface');
    u.set('wireless',sec,'device',p('radio_sec','radio0')); u.set('wireless',sec,'mode','ap'); u.set('wireless',sec,'network','lan');
   }
   u.set('wireless',sec,'ssid',ssid); u.set('wireless',sec,'encryption',enc);
   if (enc != 'none' && key != '') u.set('wireless',sec,'key',key); else if (!is_new && enc == 'none') u.delete('wireless',sec,'key');
   if (is_new) { if (hidden == '1') u.set('wireless',sec,'hidden','1'); if (disabled == '1') u.set('wireless',sec,'disabled','1'); }
   else { toggle(u,'wireless',sec,'hidden',hidden); toggle(u,'wireless',sec,'disabled',disabled); }
   for (let field,val in {ieee80211k:roam,bss_transition:roam,isolate,wnm_sleep_mode:wnm}) u.set('wireless',sec,field,val);
   if (is_new) { let saved = stage(u,'wireless'); return {success:saved,iface_sec:sec,message:saved ? 'SSID added.' : 'Failed to add SSID.'}; }
  }
  let saved = stage(u,'wireless'); return {success:saved,message:saved ? 'Wireless settings saved.' : 'Failed to save.'};
 };
 methods.delete_iface = (a) => {
  let u = ctx.new_uci(), sec = param(a,'iface_sec','');
  if (!sec) return {success:false,message:'No iface_sec provided.'};
  if (u.get('wireless',sec) != 'wifi-iface') return {success:false,message:'Invalid section: not a wifi-iface.'};
  u.delete('wireless',sec); let saved = stage(u,'wireless'); return {success:saved,message:saved ? 'SSID deleted.' : 'Failed to delete.'};
 };
 methods.save_smart_ap = (a) => {
  let u = ctx.new_uci(), p = (k,d) => param(a,k,d), ssid = p('ssid'), old = p('old_ssid'), candidate = p('is_candidate') == '1', enc = p('enc','psk2'), key = p('key','');
  if (ssid == null || ssid == '') return {success:false,message:'SSID is required'};
  validate_ssid(ssid); validate_encryption(enc);
  function set_fields(sec, is_new) {
   u.set('wireless',sec,'ssid',ssid); u.set('wireless',sec,'encryption',enc);
   if (enc != 'none') u.set('wireless',sec,'key',key != '' ? key : str(u,'wireless',sec,'key') ?? ''); else if (!is_new) u.delete('wireless',sec,'key');
   for (let field in ['hidden','disabled','isolate']) { if (is_new) { if (p(field,'0') == '1') u.set('wireless',sec,field,'1'); } else toggle(u,'wireless',sec,field,p(field,'0')); }
   for (let field in ['ieee80211k','bss_transition']) { if (is_new) { if (p('roam','0') == '1') u.set('wireless',sec,field,'1'); } else toggle(u,'wireless',sec,field,p('roam','0')); }
   if (is_new) { if (p('wnm','0') == '1') u.set('wireless',sec,'wnm_sleep_mode','1'); } else toggle(u,'wireless',sec,'wnm_sleep_mode',p('wnm','0'));
   u.set('wireless',sec,'is_smart_ap','1');
  }
  if ((old != null && old != '') || candidate) {
   let targets = [];
   u.foreach('wireless','wifi-iface',(s) => {
    if (s.network == 'lan' && s.mode == 'ap' && (candidate ? s.ssid == ssid : s.is_smart_ap == '1' && s.ssid == old)) push(targets,s['.name']);
   });
   if (!length(targets)) die('Smart AP target not found');
   for (let sec in targets) { validate_iface(u,sec); validate_key(enc,key != '' ? key : str(u,'wireless',sec,'key') ?? ''); }
   for (let sec in targets) set_fields(sec,false);
  } else {
   let rs = radios(u); if (!length(keys(rs))) die('No wireless radios found');
   validate_key(enc,key);
   for (let b, r in rs) { let sec = free_section(u,'wireless',slug(ssid,15) + '_' + r.radio_sec); u.set('wireless',sec,'wifi-iface'); u.set('wireless',sec,'device',r.radio_sec); u.set('wireless',sec,'network','lan'); u.set('wireless',sec,'mode','ap'); set_fields(sec,true); }
  }
  let saved = stage(u,'wireless'); return {success:saved,message:saved ? 'Smart AP settings saved.' : 'Failed to save.'};
 };
 methods.delete_smart_ap = (a) => {
  let u = ctx.new_uci(), ssid = param(a,'ssid'); if (ssid == null || ssid == '') return {success:false,message:'SSID is required'};
  let targets = [];
  u.foreach('wireless','wifi-iface',(s) => { if (s.network == 'lan' && s.mode == 'ap' && s.is_smart_ap == '1' && s.ssid == ssid) push(targets,s['.name']); });
  if (!length(targets)) die('Smart AP target not found');
  for (let sec in targets) u.delete('wireless',sec);
  let saved = stage(u,'wireless'); return {success:saved,message:saved ? 'Smart AP SSID deleted.' : 'Failed to delete.'};
 };
 methods.save_offload = (a) => {
  let u = ctx.new_uci(), sw = pbool(a,'flow_offload'), hw = pbool(a,'hw_flow_offload'), sec;
  u.foreach('firewall','defaults',(s) => {sec = s['.name']; return false;});
  if (!sec) sec = u.add('firewall','defaults');
  if ((u.get('firewall',sec,'flow_offloading') == '1') == sw && (u.get('firewall',sec,'flow_offloading_hw') == '1') == hw) return {success:true,message:'No changes.'};
  u.set('firewall',sec,'flow_offloading',sw ? '1' : '0'); u.set('firewall',sec,'flow_offloading_hw',hw ? '1' : '0');
  let saved = stage(u,'firewall'); return {success:saved,message:saved ? 'Offload settings applied.' : 'Failed to save.'};
 };
 methods.save_pkt_steering = (a) => {
  let u = ctx.new_uci(), val = param(a,'packet_steering','0');
  if (u.get('network','globals') != null) require_section(u,'network','globals','globals');
  let label = {'0':'Disabled','1':'Enabled','2':'Enabled (all CPUs)'}[val];
  if ((u.get('network','globals','packet_steering') ?? '0') == val) return {success:true,message:'Packet Steering already set to ' + label + '.'};
  if (u.get('network','globals') == null) u.set('network','globals','globals');
  u.set('network','globals','packet_steering',val); let saved = stage(u,'network'); return {success:saved,message:saved ? 'Packet Steering set to ' + label + '.' : 'Failed to save.'};
 };
 function ipv4(value) {
  if (type(value) != 'string' || !match(value,/^[0-9]{1,3}(\.[0-9]{1,3}){3}$/)) return false;
  for (let octet in split(value,'.')) if (int(octet) > 255) return false;
  return true;
 }
 function host_ipv4(value) { return ipv4(value) && int(split(value,'.')[0]) > 0 && int(split(value,'.')[0]) < 224 && value != '255.255.255.255'; }
 function ipv4_number(value) { let n = 0; for (let octet in split(value,'.')) n = n * 256 + int(octet); return n; }
 function mask_prefix(mask) {
  if (!ipv4(mask)) return null;
  let n = ipv4_number(mask), inverse = 4294967295 - n;
  if ((inverse & (inverse + 1)) != 0) return null;
  let bits = 0; while (n > 0) {bits += n & 1; n = int(n / 2);} return bits;
 }
 function ipv6(value) {
  let halves = split(value,'::'); if (length(halves) > 2 || !length(value) || match(value,/:::|^:[^:]|[^:]:$/)) return false;
  let count = 0, parts = split(value,':');
  for (let i, part in parts) {
   if (part == '' && length(halves) == 2) continue;
   if (index(part,'.') >= 0) {if (i != length(parts)-1 || !ipv4(part)) return false; count += 2;}
   else {if (!match(part,/^[a-fA-F0-9]{1,4}$/)) return false; count++;}
  }
  return length(halves) == 2 ? count < 8 : count == 8;
 }
 function subnet_range(address, mask) {
  let parts = split(address,'/'), bits = length(parts) == 2 && match(parts[1],/^[0-9]+$/) ? int(parts[1]) : mask != null ? mask_prefix(mask) : 24;
  if (!ipv4(parts[0]) || length(parts) > 2 || bits == null || bits < 0 || bits > 32) return null;
  let size = 1; for (let n = bits; n < 32; n++) size *= 2;
  let start = int(ipv4_number(parts[0]) / size) * size;
  return [start,start + size - 1];
 }
 function subnet_conflict(u, address) {
  let desired = subnet_range(address), conflict;
  u.foreach('network','interface',(s) => {
   if (s['.name'] == 'guest_zone') return;
   for (let ip in type(s.ipaddr) == 'array' ? s.ipaddr : s.ipaddr != null ? [s.ipaddr] : []) {
    let existing = subnet_range(ip,s.netmask);
    if (existing && desired[0] <= existing[1] && desired[1] >= existing[0]) {conflict = s['.name']; return false;}
   }
  });
  return conflict;
 }
 function validate_guest_ip(u, value) {
  let parts = split(value,'/'), ip = parts[0];
  if (!host_ipv4(ip) || length(parts) > 2 || (length(parts) == 2 && parts[1] != '24') || index([0,255],int(split(ip,'.')[3])) >= 0) die('Guest address must be a valid IPv4 host in a /24 subnet');
  let conflict = subnet_conflict(u,ip + '/24');
  if (conflict) die('Guest subnet conflicts with ' + conflict);
 }
 function validate_wan(u, iface_, a, proto) {
  let p = (key,d) => param(a,key,d), mtu = trim(p('mtu','')), mac = p('mac',''), dev = p('device','');
  if (u.get('network',iface_) != null) require_section(u,'network',iface_,'interface');
  if (u.get('network','globals') != null) require_section(u,'network','globals','globals');
  if (a.wan_ipv6 != null && u.get('network','wan6') != null) require_section(u,'network','wan6','interface');
  if (a.lan_ipv6 != null && u.get('network','lan') != null) require_section(u,'network','lan','interface');
  if (mtu != '' && (!match(mtu,/^[0-9]+$/) || int(mtu) < 576 || int(mtu) > 9000)) die('MTU must be between 576 and 9000');
  if (mac != '' && (!match(mac,/^[a-fA-F0-9]{2}(:[a-fA-F0-9]{2}){5}$/) || mac == '00:00:00:00:00:00' || (int(substr(mac,0,2),16) & 1))) die('Invalid unicast MAC address');
  if (dev != '' && (!match(dev,/^@?[a-zA-Z0-9_][a-zA-Z0-9_.:-]*$/) || (substr(dev,0,1) != '@' && length(dev) > 15))) die('Invalid WAN device name');
  for (let field in ['ipaddr','gateway']) if ((proto == 'static' || p(field,'') != '') && !host_ipv4(p(field,''))) die('Invalid WAN ' + field);
  if ((proto == 'static' || p('netmask','') != '') && mask_prefix(p('netmask','')) == null) die('Invalid contiguous IPv4 netmask');
  if (proto == 'static' && mask_prefix(p('netmask')) <= 30) {
   let range = subnet_range(p('ipaddr'),p('netmask')), address = ipv4_number(p('ipaddr'));
   if (address == range[0] || address == range[1]) die('Static WAN address is a network or broadcast address');
  }
  for (let dns in filter(map(split(p('dns',''),','),(v) => trim(v)),(v) => v != '')) if (!host_ipv4(dns) && !(ipv6(dns) && !match(dns,/^ff/i) && replace(dns,/[0:]/g,'') != '')) die('Invalid DNS server address');
  if (proto == 'pppoe' && (trim(p('username','')) == '' || (p('password','') == '' && (str(u,'network',iface_,'password') ?? '') == ''))) die('PPPoE credentials are required');
 }
 function bare_ip(ip) { return match(ip,/^(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? ip; }
 function prefix(ip) { return type(ip) == 'string' ? match(bare_ip(ip),/^(\d+\.\d+\.\d+\.)/)?.[1] : null; }
 function free_subnet(u) {
  for (let n = 2; n <= 50; n++) {let ip = '192.168.' + n + '.1'; if (!subnet_conflict(u,ip + '/24')) return ip;}
  for (let ip in ['192.168.100.1','172.16.2.1','10.0.2.1']) if (!subnet_conflict(u,ip + '/24')) return ip;
  return null;
 }
 function find_section(u,config,type_,predicate) { let sec; u.foreach(config,type_,(s) => {if (predicate(s)) {sec = s['.name']; return false;}}); return sec; }
 function set_options(u,config,sec,opts) { for (let k,v in opts) u.set(config,sec,k,v); }
 function guest_network(u,ip) {
  if (!find_section(u,'network','device',(s) => s.name == 'guest_zone')) { let sec = u.add('network','device'); set_options(u,'network',sec,{type:'bridge',name:'guest_zone'}); }
  u.set('network','guest_zone','interface'); set_options(u,'network','guest_zone',{proto:'static',ipaddr:ip + '/24',type:'bridge'});
  stage(u,'network');
 }
 function guest_dhcp(u) {
  if (find_section(u,'dhcp','dhcp',(s) => s.interface == 'guest_zone')) return false;
  let sec = u.add('dhcp','dhcp'); set_options(u,'dhcp',sec,{interface:'guest_zone',start:'100',limit:'150',leasetime:'1h'}); stage(u,'dhcp'); return true;
 }
 function guest_firewall(u) {
  let changed = false, sec = find_section(u,'firewall','zone',(s) => s.name == 'guest_zone');
  if (!sec) { sec = u.add('firewall','zone'); set_options(u,'firewall',sec,{name:'guest_zone',input:'REJECT',output:'ACCEPT',forward:'REJECT',network:'guest_zone'}); changed = true; }
  else { let nets = u.get('firewall',sec,'network') ?? []; if (type(nets) == 'string') nets = [nets]; if (index(nets,'guest_zone') < 0) {push(nets,'guest_zone'); u.set('firewall',sec,'network',nets); changed = true;} }
  for (let rule in [{name:'Allow-DHCP-Guest',src:'guest_zone',proto:'udp',dest_port:'67-68',target:'ACCEPT'},{name:'Allow-DNS-Guest',src:'guest_zone',proto:'tcp udp',dest_port:'53',target:'ACCEPT'}]) if (!find_section(u,'firewall','rule',(s) => s.name == rule.name)) {sec = u.add('firewall','rule'); set_options(u,'firewall',sec,rule); changed = true;}
  if (!find_section(u,'firewall','forwarding',(s) => s.src == 'guest_zone' && s.dest == 'wan')) { sec = u.add('firewall','forwarding'); set_options(u,'firewall',sec,{src:'guest_zone',dest:'wan'}); changed = true; }
  if (changed) stage(u,'firewall'); return changed;
 }
 methods.save_guest = (a) => {
  let p = (k,d) => param(a,k,d), band = p('band',''), rsec = p('radio_sec',''), sec = p('iface_sec',''), ssid = p('ssid',''), enc = p('enc','none'), key = p('key',''), ip = bare_ip(p('ipaddr','192.168.2.1'));
  if (!band || !rsec) return {success:false,message:'band and radio_sec are required'};
  if (!ssid) return {success:false,message:'SSID is required'};
  validate_ssid(ssid); validate_encryption(enc);
  let u = ctx.new_uci(), changes = [], net_changed = false;
  validate_radio(u,rsec,band);
  if (sec != '') validate_iface(u,sec,rsec,true);
  validate_key(enc,key != '' ? key : sec != '' ? str(u,'wireless',sec,'key') ?? '' : '');
  validate_guest_ip(u,p('ipaddr','192.168.2.1'));
  if (u.get('network','guest_zone') != null) require_section(u,'network','guest_zone','interface');
  if (u.get('network','guest_zone') == null) { guest_network(u,ip); net_changed = true; push(changes,'Guest network interface created (' + ip + '/24)'); }
  else if ((str(u,'network','guest_zone','ipaddr') ?? '') != ip + '/24') {u.set('network','guest_zone','ipaddr',ip + '/24'); stage(u,'network'); net_changed = true; push(changes,'Guest subnet updated to ' + ip + '/24');}
  if (guest_dhcp(u)) push(changes,'DHCP pool created for guest_zone');
  if (guest_firewall(u)) push(changes,'Firewall rules configured for guest_zone');
  let is_new = sec == '', wl_changed = is_new;
  if (is_new) { sec = free_section(u,'wireless','gst_' + slug(ssid,16)); u.set('wireless',sec,'wifi-iface'); set_options(u,'wireless',sec,{device:rsec,mode:'ap',network:'guest_zone'}); push(changes,'Guest SSID created on band ' + band); }
  function wl_set(field,val) { if ((str(u,'wireless',sec,field) ?? '') != val) {u.set('wireless',sec,field,val); wl_changed = true;} }
  function wl_del(field) { if (u.get('wireless',sec,field) != null) {u.delete('wireless',sec,field); wl_changed = true;} }
  wl_set('ssid',ssid); wl_set('encryption',enc);
  if (enc != 'none' && key != '') wl_set('key',key); else if (enc == 'none') wl_del('key');
  let roam = p('roam') == '1' ? '1' : '0';
  for (let field,val in {hidden:p('hidden') == '1' ? '1' : '0',disabled:p('disabled') == '1' ? '1' : '0',isolate:p('isolate') == '0' ? '0' : '1',ieee80211k:roam,bss_transition:roam}) wl_set(field,val);
  if (roam == '1') wl_set('time_advertisement','2'); else wl_del('time_advertisement');
  if (wl_changed) stage(u,'wireless');
  if (!net_changed && !wl_changed && !length(changes)) return {success:true,iface_sec:sec,is_new:false,message:'No changes.',changes:[]};
  return {success:true,iface_sec:sec,is_new,message:is_new ? 'Guest network enabled' : 'Guest settings saved',changes};
 };
 methods.fix_guest_dependencies = () => {
  let u = ctx.new_uci(), changes = [];
  if (u.get('network','guest_zone') == null) {let ip = free_subnet(u); if (!ip) die('No nonconflicting private guest subnet is available'); guest_network(u,ip); push(changes,'Created guest network interface (' + ip + ')');}
  else {require_section(u,'network','guest_zone','interface'); validate_guest_ip(u,str(u,'network','guest_zone','ipaddr') ?? ''); push(changes,'Ensured guest network interface is active');}
  if (guest_dhcp(u)) push(changes,'Configured DHCP for guest network');
  if (guest_firewall(u)) push(changes,'Configured firewall rules for guest network');
  return {success:true,changes};
 };
 methods.delete_guest_band = (a) => {
  let u = ctx.new_uci(), sec = param(a,'iface_sec',''); if (!sec) return {success:false,message:'iface_sec is required'};
  validate_iface(u,sec,param(a,'radio_sec',''),true);
  u.delete('wireless',sec); stage(u,'wireless'); let remaining = 0;
  u.foreach('wireless','wifi-iface',(s) => {if (s.network == 'guest_zone' && s.mode == 'ap') remaining++;});
  return {success:true,message:'Guest SSID removed',guest_ifaces_left:remaining};
 };
 function guest_active() {
  let st = call('network.interface.guest_zone','status',{}); if (st?.up) return true;
  let state = read('/sys/class/net/br-guest_zone/operstate'), address = read('/sys/class/net/br-guest_zone/address');
  if (index(['up','unknown'],state) >= 0 && address && address != '00:00:00:00:00:00') return true;
  return index(['up','unknown'],read('/sys/class/net/guest_zone/operstate')) >= 0;
 }
 methods.get_guest_config = () => {
  let u = ctx.new_uci(), raw = u.get('network','guest_zone','ipaddr'), out = {ipaddr:raw != null ? bare_ip(raw) : free_subnet(u),guest_zone_exists:raw != null,firewall_ok:!!find_section(u,'firewall','zone',(s) => s.name == 'guest_zone'),dhcp_ok:!!find_section(u,'dhcp','dhcp',(s) => s.interface == 'guest_zone'),interface_up:guest_active(),existing_subnets:{},bands:{},wpa3_supported:wpa3()};
  u.foreach('network','interface',(s) => {let p = prefix(s.ipaddr); if (p && s['.name'] != 'guest_zone') out.existing_subnets[p] = s['.name'];});
  let rs = radios(u);
  for (let b, ui in {'2g':'2g','5g':'5g','5g_2':'5gb','6g':'6g'}) if (rs[b]) {
   let rsec = rs[b].radio_sec, ifaces = [];
   u.foreach('wireless','wifi-iface',(s) => {
    if (s.device == rsec && s.mode == 'ap' && s.network == 'guest_zone') {
     let v = {iface_sec:s['.name'],network:s.network ?? 'guest_zone',ssid:s.ssid ?? '',enc:s.encryption ?? 'none',key:s.key ?? '',isolate:s.isolate ?? '1'};
     for (let k in ['hidden','disabled','bss_transition','ieee80211k']) v[k] = s[k] ?? '0'; push(ifaces,v);
    }
   });
   out.bands[ui] = {radio_sec:rsec,ifaces};
  }
  return out;
 };
 methods.status_guest = () => {
  let u = ctx.new_uci(), st = call('network.interface.guest_zone','status',{}), out = {active:guest_active(),clients_2g:0,clients_5g:0,clients_6g:0};
  let ip = st?.['ipv4-address']?.[0]?.address ?? read('/tmp/network/interface/guest_zone/ipaddr') ?? read('/tmp/network/interface/guest_zone/address'); if (ip != null) out.ipaddr = ip;
  u.foreach('wireless','wifi-iface',(s) => {
   if (s.network != 'guest_zone' || s.mode != 'ap') return;
   let cli = call('hostapd.' + (s.ifname ?? s['.name']),'get_clients',{}), band = lc(u.get('wireless',s.device ?? '', 'band') ?? '');
   if (type(cli?.clients) == 'object' && index(['2g','5g','6g'],band) >= 0) out['clients_' + band] += length(keys(cli.clients));
  });
  return out;
 };
 function shell_quote(s) { return "'" + replace('' + s,/'/g,"'\\''") + "'"; }
 function routes() {
  let gateways = {}, dev, gateway;
  for (let line in split(ctx.readfile('/proc/net/route') ?? '', '\n')) {
   let m = match(line,/^\s*(\S+)\s+(\S+)\s+(\S+)/); if (!m || m[2] != '00000000' || m[3] == '00000000' || !match(m[3],/^[A-Fa-f0-9]{8}$/)) continue;
   let hex = m[3], ip = join('.',map([6,4,2,0],(n) => int(substr(hex,n,2),16)));
   gateways[ip] = true; if (dev == null) {dev = m[1]; gateway = ip;}
  }
  return {gateways,dev,gateway};
 }
 function uplink(bridge_) {
  let gateways = routes().gateways, mac;
  for (let line in split(ctx.readfile('/proc/net/arp') ?? '', '\n')) {
   let m = match(line,/^\s*(\S+)\s+\S+\s+(\S+)\s+([A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2})/);
   if (m && gateways[m[1]] && int(m[2],16) != 0) {mac = lc(m[3]); break;}
  }
  if (!mac) return null;
  for (let line in split(ctx.exec('bridge fdb show br ' + shell_quote(bridge_)) ?? '', '\n')) {
   let m = match(line,/^([A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2}:[A-Fa-f0-9]{2})\s+dev\s+(\S+)/);
   if (m && lc(m[1]) == mac && ctx.stat('/sys/class/net/' + bridge_ + '/brif/' + m[2])) return m[2];
  }
  return null;
 }
 function wan_info(u) {
  let s = call('network.interface.wan','status',{}), out = {iface:'wan',l3_device:'',phys_device:'',proto:'',up:false};
  if (s?.proto == null) {
   let objects = ctx.objects ? ctx.objects() ?? [] : [], protos = ['pppoe','dhcp','static','pppoa','pptp','l2tp','wwan','qmi','mbim','dhcpv6'];
   for (let obj in objects) {
    let logical = match(obj,/^network\.interface\.(.+)$/)?.[1]; if (!logical || match(lc(logical),/^(loopback$|lan|br|wg)/)) continue;
    let st = call(obj,'status',{}), proto = type(st?.proto) == 'string' ? lc(st.proto) : '';
    if (index(protos,proto) >= 0 && (st.l3_device ?? st.device ?? '') != '' && (st.device ?? st.l3_device ?? '') != '') {s = st; out.iface = logical; break;}
   }
   if (s?.proto == null && routes().dev) for (let obj in objects) {
    let logical = match(obj,/^network\.interface\.(.+)$/)?.[1]; if (!logical) continue;
    let st = call(obj,'status',{}); if (st && (st.device == routes().dev || st.l3_device == routes().dev)) {s = st; out.iface = logical; break;}
   }
  }
  if (s) { out.status = s; out.proto = type(s.proto) == 'string' ? lc(s.proto) : ''; if (out.proto == 'dhcpv6') out.proto = 'dhcp'; out.up = s.up === true; out.l3_device = s.l3_device ?? s.device ?? ''; out.phys_device = s.device ?? s.l3_device ?? ''; }
  if (out.phys_device != '') {
   let dev = out.phys_device, bridge_;
   if (ctx.stat('/sys/class/net/' + dev + '/brport')) {let link = ctx.readlink('/sys/class/net/' + dev + '/brport/bridge'); bridge_ = link ? match(link,/([^/]+)$/)?.[1] : null;}
   else if (ctx.stat('/sys/class/net/' + dev + '/bridge')) bridge_ = dev;
   if (bridge_) out.phys_device = uplink(bridge_) ?? bridge_;
  }
  if (out.proto == '') {let proto = str(u,'network',out.iface,'proto'); if (proto != null) out.proto = lc(proto) == 'dhcpv6' ? 'dhcp' : lc(proto);}
  return out;
 }
 function find_wan(u) {
  let info = wan_info(u); if (info.iface && u.get('network',info.iface) != null) return info.iface;
  let found = 'wan'; u.foreach('network','interface',(s) => {let n = s['.name']; if (n == 'loopback' || n == 'lan') return; if (n == 'wan') {found = n; return false;} if (match(n,/^wan/)) found = n;}); return found;
 }
 function ipv6_on(raw) { return raw == null || raw == '1' || raw == 'auto'; }
 function wan_firewall(u, iface_, remove) {
  let sec = find_section(u,'firewall','zone',(s) => s.name == 'wan');
  if (!sec) { if (remove) return false; sec = u.add('firewall','zone'); set_options(u,'firewall',sec,{name:'wan',input:'REJECT',output:'ACCEPT',forward:'REJECT',masq:'1',mtu_fix:'1',network:iface_}); stage(u,'firewall'); return true; }
  let nets = u.get('firewall',sec,'network') ?? []; if (type(nets) == 'string') nets = [nets];
  let found = index(nets,iface_) >= 0;
  if (remove ? !found : found) return false;
  nets = remove ? filter(nets,(v) => v != iface_) : [...nets,iface_]; u.set('firewall',sec,'network',nets); stage(u,'firewall'); return true;
 }
 methods.save_wan = (a) => {
  let u = ctx.new_uci(), iface_ = find_wan(u), p = (k,d) => param(a,k,d), proto = p('proto','dhcp'), dev = p('device',''), old_dev = str(u,'network',iface_,'device') ?? '', password = p('password',''), mtu = match(p('mtu',''),/^\s*(\d*)\s*$/)?.[1] ?? '', peer = pbool(a,'peerdns'), ps = p('packet_steering','0');
  if (index(['dhcp','pppoe','static'],proto) < 0) return {success:false,message:'Unsupported WAN protocol'};
  validate_wan(u,iface_,a,proto);
  let dns = join(' ',filter(map(split(p('dns',''),','),(v) => trim(v)),(s) => s != ''));
  if (u.get('network',iface_) == null) u.set('network',iface_,'interface');
  u.set('network',iface_,'proto',proto); u.set('network',iface_,'peerdns',peer ? '1' : '0');
  if (mtu != '') u.set('network',iface_,'mtu',mtu); else u.delete('network',iface_,'mtu');
  let mac = p('mac',''); if (mac != '') u.set('network',iface_,'macaddr',mac); else u.delete('network',iface_,'macaddr');
  if (dev != '') u.set('network',iface_,'device',dev);
  for (let field in ['ipaddr','netmask','gateway','dns','username']) u.delete('network',iface_,field);
  if (password != '') u.set('network',iface_,'password',password); else if (proto != 'pppoe') u.delete('network',iface_,'password');
  if (proto == 'static') for (let field in ['ipaddr','netmask','gateway']) u.set('network',iface_,field,p(field,''));
  else if (proto == 'pppoe') u.set('network',iface_,'username',p('username',''));
  if (dns != '' && (proto == 'static' || (!peer && index(['pppoe','dhcp'],proto) >= 0))) u.set('network',iface_,'dns',dns);
  let action = 'noop';
  if (a.wan_ipv6 != null) {
   if (pbool(a,'wan_ipv6')) {
    u.delete('network',iface_,'ipv6');
    let w6proto = str(u,'network','wan6','proto'), w6dev = proto == 'pppoe' ? '@' + iface_ : dev != '' ? dev : old_dev;
    if (w6proto == null) { u.set('network','wan6','interface'); set_options(u,'network','wan6',{proto:'dhcpv6',reqprefix:'auto',delegate:'1'}); if (w6dev != '') u.set('network','wan6','device',w6dev); action = 'created'; }
    else if (w6proto == 'dhcpv6' && w6dev != '' && (str(u,'network','wan6','device') ?? '') != w6dev) {u.set('network','wan6','device',w6dev); action = 'updated';}
   } else {u.set('network',iface_,'ipv6','0'); if (str(u,'network','wan6','proto') == 'dhcpv6') {u.delete('network','wan6'); action = 'removed';}}
  }
  if (a.lan_ipv6 != null && u.get('network','lan') != null) {
   let on = pbool(a,'lan_ipv6'); u.set('network','lan','ipv6',on ? '1' : '0'); u.set('network','lan','delegate',on ? '1' : '0');
   if (on) {if (str(u,'network','lan','ip6assign') == null) u.set('network','lan','ip6assign','60');} else u.delete('network','lan','ip6assign');
  }
  if (ps != (str(u,'network','globals','packet_steering') ?? '0')) {if (u.get('network','globals') == null) u.set('network','globals','globals'); u.set('network','globals','packet_steering',ps);}
  let saved = stage(u,'network');
  if (saved) {wan_firewall(u,iface_,false); if (action == 'created') wan_firewall(u,'wan6',false); else if (action == 'removed') wan_firewall(u,'wan6',true);}
  // No live link/DNS mutations. Safe apply and confirmation own activation.
  return {success:saved,restarted:false,lan_restarted:false,message:saved ? 'WAN settings saved.' : 'Failed to save.'};
 };
 function detected_port(u, configured) {
  if (configured != null && configured != '') return configured;
  let phys = sort(filter(ctx.lsdir('/sys/class/net') ?? [],(dev) => !match(dev,/^(lo|br-|tun|tap|ppp|sit|gre|ip6|ifb|dummy|veth|bond|team|ovs-|wlan|phy)/) && !match(dev,/\.[0-9]+$/) && !!ctx.stat('/sys/class/net/' + dev + '/device'))), lan = {}, switches = [];
  if (!length(phys)) return '';
  u.foreach('network','interface',(s) => {
   if (s['.name'] != 'lan') return;
   let ports = s.ports ?? s.ifname ?? ''; for (let p in type(ports) == 'array' ? ports : words('' + ports)) lan[p] = true;
   let br = s.device ?? s.ifname ?? 'br-lan'; for (let p in ctx.lsdir('/sys/class/net/' + br + '/brif') ?? []) lan[p] = true;
  });
  u.foreach('network','switch_vlan',(s) => {
   let noncpu = [], cpu = false;
   for (let p in words(s.ports ?? '')) if (match(p,/[tu]$/)) cpu = true; else if (match(p,/^\d+$/)) push(noncpu,int(p));
   if (cpu && length(noncpu) == 1) push(switches,{vlan:s.vlan ?? s['.name'],sw:s.device ?? 'switch0',port:noncpu[0]});
  });
  let from_switch;
  if (length(switches) == 1) u.foreach('network','interface',(s) => {
   let dev = s.device ?? s.ifname ?? '';
   if (substr(dev,-length('' + switches[0].vlan)-1) == '.' + switches[0].vlan) {
    let parent = split(dev,'.')[0]; if (index(phys,parent) >= 0 && !lan[parent]) {from_switch = parent; return false;} if (index(phys,dev) >= 0 && !lan[dev]) {from_switch = dev; return false;}
   }
  });
  if (from_switch) return from_switch;
  let carrier, carrier_rx = -1, traffic, traffic_rx = 0;
  for (let dev in phys) if (!lan[dev]) {
   let rx = +read('/sys/class/net/' + dev + '/statistics/rx_bytes') || 0;
   if (read('/sys/class/net/' + dev + '/carrier') == '1' && rx > carrier_rx) {carrier = dev; carrier_rx = rx;}
   if (rx > traffic_rx) {traffic = dev; traffic_rx = rx;}
  }
  if (carrier) return carrier; if (traffic && traffic_rx > 0) return traffic;
  for (let pattern in [/^wan$/,/^wan/,/^eth0$/,/^eth/,/.*/]) for (let dev in phys) if (!lan[dev] && match(dev,pattern)) return dev;
  return phys[0] ?? '';
 }
 function wan_devices(info,iface_,configured) { return uniq(filter(['ppp0','pppoe-' + iface_,'ppp1',info.l3_device,info.phys_device,configured,iface_,'eth1','eth0.2','eth0'],(s) => s != null && s != '')); }
 function first_value(devs, field, fallback, mac) { for (let dev in devs) {let v = read('/sys/class/net/' + dev + '/' + field); if (v != null && v != '' && (!mac || v != '00:00:00:00:00:00')) return mac ? uc(v) : v;} return fallback; }
 methods.get_config = (a) => {
  let u = ctx.new_uci(), iface_ = find_wan(u), get = (k) => str(u,'network',iface_,k), proto = get('proto') ?? 'dhcp'; if (proto == 'dhcpv6') proto = 'dhcp';
  let info = wan_info(u), configured = get('device') ?? '', devs = wan_devices(info,iface_,configured), ip = '-', gateway = '-', live = call('network.interface.' + iface_,'status',{});
  if (live?.up === true) {ip = live['ipv4-address']?.[0]?.address ?? '-'; gateway = live.route?.[0]?.nexthop ?? '-';}
  if (ip == '-' && (ctx.bus_available === false || live?.up !== true)) ip = read('/tmp/network/interface/' + iface_ + '/ipaddr') ?? read('/tmp/network/interface/' + iface_ + '/address') ?? '-';
  if (gateway == '-') gateway = routes().gateway ?? '-';
  if (proto == 'static' && ctx.bus_available === false) {if (ip == '-' && (get('ipaddr') ?? '') != '') ip = get('ipaddr'); if (gateway == '-' && (get('gateway') ?? '') != '') gateway = get('gateway');}
  let out = {iface:iface_,proto,mtu:get('mtu') ?? '',dns:words(get('dns') ?? ''),peerdns:get('peerdns') != '0',device:configured != '' ? configured : info.phys_device,detected_wan:detected_port(u,configured),wan_configured:(get('proto') ?? '') != '' || info.l3_device != '' || info.phys_device != '',flow_offload:false,hw_flow_offload:false,packet_steering:'0',wan_ipv6:ipv6_on(get('ipv6')),lan_ipv6:ipv6_on(str(u,'network','lan','ipv6')),live_ip:ip,live_gw:gateway,live_mtu:first_value(devs,'mtu','',false),live_mac:first_value(devs,'address','-',true),mac:get('macaddr') ?? ''};
  for (let field in ['ipaddr','netmask','gateway','username','password']) out[field] = get(field) ?? '';
  u.foreach('firewall','defaults',(s) => {out.flow_offload = s.flow_offloading == '1' || s.flow_offloading === true; out.hw_flow_offload = s.flow_offloading_hw == '1' || s.flow_offloading_hw === true; return false;});
  let ps = u.get('network','globals','packet_steering'); if (ps == '1' || ps == '2') out.packet_steering = ps;
  if (param(a,'scope') != 'wan') {let wireless = wireless_config(true,true); for (let k,v in wireless) out[k] = v;}
  return out;
 };
 function wan_port(u,iface_,info) {
  let configured = str(u,'network',iface_,'device') ?? '';
  if (u.get('network',iface_,'proto') == null && info.l3_device == '' && info.phys_device == '') return 'not_configured';
  let devs = uniq(filter(['ppp0','pppoe-' + iface_,info.l3_device,info.phys_device,configured,iface_,'eth1','eth0.2','eth0'],(s) => s != null && s != ''));
  for (let dev in devs) {let c = read('/sys/class/net/' + dev + '/carrier'); if (c == '1') return 'connected'; if (c == '0') return 'disconnected';}
  for (let dev in devs) if (read('/sys/class/net/' + dev + '/operstate') == 'up') return 'connected';
  return 'disconnected';
 }
 function uptime(seconds) { if (seconds == null || seconds < 0) return '-'; let s = int(seconds); return s < 60 ? s + 's' : s < 3600 ? int(s / 60) + 'm' : s < 86400 ? int(s / 3600) + 'h' : int(s / 86400) + 'd'; }
 function auth_error() {
  for (let path in ['/tmp/ppp/connect-errors','/var/log/ppp/connect-errors','/tmp/pppoe.log']) {
   let data = lc(ctx.readfile(path) ?? ''); if (match(data,/authentication failed|access denied|login incorrect|pap authentication failed|chap authentication failed|lcp: timeout/)) return true;
  }
  let data = lc(ctx.readfile('/var/log/messages') ?? ctx.exec('logread') ?? ''); return !!match(data,/pap auth fail|chap auth fail|authentication failed|access denied/);
 }
 methods.status_wan = (a) => {
  let u = ctx.new_uci(), iface_ = find_wan(u), info = wan_info(u), get = (k) => str(u,'network',iface_,k), fast = pbool(a,'fast'), proto = get('proto') ?? 'dhcp'; if (proto == 'dhcpv6') proto = 'dhcp';
  if (u.get('network',iface_,'proto') == null && info.l3_device == '' && info.phys_device == '') return {proto:'',iface:iface_,ip:'-',gateway:'-',state:'down',rx:0,tx:0,dns:'-',mtu:'-',mac:'-',wan_port:'not_configured',internet:'offline',uptime:'-',peerdns:false,cfg_dns:[],internet_pending:false,internet_stale:false,internet_checked_at:0};
  if (info.proto != '') proto = info.proto;
  let devs = wan_devices(info,iface_,get('device') ?? ''), ip = 'N/A', gateway = 'N/A', state = 'down', v6ip = '-', v6gw = '-', live = info.status ?? call('network.interface.' + (info.iface != '' ? info.iface : iface_),'status',{}), available = ctx.bus_available !== false;
  function v6status(st) { if (st?.['ipv6-address']?.[0]) v6ip = st['ipv6-address'][0].address ?? '-'; for (let r in st?.route ?? []) if (index(['::','::/0'],r.target ?? '') >= 0 && r.nexthop != null && r.nexthop != '') {v6gw = r.nexthop; break;} }
  if (live) {
   if (live.up === true) state = 'up';
   ip = live['ipv4-address']?.[0]?.address ?? ip; gateway = live.route?.[0]?.nexthop ?? gateway;
   if (live.proto != null && live.proto != '') {proto = lc(live.proto); if (proto == 'dhcpv6') proto = 'dhcp';}
   v6status(live);
  }
  if (u.get('network','wan6') != null) {let w6 = call('network.interface.wan6','status',{}); if (w6?.up) {let address = w6['ipv6-address']?.[0]?.address; if (address != null && address != '') v6ip = address; for (let r in w6.route ?? []) if (index(['::','::/0'],r.target ?? '') >= 0 && r.nexthop != null && r.nexthop != '') {v6gw = r.nexthop; break;}}}
  if (ip == 'N/A' && (!available || live?.up !== true)) ip = read('/tmp/network/interface/' + iface_ + '/ipaddr') ?? read('/tmp/network/interface/' + iface_ + '/address') ?? ip;
  if (gateway == 'N/A') gateway = routes().gateway ?? gateway;
  if (state == 'down' && index(['N/A','','-'],ip) < 0 && !match(ip,/^127\.|^169\.254\./)) state = 'up';
  if (proto == 'static' && !available) {if (ip == 'N/A') ip = get('ipaddr') ?? 'N/A'; if (gateway == 'N/A') gateway = get('gateway') ?? 'N/A';}
  let rx = 0, tx = 0;
  if (!fast) {let ds = call('network.device','status',{name:info.phys_device != '' ? info.phys_device : info.l3_device ?? iface_}); rx = ds?.statistics?.rx_bytes ?? 0; tx = ds?.statistics?.tx_bytes ?? 0;}
  if (rx == 0) for (let dev in devs) {let v = read('/sys/class/net/' + dev + '/statistics/rx_bytes'); if (v != null && match(v,/^[+-]?[0-9]+$/)) {rx = +v; tx = +read('/sys/class/net/' + dev + '/statistics/tx_bytes') || 0; break;}}
  let dns4 = [], dns6 = [], seen = {};
  for (let path in ['/tmp/resolv.conf.d/resolv.conf.auto','/tmp/resolv.conf.auto','/tmp/resolv.conf','/etc/resolv.conf']) {
   for (let line in split(ctx.readfile(path) ?? '', '\n')) {
    let s = match(line,/^nameserver\s+(\S+)/)?.[1]; if (s && s != '127.0.0.1' && s != '::1' && !seen[s]) {seen[s] = true; let target = index(s,':') >= 0 ? dns6 : dns4; if (length(target) < 2) push(target,s);}
    if (length(dns4) >= 2 && length(dns6) >= 2) break;
   }
   if (length(dns4) && length(dns6)) break;
  }
  if (!length(dns4)) for (let d in words(get('dns') ?? '')) {if (!seen[d]) {seen[d] = true; push(dns4,d);} if (length(dns4) >= 2) break;}
  let port = wan_port(u,iface_,info), cached = ctx.connectivity(info.l3_device != '' ? info.l3_device : info.phys_device), internet = cached.internet ?? 'pending', pending = cached.internet_pending ?? cached.pending ?? internet == 'pending';
  let out = {proto,iface:iface_,ip,gateway,state,rx,tx,dns:join(',  ',dns4),mtu:first_value(devs,'mtu','-',false),mac:first_value(devs,'address','-',true),wan_port:port,internet,uptime:uptime(live?.uptime),peerdns:get('peerdns') != '0',cfg_dns:words(get('dns') ?? ''),ipv6_enabled:ipv6_on(get('ipv6')) || u.get('network','wan6') != null,ipv6_ip:v6ip,ipv6_gw:v6gw,ipv6_dns:join(',  ',dns6),internet_pending:pending,internet_stale:cached.internet_stale ?? cached.stale ?? false,internet_checked_at:cached.internet_checked_at ?? cached.checked_at ?? 0};
  if (internet == 'offline' && !pending && port != 'not_configured') {
   if (proto == 'pppoe') {let state = read('/sys/class/net/ppp0/operstate'); out.conn_error = auth_error() ? 'pppoe_auth' : state == null || state == 'down' || state == '' ? 'pppoe_link' : 'no_internet';}
   else if (proto == 'dhcp') out.conn_error = index(['N/A','','-'],ip) < 0 && !match(ip,/^169\.254\./) ? 'no_internet' : 'dhcp_timeout';
   else if (proto == 'static') out.conn_error = index(['N/A','','-'],ip) < 0 ? 'static_no_route' : 'no_internet';
   else out.conn_error = 'no_internet';
  }
  return out;
 };
 function capabilities(ws, rsec, high_band, gen) {
  let ifname = ws?.[rsec]?.interfaces?.[0]?.ifname ?? rsec, channels = [], htmodes = [], txpower_list = [], active, maximum = gen ?? '11n';
  let freqs = call('iwinfo','freqlist',{device:ifname});
  if (!(type(freqs?.results) == 'array' && length(freqs.results)) && ifname != rsec) freqs = call('iwinfo','freqlist',{device:rsec});
  for (let e in type(freqs?.results) == 'array' ? freqs.results : []) if (type(e.channel) in ['int','double'] && e.channel > 0 && e.restricted !== true && e.restricted !== 1) push(channels,{channel:e.channel,mhz:e.mhz ?? 0,dfs:e.dfs === true || e.dfs === 1 || e.radar === true || e.radar === 1});
  let info = call('iwinfo','info',{device:ifname}); if (!info && ifname != rsec) info = call('iwinfo','info',{device:rsec});
  if (info) {maximum = hwmax(info,gen); htmodes = type(info.htmodes) == 'array' ? map(info.htmodes,(h) => '' + h) : []; let ch = +info.channel; if (ch > 0) active = ch;}
  let power = call('iwinfo','txpowerlist',{device:ifname}); if (!power && ifname != rsec) power = call('iwinfo','txpowerlist',{device:rsec});
  for (let e in type(power?.results) == 'array' ? power.results : []) {let dbm = +e.dbm; if (e.dbm != null && dbm >= 0 && index(txpower_list,dbm) < 0) push(txpower_list,dbm);}
  sort(txpower_list,(a,b) => b - a);
  if (!length(channels)) {
   let fallback = high_band ? [36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,144,149,153,157,161,165] : [1,2,3,4,5,6,7,8,9,10,11,12,13];
   for (let ch in fallback) push(channels,{channel:ch,mhz:(high_band ? 5000 : 2407) + ch * 5,dfs:high_band && ch >= 52 && ch <= 144});
  }
  if (!length(htmodes)) htmodes = high_band ? ['HT20','HT40','VHT20','VHT40','VHT80'] : ['HT20','HT40'];
  if (!length(txpower_list)) txpower_list = high_band ? [30,27,25,23,20,17,14,10] : [20,17,15,14,12,10,7];
  let out = {channels,htmodes,txpower_list,hw_max:maximum}; if (active != null) out.active_channel = active; return out;
 }
 methods.get_channels = (a) => {
  let u = ctx.new_uci(), rsec = param(a,'radio','radio0'), high = false, gen = '11n';
  for (let b,r in radios(u)) if (r.radio_sec == rsec) {high = !!match(b,/^(5g|6g)($|_)/); gen = radio(u,rsec).wifi_gen; break;}
  return capabilities(call('network.wireless','status',{}),rsec,high,gen);
 };
 methods.get_radio_capabilities = () => {
  let u = ctx.new_uci(), out = {radios:{}}, ws = call('network.wireless','status',{});
  for (let b,r in radios(u)) out.radios[r.radio_sec] = capabilities(ws,r.radio_sec,!!match(b,/^(5g|6g)($|_)/),radio(u,r.radio_sec).wifi_gen);
  return out;
 };
 methods.status_wireless = () => {
  let u = ctx.new_uci(), rs = radios(u), mapping = {}, out = {};
  function init(b) {out['clients_' + b] = 0; out['signal_' + b] = 'N/A'; out['ssid_' + b] = ''; out['channel_' + b] = 'N/A'; out['wifi_gen_' + b] = ''; out['hw_max_' + b] = '';}
  for (let b,r in rs) {init(b); for (let sec in r.ifaces) mapping[sec] = b;}
  for (let obj in ctx.objects ? ctx.objects() ?? [] : []) {
   let name = match(obj,/^hostapd\.(.+)$/)?.[1]; if (!name) continue;
   let b = mapping[name], st = call(obj,'get_status',{});
   if (!b) {let mhz = +st?.freq || 0; if (mhz >= 2400 && mhz < 2500) b = '2g'; else if (mhz >= 5925 && mhz < 7125) b = '6g'; else if (mhz >= 5000 && mhz < 6000) b = '5g';}
   if (!b) continue;
   let cli = call(obj,'get_clients',{}), iw = call('iwinfo','info',{device:name});
   if (out['clients_' + b] == null) init(b);
   out['clients_' + b] += type(cli?.clients) == 'object' ? length(keys(cli.clients)) : 0;
   out['signal_' + b] = iw?.signal != null ? iw.signal + ' dBm' : 'N/A'; out['ssid_' + b] = st?.ssid ?? ''; out['channel_' + b] = '' + (st?.channel ?? 'N/A'); out['wifi_gen_' + b] = generation(st?.htmode ?? '') ?? '';
   let maximum = ''; for (let h in type(iw?.htmodes) == 'array' ? iw.htmodes : []) {h = uc('' + h); if (match(h,/^EHT/)) {maximum = '11be'; break;} if (match(h,/^HE/)) maximum = '11ax'; else if (maximum == '' && match(h,/^VHT/)) maximum = '11ac'; else if (maximum == '' && match(h,/^HT/)) maximum = '11n';}
   out['hw_max_' + b] = maximum;
  }
  return out;
 };
 methods.reconnect_wan = () => {let iface_ = find_wan(ctx.new_uci()); ctx.exec('ifdown ' + shell_quote(iface_) + ' && ifup ' + shell_quote(iface_) + ' 2>/dev/null &'); return {success:true,message:'WAN reconnecting...'};};
 // Validate the native worker boundary too: direct calls are not protected
 // by rpcd's signature type checks. Missing optional fields keep old defaults;
 // explicitly malformed values must never be coerced to a different setting.
 let string_args = {
  save_wan:'proto device mtu mac username password ipaddr netmask gateway dns packet_steering',
  save_wireless:'save_type band radio_sec iface_sec ssid enc key hidden iface_disabled dev_disabled roam isolate wnm channel htmode txpower country noscan',
  delete_iface:'iface_sec', save_offload:'', save_pkt_steering:'packet_steering',
  save_smart_ap:'old_ssid ssid enc key hidden disabled isolate roam wnm', delete_smart_ap:'ssid',
  save_guest:'band radio_sec iface_sec ssid enc key hidden disabled isolate roam wnm ipaddr',
  delete_guest_band:'iface_sec radio_sec', fix_guest_dependencies:'',
 };
 let bool_args = {save_wan:'peerdns wan_ipv6 lan_ipv6',save_offload:'flow_offload hw_flow_offload',save_smart_ap:'is_candidate'};
 for (let method, fields in string_args) {
  let name = method, handler = methods[method], strings = words(fields), bools = words(bool_args[method] ?? '');
  methods[method] = (args) => {
   if (type(args) != 'object') return {success:false,message:'Invalid mutation arguments'};
   for (let field, value in args) {
    if (index(strings,field) >= 0 && type(value) != 'string') return {success:false,message:'Invalid parameter type: ' + field};
    if (index(strings,field) >= 0 && (index(value,'\x00') >= 0 || match(value,/[[:cntrl:]]/))) return {success:false,message:'Invalid control character in ' + field};
    if (index(bools,field) >= 0 && type(value) != 'bool' && value !== '0' && value !== '1') return {success:false,message:'Invalid boolean parameter: ' + field};
    if (index(strings,field) >= 0 && index(['hidden','iface_disabled','dev_disabled','disabled','roam','isolate','wnm','noscan'],field) >= 0 && value != '0' && value != '1') return {success:false,message:'Invalid boolean parameter: ' + field};
    if (field == 'packet_steering' && index(['0','1','2'],value) < 0) return {success:false,message:'Invalid packet steering value'};
   }
   if ((name == 'save_guest' || name == 'save_smart_ap' || (name == 'save_wireless' && (args.save_type ?? 'iface') != 'radio')) && args.enc == null) return {success:false,message:'An explicit encryption mode is required'};
   return handler(args);
  };
 }
 methods._wan_info = () => wan_info(ctx.new_uci());
 return methods;
};
