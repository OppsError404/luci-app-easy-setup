var BASE        = window.location.pathname.replace(/\/+$/, "").replace(/\/smart_ap$/, "");
var wanProto    = "dhcp";
var _liveProto  = null;
var _activePage = "wan";
var _activeBand = "2g";
var _cfgLoaded  = false;


// -- Utility helpers ----------------------------------------------------------
function setVal(id, v)  { var e=document.getElementById(id); if(e) e.value=(v||""); }
function setChk(id, v)  { var e=document.getElementById(id); if(e) e.checked=!!v; }
function selVal(id, v)  {
  var e=document.getElementById(id); if(!e) return;
  for(var i=0;i<e.options.length;i++) if(e.options[i].value===v){e.selectedIndex=i;break;}
  if(e._cselSync) e._cselSync();
}
function setText(id, v) { var e=document.getElementById(id); if(e) e.textContent=(v||"-"); }
function getEl(id)      { return document.getElementById(id); }

// -- Eye toggle ---------------------------------------------------------------
function toggleEye(btn, id) {
  var el=document.getElementById(id);
  var showing=el.type==="password";
  el.type=showing?"text":"password";
  btn.classList.toggle("shown",showing);
  btn.setAttribute("aria-label",showing?"Hide password":"Show password");
}

// -- Password key visibility --------------------------------------------------
function toggleKey(wrapId, enc) {
  var el=document.getElementById(wrapId);
  if(el) el.style.display=(enc==="none"?"none":"");
}

function dimCard(id, dim) {
  var el=document.getElementById(id);
  if(el) el.classList.toggle("dim", dim);
}


// -- DNS list helpers ---------------------------------------------------------
// Structure per proto: #dns-block-{proto} contains
//   #dns-pri-{proto}  always-visible primary input
//   #dns-sec-{proto}  always-visible secondary input
//   #dns-extras-{proto}  collapsible extra entries
//   .dns-add-btn  append extra

function _getDnsList(proto) {
  var block = document.getElementById("dns-block-"+proto);
  if (!block) return [];
  return Array.from(block.querySelectorAll("input.dns-inp"))
    .map(function(i){ return i.value.trim(); })
    .filter(function(v){ return v !== ""; });
}

function _setDnsList(proto, arr) {
  var pri = document.getElementById("dns-pri-"+proto);
  var sec = document.getElementById("dns-sec-"+proto);
  var extras = document.getElementById("dns-extras-"+proto);
  if (pri) pri.value = (arr && arr[0]) || "";
  if (sec) sec.value = (arr && arr[1]) || "";
  if (extras) {
    extras.innerHTML = "";
    if (arr) arr.slice(2).forEach(function(v){ _dnsAppendExtra(proto, v); });
  }
}

function _dnsAppendExtra(proto, val) {
  var extras = document.getElementById("dns-extras-"+proto);
  if (!extras) return;
  var chip = document.createElement("span");
  chip.className = "dns-chip";
  var inp = document.createElement("input");
  inp.type="text"; inp.placeholder="extra DNS";
  inp.className="dns-inp"; inp.value=val||"";
  inp.oninput=function(){this.classList.remove("field-error");wanMarkDirty();};
  var rm = document.createElement("button");
  rm.type="button"; rm.className="dns-rm-btn";
  rm.title="Remove";
  rm.innerHTML='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  rm.onclick=function(){extras.removeChild(chip);var _extraCount=extras.querySelectorAll(".dns-chip").length;if(_extraCount>0){_wanDirty=true;var _sb=document.getElementById("wan-save-btn");if(_sb)_sb.disabled=false;}else{wanMarkDirty();}};
  chip.appendChild(inp); chip.appendChild(rm);
  extras.appendChild(chip);
}

function dnsAddEntry(proto) {
  _dnsAppendExtra(proto, "");
  // Force dirty even though the new chip is empty -- user explicitly added a DNS field
  _wanDirty = true;
  var saveAllBtn = document.getElementById("wan-save-btn");
  if (saveAllBtn) saveAllBtn.disabled = false;
}

// -- WAN proto tab builder ----------------------------------------------------
var PROTO_LABELS = {dhcp:"DHCP", static:"Static IP", pppoe:"PPPoE"};

function buildProtoTabs(currentProto) {
  var sel = document.getElementById("proto-select");
  if (!sel) return;
  // Update option labels to show which is current
  Array.from(sel.options).forEach(function(opt) {
    var label = PROTO_LABELS[opt.value] || opt.value.toUpperCase();
    opt.textContent = (opt.value === currentProto) ? label + " (Current)" : label;
  });
  sel.value = currentProto;
  // Rebuild list so option text (including "(Current)") updates in the dropdown list
  if (sel._cselRebuild) sel._cselRebuild(); else if (sel._cselSync) sel._cselSync();
}

// -- WAN dirty / snapshot tracking --------------------------------------------
var _wanSnapshot = {};
var _wanDirty = false;

function _getWanFields() {
  return {
    proto:   wanProto,
    mtu:     (document.getElementById("wan-mtu")||{}).value||"",
    mac:     (document.getElementById("wan-mac")||{}).value||"",
    ip:      (document.getElementById("s-ip")||{}).value||"",
    mask:    (document.getElementById("s-mask")||{}).value||"",
    gw:      (document.getElementById("s-gw")||{}).value||"",
    user:    (document.getElementById("ppp-user")||{}).value||"",
    pass:    (document.getElementById("ppp-pass")||{}).value||"",
    svc:     (document.getElementById("ppp-svc")||{}).value||"",
    peerDns:     !!(document.getElementById("peer-dns-tog")||{}).checked,
    pppoePeerDns:!!(document.getElementById("pppoe-peer-dns-tog")||{}).checked,
    dnsListDhcp: _getDnsList("dhcp").join(","),
    dnsListStatic:_getDnsList("static").join(","),
    dnsListPppoe:_getDnsList("pppoe").join(","),
    pktSteering: (document.getElementById("pkt-steer-sel")||{}).value||"0",
    wanIpv6: !!(document.getElementById("ipv6-wan-tog")||{}).checked,
    lanIpv6: !!(document.getElementById("ipv6-lan-tog")||{}).checked
  };
}

// Proto-only fields (excludes MTU/MAC/packet-steering)
function _getProtoFields() {
  return {
    proto:   wanProto,
    ip:      (document.getElementById("s-ip")||{}).value||"",
    mask:    (document.getElementById("s-mask")||{}).value||"",
    gw:      (document.getElementById("s-gw")||{}).value||"",
    user:    (document.getElementById("ppp-user")||{}).value||"",
    pass:    (document.getElementById("ppp-pass")||{}).value||"",
    svc:     (document.getElementById("ppp-svc")||{}).value||"",
    peerDns:     !!(document.getElementById("peer-dns-tog")||{}).checked,
    pppoePeerDns:!!(document.getElementById("pppoe-peer-dns-tog")||{}).checked,
    dnsListDhcp: _getDnsList("dhcp").join(","),
    dnsListStatic:_getDnsList("static").join(","),
    dnsListPppoe:_getDnsList("pppoe").join(",")
  };
}

var _protoSnapshot = {};

function protoSnapshotNow() {
  _protoSnapshot = _getProtoFields();
}

function _protoMatchesSnapshot() {
  var f = _getProtoFields();
  for (var k in _protoSnapshot) {
    if (f[k] !== _protoSnapshot[k]) return false;
  }
  return true;
}


function _wanMatchesSnapshot() {
  var f = _getWanFields();
  for (var k in _wanSnapshot) {
    if (f[k] !== _wanSnapshot[k]) return false;
  }
  return true;
}


function _wanProtoFieldChanged() {
  var s = _wanSnapshot;
  if (!s) return false;
  if (wanProto === "static") {
    return (document.getElementById("s-ip")||{}).value   !== (s.ip  ||"") ||
           (document.getElementById("s-mask")||{}).value !== (s.mask||"") ||
           (document.getElementById("s-gw")||{}).value   !== (s.gw  ||"");
  }
  if (wanProto === "pppoe") {
    return (document.getElementById("ppp-user")||{}).value !== (s.user||"") ||
           (document.getElementById("ppp-pass")||{}).value !== (s.pass||"") ||
           (document.getElementById("ppp-svc")||{}).value  !== (s.svc ||"");
  }
  return false;
}

function wanSnapshotNow() {
  _wanSnapshot = _getWanFields();
}

function wanMarkDirty() {
  if (_wanMatchesSnapshot()) { wanMarkClean(); return; }
  _wanDirty = true;
  var saveAllBtn = document.getElementById("wan-save-btn");
  if (saveAllBtn) saveAllBtn.disabled = false;

}

function wanMarkClean() {
  _wanDirty = false;
  var btn = document.getElementById("wan-save-btn");
  if (btn) btn.disabled = true;
}


// -- applyConfig: wire everything from the loaded config ----------------------
function applyConfig(cfg) {
  wanProto=cfg.proto||"dhcp";

  setVal("s-ip",    cfg.ipaddr);
  setVal("s-mask",  cfg.netmask);
  setVal("s-gw",    cfg.gateway);
  setVal("ppp-user",cfg.username);
  setVal("ppp-pass",cfg.password);
  setVal("wan-dns1",cfg.dns1);
  setVal("wan-dns2",cfg.dns2);
  window._wanUciMtu = cfg.mtu || "";
  setVal("wan-mtu", cfg.mtu||"");
  var _mtuEl = document.getElementById("wan-mtu");
  if (_mtuEl) {
    _mtuEl.placeholder = cfg.live_mtu ? cfg.live_mtu+" (negotiated)" : "Auto negotiated";
    _updateMtuHint();
  }
  
  // Store for async loadWanDevices to re-apply after list populates
  window._wanConfiguredDevice = cfg.device || "";
  window._wanDetectedPort     = cfg.detected_wan || "";

  // Set the WAN device/port -- use configured device, or auto-detect fallback
  var devSel = document.getElementById("device-select");
  if(devSel) {
    var targetDev = cfg.device || cfg.detected_wan || "";
    if(targetDev && devSel.querySelector("option[value='"+targetDev+"']")) {
      devSel.value = targetDev;
    } else if(targetDev) {
      // Device not yet in list -- add it so it can be selected
      var _opt = document.createElement("option");
      _opt.value = targetDev; _opt.textContent = targetDev;
      devSel.appendChild(_opt);
      devSel.value = targetDev;
      if(devSel._cselRebuild) devSel._cselRebuild();
    }
    if(devSel._cselSync) devSel._cselSync();
  }
  // Show/hide the "not configured" toggle and attention banner
  _updateWanPortVisibility(!!cfg.wan_configured);

  // Populate DNS fields per-protocol -- fully isolated, no cross-contamination.
  // Backend should return dhcp_peerdns/dhcp_dns, static_dns, pppoe_peerdns/pppoe_dns.
  // Falls back to global cfg.peerdns/cfg.dns only for the currently active protocol.
  var activeProto = wanProto;
  var globalPeer = (cfg.peerdns !== false);
  var globalDns  = cfg.dns || [];

  // -- DHCP --
  var dhcpPeer = (cfg.dhcp_peerdns !== undefined) ? !!cfg.dhcp_peerdns
               : (activeProto === "dhcp" ? globalPeer : true);
  var dhcpDns  = cfg.dhcp_dns  || (activeProto === "dhcp" && !dhcpPeer ? globalDns : []);
  setChk("peer-dns-tog", dhcpPeer);
  var manualDns=document.getElementById("dns-manual");
  if(manualDns) manualDns.style.display=dhcpPeer?"none":"block";
  _setDnsList("dhcp", dhcpPeer ? [] : dhcpDns);

  // -- Static --
  var staticDns = cfg.static_dns || (activeProto === "static" ? globalDns : []);
  _setDnsList("static", staticDns);

  // -- PPPoE --
  var pppoePeer = (cfg.pppoe_peerdns !== undefined) ? !!cfg.pppoe_peerdns
                : (activeProto === "pppoe" ? globalPeer : true);
  var pppoeDns  = cfg.pppoe_dns || (activeProto === "pppoe" && !pppoePeer ? globalDns : []);
  setChk("pppoe-peer-dns-tog", pppoePeer);
  var pppManual=document.getElementById("pppoe-dns-manual");
  if(pppManual) pppManual.style.display=pppoePeer?"none":"block";
  _setDnsList("pppoe", pppoePeer ? [] : pppoeDns);

  buildProtoTabs(wanProto);
  document.querySelectorAll(".proto-panel").forEach(function(el){el.classList.remove("active");});
  var panel=document.getElementById("pp-"+wanProto);
  if(panel) panel.classList.add("active");
  var _titleMap={dhcp:"DHCP Settings",static:"Static IP Settings",pppoe:"PPPoE Settings"};
  var _titleEl=document.getElementById("proto-settings-title");
  if(_titleEl) _titleEl.textContent=_titleMap[wanProto]||"Protocol Settings";

  var protoLabels={dhcp:"DHCP",static:"Static IP",pppoe:"PPPoE"};
  setText("w-proto",protoLabels[wanProto]||wanProto.toUpperCase());
  setText("cur-mac", cfg.live_mac||"-");
  setVal("wan-mac",  cfg.mac||"");  // cfg.mac is the UCI macaddr override, empty = not set
  _liveProto=wanProto;
  var conninfo=document.getElementById("conninfo-card");
  if(conninfo) conninfo.style.display="";

  if(cfg.live_ip&&cfg.live_ip!=="-") {
    setInfo("w-ip",cfg.live_ip);
    setInfo("w-gw",cfg.live_gw);
  }

  // Take snapshot of WAN fields for dirty tracking
  setTimeout(function(){ wanSnapshotNow(); protoSnapshotNow(); }, 0);
  // Apply offload toggles from config
  applyOffloadState(cfg.flow_offload, cfg.hw_flow_offload);
  // Apply packet steering state
  var psSel = document.getElementById("pkt-steer-sel");
  if(psSel) {
    var psVal = String(cfg.packet_steering || "0");
    psSel.value = (psVal === "1" || psVal === "2") ? psVal : "0";
    if(psSel._cselSync) psSel._cselSync();
  }
  var psBadge = document.getElementById("pkt-steer-badge");
  if(psBadge) {
    var psActive = (cfg.packet_steering == "1" || cfg.packet_steering == "2" ||
                    cfg.packet_steering === 1 || cfg.packet_steering === 2);
    psBadge.textContent = cfg.packet_steering == "2" ? "All CPUs" : "Active";
    psBadge.style.display = psActive ? "" : "none";
  }

  // IPv6 toggles
  setChk("ipv6-wan-tog", cfg.wan_ipv6 !== false);
  setChk("ipv6-lan-tog", cfg.lan_ipv6 !== false);
  _updateIpv6Badge("wan", cfg.wan_ipv6 !== false);
  _updateIpv6Badge("lan", cfg.lan_ipv6 !== false);
  _updateIpv6MismatchWarn();


  _cfgLoaded=true;
}

function loadConfig() {
  ajax("GET",BASE+"/get_config?scope=wan",null,function(cfg){
    if(cfg&&!cfg.error) applyConfig(cfg);
    else toast("err",(cfg&&cfg.error)?cfg.error:"Failed to load config");
  });
}

// -- Live status --------------------------------------------------------------
function setInfo(id, val, loading) {
  var e=document.getElementById(id); if(!e) return;
  if(loading){e.textContent="";e.className="conninfo-val loading";return;}
  var ok=(val&&val!=="N/A"&&val!==""&&val!=="-");
  e.textContent=ok?val:"-";
  e.className="conninfo-val"+(ok?"":" empty");
}

// Show a spinner on the IPv6 value fields while the address is being negotiated.
// `pending` = true -> spin + "Obtaining address…" on the status field; false -> clear.
function setIpv6Loading(pending) {
  var fields = ["w6-ip","w6-gw","w6-dns"];
  fields.forEach(function(id){
    var e=document.getElementById(id);
    if(!e) return;
    if(pending) {
      e.textContent="";
      e.className="conninfo-val loading ipv6-loading";
    } else {
      // Reset to an empty placeholder; the next setInfo() call fills the real value.
      var ok=e.textContent && e.textContent!=="N/A" && e.textContent!=="" && e.textContent!=="-";
      e.className="conninfo-val"+(ok?"":" empty");
    }
  });
  var st=document.getElementById("w6-state");
  if(st) {
    if(pending) {
      st.textContent="Obtaining address…";
      st.className="conninfo-val loading ipv6-loading";
    }
  }
}

function pollWan(fast) {
  return _wanPoll.refresh();
}
function _refreshWan() {
  // Local interface data stays fast while the backend checks internet separately.
  return ajax("GET",BASE+"/status_wan?fast=1",null,function(s){
    if(!s || s.error || s.success === false) return;
    var _notCfg = (s.wan_port==="not_configured");
    // Live show/hide WAN port selector based on current configured state
    _updateWanPortVisibility(!_notCfg);

    // -- Disconnected inline notice (inside Connection Type card) ---------
    var discNotice = document.getElementById("wan-disc-notice");
    if (discNotice) {
      var showDisc = !_notCfg && s.wan_port === "disconnected";
      discNotice.classList.toggle("show", showDisc);
    }

    var el=document.getElementById("w-state");
    if (el) {
        var isOnline=(s.internet==="online");
        var checking=(s.internet==="pending" || !s.internet);
        el.textContent=checking?"Checking…":isOnline?"Online":"Offline";
        el.classList.remove("online", "offline", "empty", "loading");
        el.classList.add(checking ? "loading" : isOnline ? "online" : "offline");
        el.title=(checking || s.internet_pending || s.internet_stale)?"Connectivity check pending; local WAN status is current.":"";
        if(s.internet_checked_at) el.title += " Last check: " + s.internet_checked_at;
    }
    var protoLabels={dhcp:"DHCP",static:"Static IP",pppoe:"PPPoE"};
    setText("w-proto",protoLabels[s.proto]||(s.proto||"").toUpperCase());
    _liveProto=s.proto;
    var conninfo=document.getElementById("conninfo-card");
    if(conninfo) conninfo.style.display=(wanProto===_liveProto)?"":"none";
    setInfo("w-ip",  s.ip);
    setInfo("w-gw",  s.gateway);
    setInfo("w-rx",  fmtB(s.rx));
    setInfo("w-tx",  fmtB(s.tx));
    // Active DNS: show configured override when peerdns=0, else live resolv dns
    if(s.peerdns===false && s.cfg_dns && s.cfg_dns.length>0) {
      setInfo("w-dns", s.cfg_dns.join(",  "));
    } else {
      setInfo("w-dns", s.dns);
    }
    setInfo("w-uptime", s.uptime);

    // -- IPv6 section ---------------------------------------------------
    var ipv6Section = document.getElementById("conninfo-ipv6");
    if (ipv6Section) {
      if (s.ipv6_enabled) {
        ipv6Section.style.display = "";
        var hasV6Ip = (s.ipv6_ip && s.ipv6_ip !== "-" && s.ipv6_ip !== "");
        // While IPv6 is enabled but no address is assigned yet (it lags IPv4 by
        // a few seconds), show a spinner so the fields don't look broken/empty.
        var v6Pending = !hasV6Ip && s.internet !== "offline" && s.wan_port !== "not_configured";
        setIpv6Loading(v6Pending);
        var stateEl = document.getElementById("w6-state");
        if (stateEl && !v6Pending) {
          stateEl.textContent = hasV6Ip ? "Connected" : "No IP Assigned";
          stateEl.className = "conninfo-val" + (hasV6Ip ? " online" : " empty");
        }
        if (!v6Pending) {
          setInfo("w6-ip",  hasV6Ip ? s.ipv6_ip  : "-");
          setInfo("w6-gw",  s.ipv6_gw);
          setInfo("w6-dns", s.ipv6_dns);
        }
      } else {
        ipv6Section.style.display = "none";
      }
    }

    var curMac=document.getElementById("cur-mac");
    // Keep placeholder updated with latest live-negotiated MTU
    var _mtuField = document.getElementById("wan-mtu");
    if (_mtuField && s.mtu && s.mtu!=="-" && !_mtuField.value) {
      _mtuField.placeholder = s.mtu+" (negotiated)";
    }
    if(curMac&&s.mac&&s.mac!=="-") curMac.textContent=s.mac;

    // -- Connection error banner -------------------------------------------
    _updateWanErrBanner(s);
  });
}
var _wanPoll = EasySetup.createPoll(function() {
  if (_activePage === "wan") return _refreshWan();
}, 6);
// The bounded internet probe has its own request and guard. Never await it
// in the local status path, including manual refreshes and post-save bursts.
var _connectivityPoll = EasySetup.createPoll(function() {
  if (_activePage === "wan") return ubusCall("probe_connectivity", {}).then(function() { return pollWan(true); });
}, 15);

// Error banner data per conn_error code
var _WAN_ERRORS = {
  pppoe_auth: {
    title: "PPPoE Authentication Failed",
    code:  "AUTH_REJECTED",
    msg:   "The PPPoE server rejected the supplied credentials. The session cannot be established.",
    hint:  "Verify the username and password with your ISP. Ensure there are no leading or trailing spaces. Some ISPs also require a specific Service Name -- leave it blank if unsure."
  },
  pppoe_link: {
    title: "PPPoE Session Could Not Be Established",
    code:  "SESSION_DOWN",
    msg:   "No active PPPoE session is present. The router could not negotiate a connection with the remote access concentrator (BRAS/DSLAM).",
    hint:  "Check that the physical WAN cable is securely connected. If the link is active, your ISP's concentrator may be temporarily unreachable -- wait a few minutes and retry."
  },
  dhcp_timeout: {
    title: "DHCP Lease Not Obtained",
    code:  "NO_LEASE",
    msg:   "The WAN interface sent DHCP discovery packets but did not receive an address offer from the upstream server.",
    hint:  "Confirm the WAN cable is connected and the upstream device (modem/ONT) is powered on. If the problem persists, try cloning your device's MAC address or contact your ISP."
  },
  static_no_route: {
    title: "Static IP -- Internet Unreachable",
    code:  "NO_ROUTE",
    msg:   "The WAN interface has been assigned the configured static IP, but internet connectivity cannot be confirmed. A routing or gateway issue is likely.",
    hint:  "Verify the gateway address, subnet mask, and that the gateway IP is reachable on the same subnet. Ensure the upstream modem is online and forwarding traffic correctly."
  },
  no_internet: {
    title: "Internet Access Unavailable",
    code:  "NO_INTERNET",
    msg:   "The WAN interface is up and has an IP address, but outbound internet connectivity cannot be confirmed. A DNS, routing, or ISP-side issue may be responsible.",
    hint:  "Check your ISP service status. If DNS is the issue, try overriding DNS to 8.8.8.8 in the settings below. You can also try Reconnect to force a new session."
  }
};

function _updateWanErrBanner(s) {
  var banner = document.getElementById("wan-err-banner");
  if (!banner) return;
  var errCode = s.conn_error || null;
  if (s.internet === "pending") {
    banner.classList.remove("show");
    return;
  }
  if ((s.internet === "pending" || s.internet_pending || s.internet_stale) &&
      (errCode === "no_internet" || errCode === "static_no_route")) {
    banner.classList.remove("show");
    return;
  }
  if (!errCode || s.internet === "online" || s.wan_port === "not_configured") {
    banner.classList.remove("show");
    return;
  }
  var def = _WAN_ERRORS[errCode] || _WAN_ERRORS["no_internet"];
  var titleEl = document.getElementById("wan-err-title-text");
  var codeEl  = document.getElementById("wan-err-code");
  var msgEl   = document.getElementById("wan-err-msg");
  var hintEl  = document.getElementById("wan-err-hint");
  if (titleEl) titleEl.textContent = def.title;
  if (codeEl)  codeEl.textContent  = def.code;
  if (msgEl)   msgEl.textContent   = def.msg;
  if (hintEl)  hintEl.textContent  = def.hint ? "Tip: " + def.hint : "";
  banner.classList.add("show");
}

function fmtB(b) {
  b=parseInt(b)||0;
  if(b>1073741824) return (b/1073741824).toFixed(2)+" GB";
  if(b>1048576)    return (b/1048576).toFixed(1)+" MB";
  if(b>1024)       return (b/1024).toFixed(0)+" KB";
  return b+" B";
}

// -- Navigation ---------------------------------------------------------------
// Wireless dropdown behaviour lives in the shared nav partial (easy_setup/_nav).

function showPage(id, tab) {
  document.querySelectorAll(".nc-nav-tab").forEach(function(t){t.classList.remove("active");});
  if (tab) tab.classList.add("active");
  _activePage = id;
  history.replaceState(null, "", "#" + id);
  if (id === "wan") pollWan(false);
}

function switchProto(p) {
  document.querySelectorAll(".proto-panel").forEach(function(el){el.classList.remove("active");});
  var panel=document.getElementById("pp-"+p); if(panel) panel.classList.add("active");
  var sel=document.getElementById("proto-select"); if(sel&&sel.value!==p){sel.value=p;if(sel._cselSync)sel._cselSync();}
  var titleMap={dhcp:"DHCP Settings",static:"Static IP Settings",pppoe:"PPPoE Settings"};
  var title=document.getElementById("proto-settings-title");
  if(title) title.textContent=titleMap[p]||"Protocol Settings";
  wanProto=p;
  protoSnapshotNow();  // baseline for new protocol so undo doesn't false-fire
  // Restore UCI MTU only when returning to the originally saved protocol
  // Clear it when switching to a different protocol (each negotiates its own MTU)
  var mtuEl = document.getElementById("wan-mtu");
  if (mtuEl) {
    mtuEl.value = (p === _liveProto && window._wanUciMtu) ? window._wanUciMtu : "";
    mtuEl.placeholder = "Auto negotiated";
    _updateMtuHint();
  }
  // MAC stays (user-configured, not protocol-dependent)
  // Protocol changed -- unlock save button so user can apply the new protocol
  wanMarkDirty();
  var conninfo=document.getElementById("conninfo-card");
  if(conninfo) conninfo.style.display=(_liveProto&&p===_liveProto)?"":"none";
}

function togglePeerDnsDisplay(usePeer) {
  var el = document.getElementById("dns-manual");
  if (el) el.style.display = usePeer ? "none" : "block";
  if (!usePeer) {
    var pri = document.getElementById("dns-pri-dhcp");
    var sec = document.getElementById("dns-sec-dhcp");
    var hasEntry = (pri && pri.value.trim() !== "") || (sec && sec.value.trim() !== "") ||
                   (document.getElementById("dns-extras-dhcp") &&
                    document.getElementById("dns-extras-dhcp").children.length > 0);
    if (!hasEntry) dnsAddEntry("dhcp");
  }
}
function togglePeerDns(usePeer) {
  togglePeerDnsDisplay(usePeer);
  wanMarkDirty();
}
function togglePppoePeerDnsDisplay(usePeer) {
  var el = document.getElementById("pppoe-dns-manual");
  if (el) el.style.display = usePeer ? "none" : "block";
  if (!usePeer) {
    var pri = document.getElementById("dns-pri-pppoe");
    var sec = document.getElementById("dns-sec-pppoe");
    var hasEntry = (pri && pri.value.trim() !== "") || (sec && sec.value.trim() !== "") ||
                   (document.getElementById("dns-extras-pppoe") &&
                    document.getElementById("dns-extras-pppoe").children.length > 0);
    if (!hasEntry) dnsAddEntry("pppoe");
  }
}
function togglePppoePeerDns(usePeer) {
  togglePppoePeerDnsDisplay(usePeer);
  wanMarkDirty();
}

// -- Save handlers -------------------------------------------------------------
function showSaving(type, text, sub) {
  var txt=document.getElementById("save-overlay-text");
  var sb =document.getElementById("save-overlay-sub");
  var box=document.getElementById("save-overlay-box");
  box.className="save-overlay-box"+(type==="wan"?" wan":"");
  txt.textContent=text||"Saving...";
  sb.textContent=sub||"Please wait, applying settings";
  document.getElementById("save-overlay").classList.add("show");
}
function hideSaving() {
  document.getElementById("save-overlay").classList.remove("show");
}

var _reconnectTimer = null;
function waitForLuciReconnect(onSuccess, onTimeout) {
  var attempts = 0;
  var maxAttempts = 40;
  var sub = document.getElementById("save-overlay-sub");
  function tick() {
    attempts++;
    if (attempts > maxAttempts) {
      if (onTimeout) onTimeout();
      return;
    }
    if (sub) sub.textContent = "Reconnecting to LuCI\u2026 (" + attempts + "/" + maxAttempts + ")";
    ubusCall("status_wan", { fast: true })
      .then(function(r) {
        if (r && typeof r === "object" && !r.error && r.success !== false) {
          if (onSuccess) onSuccess();
        } else {
          _reconnectTimer = setTimeout(tick, 1500);
        }
      })
      .catch(function() {
        _reconnectTimer = setTimeout(tick, 1500);
      });
  }
  _reconnectTimer = setTimeout(tick, 2500);
}
function cancelLuciReconnect() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
}

function _validateIp(val) {
  // Accept standard IPv4 dotted-decimal
  var parts = val.trim().split(".");
  if(parts.length !== 4) return false;
  for(var i=0;i<4;i++){
    var n=parseInt(parts[i],10);
    if(isNaN(n)||n<0||n>255||String(n)!==parts[i].trim()) return false;
  }
  return true;
}

function _validateMac(val) {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(val.trim());
}

function _setFieldError(el, msg) {
  if(!el) return;
  el.classList.add("field-error");
  var parent = el.parentNode;
  var existing=parent.querySelector(".field-error-msg");
  if(existing) existing.remove();
  var e=document.createElement("span");
  e.className="field-error-msg"; e.textContent=msg;
  e.style.display = "block";
  if (el.classList.contains("dns-inp")) {
    e.style.width = "0";
    e.style.whiteSpace = "nowrap";
    e.style.overflow = "visible";
    e.style.marginTop = "2px";
    e.style.lineHeight = "1";
    parent.appendChild(e);
  } else {
    el.insertAdjacentElement('afterend', e);
  }
  el.oninput=function(){this.classList.remove("field-error");var m=this.parentNode.querySelector(".field-error-msg");if(m)m.remove();wanMarkDirty();};
}

// Validate required fields per protocol, showing red errors like DNS does
// Show WAN port selector + banner only when not configured; hide when configured
function _updateWanPortVisibility(isConfigured) {
  var row   = document.getElementById("wan-port-row");
  var lbl   = document.getElementById("wan-port-label");
  var banner = document.getElementById("wan-not-cfg-banner");
  if(isConfigured) {
    if(row)    { row.style.display    = "none"; }
    if(lbl)    { lbl.style.display    = "none"; }
  } else {
    if(row)    { row.style.display    = "flex"; }
    if(lbl)    { lbl.style.display    = ""; }
    if(banner) { banner.style.display = "flex"; }
  }
}

function _validateWanRequired() {
  var valid = true;
  function reqField(id, msg) {
    var el = document.getElementById(id);
    if(!el) return;
    if(el.value.trim() === "") { _setFieldError(el, msg || "This field is required"); valid = false; }
    else { el.classList.remove("field-error"); var m=el.parentNode.querySelector(".field-error-msg"); if(m) m.remove(); }
  }
  function reqIp(id, msg) {
    var el = document.getElementById(id);
    if(!el) return;
    var v = el.value.trim();
    if(v === "") { _setFieldError(el, msg || "This field is required"); valid = false; }
    else if(!_validateIp(v)) { _setFieldError(el, "Enter a valid IPv4 address"); valid = false; }
    else { el.classList.remove("field-error"); var m=el.parentNode.querySelector(".field-error-msg"); if(m) m.remove(); }
  }
  // MTU: if set, must be a number between 576 and 9000
  var _mtuEl = document.getElementById("wan-mtu");
  if (_mtuEl && _mtuEl.value.trim() !== "") {
    var _mtuVal = parseInt(_mtuEl.value.trim(), 10);
    if (isNaN(_mtuVal) || _mtuVal < 576 || _mtuVal > 9000) {
      _setFieldError(_mtuEl, "MTU must be a number between 576 and 9000");
      valid = false;
    }
  }
  // MAC: if set, must be valid
  var _macEl = document.getElementById("wan-mac");
  if (_macEl && _macEl.value.trim() !== "") {
    if (!_validateMac(_macEl.value.trim())) {
      _setFieldError(_macEl, "Enter a valid MAC address (e.g. AA:BB:CC:DD:EE:FF)");
      valid = false;
    }
  }
  if(wanProto === "static") {
    reqIp("s-ip",   "IP address is required");
    reqIp("s-mask", "Subnet mask is required");
    reqIp("s-gw",   "Gateway is required");
  } else if(wanProto === "pppoe") {
    reqField("ppp-user", "Username is required");
    reqField("ppp-pass", "Password is required");
  }
  return valid;
}

// Configure WAN port immediately (called from the attention banner button)
function toggleOffloadDetail(type) {
  var detail  = document.getElementById("offload-"+type+"-detail");
  var chevron = document.getElementById("offload-"+type+"-chevron");
  if(!detail) return;
  var isOpen = detail.classList.toggle("open");
  if(chevron) {
    chevron.style.transform = isOpen ? "rotate(180deg)" : "";
    chevron.style.transition = "transform .15s";
  }
}

function toggleExtraOptions(sfx) {
  var detail  = document.getElementById("extra-opt-"+sfx);
  var chevron = document.getElementById("extra-opt-chevron-"+sfx);
  if (!detail) return;
  
  if (detail.classList.contains("open")) {
    detail.classList.remove("open");
    if (chevron) chevron.style.transform = "";
  } else {
    detail.classList.add("open");
    if (chevron) chevron.style.transform = "rotate(180deg)";
  }
}

function onOffloadChange(changedId) {
  var sw = document.getElementById("offload-sw-tog");
  var hw = document.getElementById("offload-hw-tog");
  // Mutually exclusive: enabling one auto-disables the other
  if(sw && hw) {
    if(changedId === "offload-sw-tog" && sw.checked) {
      hw.checked = false; // SW turned on -> auto-disable HW
    } else if(changedId === "offload-hw-tog" && hw.checked) {
      sw.checked = false; // HW turned on -> auto-disable SW
    }
  }
  saveOffload();
}

function saveOffload() {
  var sw = !!(document.getElementById("offload-sw-tog")||{}).checked;
  var hw = !!(document.getElementById("offload-hw-tog")||{}).checked;
  // Read previous badge state to detect what changed
  var oldSw = document.getElementById("offload-sw-badge") && document.getElementById("offload-sw-badge").style.display !== "none";
  var oldHw = document.getElementById("offload-hw-badge") && document.getElementById("offload-hw-badge").style.display !== "none";
  ajax("POST", BASE+"/save_offload",
    "flow_offload="+(sw?"1":"0")+"&hw_flow_offload="+(hw?"1":"0"),
    function(r) {
      if(r && r.success) {
        _updateOffloadBadge("sw", sw);
        _updateOffloadBadge("hw", hw);
        var changes = _buildOffloadChanges(oldSw, oldHw, sw, hw);
        toast("ok", "Offload settings saved", changes);
      } else {
        toast("err", (r&&r.message)||"Failed to save offload settings");
      }
    }
  );
}

function _updateOffloadBadge(type, enabled) {
  var badge = document.getElementById("offload-"+type+"-badge");
  if(!badge) return;
  if(enabled) {
    badge.textContent = "Active";
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}

function applyOffloadState(sw, hw) {
  var swTog = document.getElementById("offload-sw-tog");
  var hwTog = document.getElementById("offload-hw-tog");
  if(swTog) swTog.checked = !!sw;
  if(hwTog) hwTog.checked = !!hw;
  _updateOffloadBadge("sw", sw);
  _updateOffloadBadge("hw", hw);
}

function _updateIpv6Badge(type, enabled) {
  var badge = document.getElementById("ipv6-" + type + "-badge");
  if(!badge) return;
  if(enabled) {
    badge.textContent = "Active";
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}

function _updateIpv6MismatchWarn() {
  var wan = !!(document.getElementById("ipv6-wan-tog")||{}).checked;
  var lan = !!(document.getElementById("ipv6-lan-tog")||{}).checked;
  var warn = document.getElementById("ipv6-mismatch-warn");
  if(!warn) return;
  warn.style.display = (wan && !lan) ? "block" : "none";
}

function configureWanPort() {
  var devSel = document.getElementById("device-select");
  var port = devSel ? devSel.value : "";
  if(!port) {
    toast("err", "Please select a WAN port first");
    return;
  }
  showSaving("wan", "Configuring WAN port...", "Setting up " + port + " as WAN interface");
  // Send full current field state so Lua doesn't wipe anything unintentionally
  var d = "proto=" + encodeURIComponent(wanProto || "dhcp");
  d += "&device=" + encodeURIComponent(port);
  d += "&mtu="    + encodeURIComponent((document.getElementById("wan-mtu")||{}).value||"");
  d += "&mac="    + encodeURIComponent((document.getElementById("wan-mac")||{}).value||"");
  var _peerdns = wanProto==="pppoe"
    ? !!(document.getElementById("pppoe-peer-dns-tog")||{}).checked
    : !!(document.getElementById("peer-dns-tog")||{}).checked;
  d += "&peerdns=" + (_peerdns ? "1" : "0");
  d += "&packet_steering=" + encodeURIComponent((document.getElementById("pkt-steer-sel")||{}).value||"0");
  ajax("POST", BASE + "/save_wan", d, function(r) {
    hideSaving();
    if(r && r.success) {
      window._wanConfiguredDevice = port;
      _updateWanPortVisibility(true);
      wanSnapshotNow(); protoSnapshotNow(); wanMarkClean();
      window._wanUciMtu = (document.getElementById("wan-mtu")||{}).value || "";
      toast("ok", "WAN port configured: " + port);
    } else {
      toast("err", (r && r.message) || "Failed to configure WAN port");
    }
  });
}

function _validateWanDns() {
  var valid = true;
  function validateProto(proto, requirePrimary) {
    var pri = document.getElementById("dns-pri-"+proto);
    var block = document.getElementById("dns-block-"+proto);
    if (!block) return;
    // Primary
    if (pri) {
      var v = pri.value.trim();
      if (requirePrimary && !_validateIp(v)) { _setFieldError(pri,"Enter a valid IPv4 address"); valid=false; }
      else if (!requirePrimary && v!=="" && !_validateIp(v)) { _setFieldError(pri,"Enter a valid IPv4 address"); valid=false; }
    }
    // Secondary + extras: valid if non-empty
    Array.from(block.querySelectorAll("input.dns-inp")).slice(1).forEach(function(inp){
      var v=inp.value.trim();
      if(v!==""&&!_validateIp(v)){_setFieldError(inp,"Enter a valid IPv4 address or leave empty");valid=false;}
    });
  }
  if(wanProto==="dhcp") {
    if(!document.getElementById("peer-dns-tog").checked) validateProto("dhcp",true);
  } else if(wanProto==="pppoe") {
    if(!document.getElementById("pppoe-peer-dns-tog").checked) validateProto("pppoe",true);
  } else if(wanProto==="static") {
    validateProto("static",false);
  }
  return valid;
}

// _doSaveWan: executes the actual save after user confirms
// Accelerated polling burst after a save/reconnect: wan6 (dhcpv6) and the
// WAN interface take a few seconds to come up. Poll every 1.5s for ~12s so
// IPv6 details populate quickly instead of waiting on the 6s interval.
function _startPollBurst() {
  _wanPoll.burst(8, 1500);
  _connectivityPoll.refresh();
}

function _doSaveWan() {
  document.getElementById("save-confirm-overlay").classList.remove("show");
  if (!_pendingSavePayload) return;
  showSaving("wan", "Saving WAN settings...", "Applying protocol and advanced configuration");
  ajax("POST", BASE + "/save_wan", _pendingSavePayload, function(r) {
    // The shared save transport has already reconnected and confirmed.
    if (r && r.success) {
      hideSaving();
      wanSnapshotNow(); protoSnapshotNow(); wanMarkClean();
      if (r.device) {
        window._wanConfiguredDevice = r.device;
        _updateWanPortVisibility(true);
      }
      loadConfig();
      toast("ok", "WAN settings applied successfully");
      _startPollBurst();
    } else {
      hideSaving();
      toast("err", (r && r.message) || "Failed to save WAN settings");
    }
  });
}

function _showSaveConfirm(d) {
  var _mtu   = (document.getElementById("wan-mtu")||{}).value||"";
  var _mac   = (document.getElementById("wan-mac")||{}).value||"";
  // willRestart: only interface-level field changes need a restart
  var s = _wanSnapshot;
  var _eff_pass = (document.getElementById("ppp-pass")||{}).value||"";
  var _wanIpv6 = !!(document.getElementById("ipv6-wan-tog")||{}).checked;
  var _lanIpv6 = !!(document.getElementById("ipv6-lan-tog")||{}).checked;
  var willRestart = !!(
    wanProto !== (s.proto||"dhcp") ||
    _mtu !== (s.mtu||"") ||
    _mac !== (s.mac||"") ||
    (wanProto==="static" && (
      (document.getElementById("s-ip")||{}).value !== (s.ip||"") ||
      (document.getElementById("s-mask")||{}).value !== (s.mask||"") ||
      (document.getElementById("s-gw")||{}).value !== (s.gw||""))) ||
    (wanProto==="pppoe" && (
      (document.getElementById("ppp-user")||{}).value !== (s.user||"") ||
      (_eff_pass !== "" && _eff_pass !== (s.pass||"")))) ||
    _wanIpv6 !== (s.wanIpv6 !== false) ||
    _lanIpv6 !== (s.lanIpv6 !== false)
  );

  // Build change summary
  var changes = _buildWanChanges(s||{});
  if (changes.length === 0) { toast("ok", "No changes to save"); return; }

  // Populate and show confirmation popup
  _pendingSavePayload = d;
  var list = document.getElementById("save-confirm-changes");
  var warn = document.getElementById("save-confirm-warn");
  var warnText = document.getElementById("save-confirm-warn-text");
  list.innerHTML = changes.map(function(c) {
    return '<div class="save-confirm-change">' + c + '</div>';
  }).join("");
  var applyBtn = document.getElementById("save-confirm-apply-btn");
  if (willRestart) {
    warn.style.display = "flex";
    warnText.textContent = "This will briefly disconnect your internet while the interface restarts.";
    if (applyBtn) { applyBtn.classList.add("danger"); applyBtn.classList.remove("safe"); }
  } else {
    warn.style.display = "none";
    if (applyBtn) { applyBtn.classList.remove("danger"); applyBtn.classList.add("safe"); }
  }
  document.getElementById("save-confirm-overlay").classList.add("show");
}

function saveWan() {
  if (!_validateWanRequired()) return;
  if (!_validateWanDns()) return;

  var _dhcpPeer  = !!(document.getElementById("peer-dns-tog")||{}).checked;
  var _pppoePeer = !!(document.getElementById("pppoe-peer-dns-tog")||{}).checked;
  var _usePeer   = (wanProto==="pppoe") ? _pppoePeer : (wanProto==="dhcp" ? _dhcpPeer : true);
  var _ddns = _getDnsList("dhcp");
  var _sdns = _getDnsList("static");
  var _pdns = _getDnsList("pppoe");
  var _psVal = (document.getElementById("pkt-steer-sel")||{}).value||"0";
  var _mtu   = (document.getElementById("wan-mtu")||{}).value||"";
  var _mac   = (document.getElementById("wan-mac")||{}).value||"";
  var _dev   = (document.getElementById("device-select")||{}).value||"";
  var _wanIpv6 = !!(document.getElementById("ipv6-wan-tog")||{}).checked;
  var _lanIpv6 = !!(document.getElementById("ipv6-lan-tog")||{}).checked;

  var d = "proto=" + encodeURIComponent(wanProto);
  d += "&mtu="    + encodeURIComponent(_mtu);
  d += "&mac="    + encodeURIComponent(_mac);
  if (_dev) d += "&device=" + encodeURIComponent(_dev);
  d += "&packet_steering=" + encodeURIComponent(_psVal);
  d += "&wan_ipv6=" + (_wanIpv6 ? "1" : "0");
  d += "&lan_ipv6=" + (_lanIpv6 ? "1" : "0");
  d += "&peerdns="       + (_usePeer   ? "1" : "0");
  if (wanProto === "static") {
    d += "&ipaddr="  + encodeURIComponent(document.getElementById("s-ip").value);
    d += "&netmask=" + encodeURIComponent(document.getElementById("s-mask").value);
    d += "&gateway=" + encodeURIComponent(document.getElementById("s-gw").value);
    if (_sdns.length) d += "&dns=" + encodeURIComponent(_sdns.join(","));
  } else if (wanProto === "pppoe") {
    d += "&username=" + encodeURIComponent(document.getElementById("ppp-user").value);
    var _pass = (document.getElementById("ppp-pass")||{}).value||"";
    if (_pass) d += "&password=" + encodeURIComponent(_pass);
    if (!_pppoePeer && _pdns.length) d += "&dns=" + encodeURIComponent(_pdns.join(","));
  } else if (wanProto === "dhcp") {
    if (!_dhcpPeer && _ddns.length) d += "&dns=" + encodeURIComponent(_ddns.join(","));
  }

  _showSaveConfirm(d);
}


function reconnectWan() {
  document.getElementById("reconnect-overlay").classList.add("show");
}
function _doReconnectWan() {
  document.getElementById("reconnect-overlay").classList.remove("show");
  ajax("GET", BASE+"/reconnect_wan", null, function(r){
    toast(r&&r.success ? "ok" : "err", (r&&r.message) || "Reconnecting WAN...");
    if (r && r.success) _startPollBurst();
  });
}

// -- AJAX + Toast --------------------------------------------------------------

function ajax(method, url, body, cb) {
  return EasySetup.ajax(method, url, body, cb);
}

var _bannerTimer = null;
function toast(type, msg, lines) {
  var overlay  = document.getElementById("toast-overlay");
  var iconWrap = document.getElementById("toast-overlay-icon");
  var svg      = document.getElementById("toast-overlay-svg");
  var textEl   = document.getElementById("toast-overlay-text");
  var listEl   = document.getElementById("toast-overlay-changes");
  if(!overlay) return;
  if(_bannerTimer) { clearTimeout(_bannerTimer); _bannerTimer = null; }
  textEl.textContent = msg || (type === "ok" ? "Done" : "An error occurred");
  iconWrap.className = "toast-overlay-icon " + type;
  svg.innerHTML = type === "ok"
    ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>'
    : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  svg.style.stroke = type === "ok" ? "#43e895" : "#e05a52";
  // Build change lines list
  listEl.innerHTML = "";
  if(lines && lines.length) {
    lines.forEach(function(line) {
      var li = document.createElement("li");
      li.textContent = line;
      if(type === "err") li.className = "err-line";
      listEl.appendChild(li);
    });
    listEl.style.display = "";
  } else {
    listEl.style.display = "none";
  }
  overlay.classList.add("show");
  var delay = lines && lines.length ? Math.min(3000 + lines.length * 600, 7000) : 3000;
  _bannerTimer = setTimeout(function(){ dismissBanner(); }, delay);
}
function dismissBanner() {
  var overlay = document.getElementById("toast-overlay");
  if(overlay) overlay.classList.remove("show");
  if(_bannerTimer) { clearTimeout(_bannerTimer); _bannerTimer = null; }
}

// -- Change detection helpers -------------------------------------------------

function _buildWanChanges(snap) {
  var lines = [];
  var proto = wanProto;
  var protoLabels = {dhcp:"DHCP", static:"Static IP", pppoe:"PPPoE"};
  if(snap.proto !== proto) lines.push("Protocol changed to " + (protoLabels[proto] || proto.toUpperCase()));
  var newMtu = (document.getElementById("wan-mtu")||{}).value || "";
  if(snap.mtu !== newMtu) {
    var mtuLabel = function(v){ return v ? v+" bytes" : "Auto"; };
    lines.push("MTU: " + mtuLabel(snap.mtu) + " -> " + mtuLabel(newMtu));
  }
  var newMac = (document.getElementById("wan-mac")||{}).value || "";
  if((snap.mac||"") !== newMac) {
    if(newMac) lines.push("MAC override set to " + newMac);
    else lines.push("MAC override cleared");
  }
  if(proto === "static") {
    var newIp   = (document.getElementById("s-ip")||{}).value||"";
    var newMask = (document.getElementById("s-mask")||{}).value||"";
    var newGw   = (document.getElementById("s-gw")||{}).value||"";
    if(snap.ip !== newIp)     lines.push("IP address set to " + newIp);
    if(snap.mask !== newMask) lines.push("Subnet mask set to " + newMask);
    if(snap.gw !== newGw)     lines.push("Gateway set to " + newGw);
  }
  if(proto === "pppoe") {
    var newUser = (document.getElementById("ppp-user")||{}).value||"";
    if(snap.user !== newUser) lines.push("PPPoE username updated");
    if(snap.pass !== ((document.getElementById("ppp-pass")||{}).value||"")) lines.push("PPPoE password updated");
  }
  // DNS changes
  var dhcpPeer  = !!(document.getElementById("peer-dns-tog")||{}).checked;
  var pppoePeer = !!(document.getElementById("pppoe-peer-dns-tog")||{}).checked;
  var activePeer = proto==="pppoe" ? pppoePeer : dhcpPeer;
  var snapPeer = proto==="pppoe" ? snap.pppoePeerDns : snap.peerDns;
  if(snapPeer !== activePeer) {
    lines.push("DNS override " + (activePeer ? "disabled (use peer DNS)" : "enabled (manual DNS)"));
  }
  // DNS server list -- compare all protos so changes are never missed
  var dnsKey = proto==="pppoe"?"pppoe":proto==="static"?"static":"dhcp";
  var snapKey = "dnsList" + dnsKey.charAt(0).toUpperCase() + dnsKey.slice(1);
  var snapDnsStr = snap[snapKey] || "";
  var oldDns = snapDnsStr ? snapDnsStr.split(",").filter(Boolean) : [];
  var newDns = _getDnsList(dnsKey);
  var newDnsFiltered = newDns.filter(function(v){ return v !== ""; });
  newDnsFiltered.forEach(function(ip) { if(oldDns.indexOf(ip)===-1) lines.push("DNS server added: " + ip); });
  oldDns.forEach(function(ip) { if(ip && newDnsFiltered.indexOf(ip)===-1) lines.push("DNS server removed: " + ip); });
  // Packet steering
  var psLabels = {"0":"Disabled","1":"Enabled","2":"Enabled (all CPUs)"};
  var newPs = (document.getElementById("pkt-steer-sel")||{}).value||"0";
  var oldPs = snap.pktSteering||"0";
  if(oldPs !== newPs) lines.push("Packet Steering -> " + (psLabels[newPs]||newPs));
  // IPv6
  var newWanIpv6 = !!(document.getElementById("ipv6-wan-tog")||{}).checked;
  var newLanIpv6 = !!(document.getElementById("ipv6-lan-tog")||{}).checked;
  if(newWanIpv6 !== (snap.wanIpv6 !== false)) lines.push("WAN IPv6 " + (newWanIpv6 ? "enabled" : "disabled"));
  if(newLanIpv6 !== (snap.lanIpv6 !== false)) lines.push("LAN IPv6 " + (newLanIpv6 ? "enabled" : "disabled"));
  return lines;
}

function _buildOffloadChanges(oldSw, oldHw, newSw, newHw) {
  var lines = [];
  if(oldSw !== newSw) lines.push("Software Flow Offloading " + (newSw ? "enabled" : "disabled"));
  if(oldHw !== newHw) lines.push("Hardware Flow Offloading " + (newHw ? "enabled" : "disabled"));
  return lines;
}


// -- Theme ---------------------------------------------------------------------
(function initTheme() {
  var wrap=document.querySelector(".nc-wrap");
  function apply(isLight){if(wrap) wrap.classList.toggle("theme-light",isLight);}
  var mq=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");
  apply(mq?!mq.matches:false);
  if(mq&&mq.addEventListener) mq.addEventListener("change",function(e){apply(!e.matches);});
})();

// -- Custom select engine ------------------------------------------------------
// Lists are appended to <body> as position:fixed so they always float above
// every card, nav-bar, and overflow context -- no clipping, no z-index fights.
var _openCsel = null;

document.addEventListener("click", function(e){
  if(!_openCsel) return;
  var list = document.getElementById(_openCsel.listId);
  if(list && list.contains(e.target)) return;
  if(_openCsel.trigger.contains(e.target)) return;
  cselCloseAll();
});
document.addEventListener("touchend", function(e){
  if(!_openCsel) return;
  var list = document.getElementById(_openCsel.listId);
  if(list && list.contains(e.target)) return;
  if(_openCsel.trigger.contains(e.target)) return;
  cselCloseAll();
}, true);

function cselCloseAll() {
  if(!_openCsel) return;
  _openCsel.trigger.classList.remove("open");
  var list = document.getElementById(_openCsel.listId);
  if(list){
    list.classList.remove("open","flip-up");
    var sb=list.querySelector(".csel-search");
    if(sb){sb.value="";sb.dispatchEvent(new Event("input"));}
  }
  _openCsel=null;
}

function _cselPosition(trigger, list) {
  var rect = trigger.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;

  // Measure the actual LuCI navbar height at runtime -- it's the first fixed/sticky
  // element above our page, or fall back to 52px.
  var navbarEl = document.querySelector(".luci-navbar, #navbar, nav.navbar, header.navbar, .cbi-map > .cbi-section:first-child");
  var NAVBAR_BOTTOM = navbarEl ? navbarEl.getBoundingClientRect().bottom : 52;
  // Never open above this line
  var TOP_CLEARANCE = Math.max(NAVBAR_BOTTOM + 4, 56);

  var listMinW = list.dataset.minw ? parseInt(list.dataset.minw) : 160;
  var listW = Math.max(rect.width, listMinW);
  var left = rect.left;
  if(left + listW > vw - 8) left = vw - listW - 8;
  if(left < 8) left = 8;
  list.style.width  = listW + "px";
  list.style.left   = left + "px";
  list.style.top    = "";
  list.style.bottom = "";
  list.classList.remove("flip-up");

  var isCountry = list.dataset.country === "1";
  var spaceBelow = vh - rect.bottom - 8;
  var spaceAbove = rect.top - TOP_CLEARANCE;
  var maxH = isCountry ? 300 : 220;

  if(spaceBelow >= 80 || spaceBelow >= spaceAbove) {
    // Open downward (preferred)
    list.style.top    = (rect.bottom + 4) + "px";
    list.style.bottom = "";
    list.style.maxHeight = Math.min(maxH, spaceBelow) + "px";
  } else {
    // Flip upward -- anchor the bottom of the list to the top of the trigger
    list.classList.add("flip-up");
    var allowedUp = Math.min(maxH, spaceAbove);
    var listBottom = vh - rect.top + 4;  // distance from viewport bottom to trigger top
    var listTop = rect.top - 4 - allowedUp;
    if(listTop < TOP_CLEARANCE) {
      // Not enough room above navbar -- force downward anyway
      list.classList.remove("flip-up");
      list.style.top    = (rect.bottom + 4) + "px";
      list.style.bottom = "";
      list.style.maxHeight = Math.min(maxH, spaceBelow) + "px";
    } else {
      list.style.top    = "";
      list.style.bottom = listBottom + "px";
      list.style.maxHeight = allowedUp + "px";
    }
  }
}

var _cselOpenedAt = 0;
var _isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
window.addEventListener("scroll", function(e){
  if(!_openCsel) return;
  var list = document.getElementById(_openCsel.listId);
  if(list && list.contains(e.target)) return;
  if(list && list.dataset.country === "1") {
    // On touch devices the keyboard appearing causes a scroll -- reposition,
    // but only if the visual viewport size hasn't changed (i.e. not keyboard open)
    _cselPosition(_openCsel.trigger, list);
    return;
  }
  cselCloseAll();
}, true);
window.addEventListener("resize", function(){
  if(!_openCsel) return;
  var list = document.getElementById(_openCsel.listId);
  if(!list) return;
  _cselPosition(_openCsel.trigger, list);
});
// On mobile, use visualViewport resize (keyboard open/close) to close country dropdown
// only if the trigger has scrolled out of view -- otherwise just reposition
if(window.visualViewport) {
  window.visualViewport.addEventListener("resize", function(){
    if(!_openCsel) return;
    var list = document.getElementById(_openCsel.listId);
    if(!list) return;
    _cselPosition(_openCsel.trigger, list);
  });
  window.visualViewport.addEventListener("scroll", function(){
    if(!_openCsel) return;
    var list = document.getElementById(_openCsel.listId);
    if(!list) return;
    _cselPosition(_openCsel.trigger, list);
  });
}

var CHEVRON='<svg class="csel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

function upgradeSelects(root) {
  var selects=(root||document).querySelectorAll(".nf select:not([data-csu])");
  selects.forEach(function(sel){
    sel.setAttribute("data-csu","1");
    var nf = sel.closest('.nf');
    if (nf) nf.classList.add('nf-has-select');
    sel.style.display="none";

    var wrap=document.createElement("div");
    wrap.className="csel-wrap";
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    var trigger=document.createElement("div");
    trigger.className="csel";
    trigger.innerHTML='<span class="csel-val"></span>'+CHEVRON;
    wrap.appendChild(trigger);

    // List lives on <body> with position:fixed -- escapes all stacking contexts
    var listId="csel-"+Math.random().toString(36).slice(2,9);
    var list=document.createElement("div");
    list.className="csel-list";
    if (sel.closest(".ssid-card")) list.classList.add("csel-blue");
    list.id=listId;
    list.style.position="fixed";
    list.style.zIndex="99";
    var isCountry = sel.id && sel.id.indexOf("country")!==-1;
    if(isCountry) list.dataset.country="1";
    var isPktSteer = sel.id === "pkt-steer-sel";
    if(isPktSteer) list.dataset.minw="180";
    document.body.appendChild(list);

    function _renderOpts(filter) {
      Array.from(list.querySelectorAll(".csel-opt,.csel-no-results")).forEach(function(e){e.remove();});
      var q=(filter||"").toLowerCase().trim();
      var shown=0;
      Array.from(sel.options).forEach(function(opt){
        if(q && opt.textContent.toLowerCase().indexOf(q)===-1 && opt.value.toLowerCase().indexOf(q)===-1) return;
        var d=document.createElement("div");
        d.className="csel-opt"; d.dataset.val=opt.value; d.textContent=opt.textContent;
        if(opt.selected) d.classList.add("selected");
        d.addEventListener("click",function(e){
          e.stopPropagation();
          sel.value=opt.value;
          sel.dispatchEvent(new Event("change",{bubbles:true}));
          syncDisplay(); cselCloseAll();
        });
        list.appendChild(d); shown++;
      });
      if(!shown){
        var nr=document.createElement("div"); nr.className="csel-no-results"; nr.textContent="No results"; list.appendChild(nr);
      }
    }

    function buildList() {
      list.innerHTML="";
      if(isCountry){
        var sb=document.createElement("input");
        sb.type="text"; sb.className="csel-search"; sb.placeholder="Search country...";
        sb.addEventListener("click",function(e){e.stopPropagation();});
        sb.addEventListener("touchstart",function(e){e.stopPropagation();},{passive:true});
        sb.addEventListener("touchend",function(e){e.stopPropagation();},{passive:true});
        sb.addEventListener("input",function(){_renderOpts(this.value);});
        sb.addEventListener("keydown",function(e){
          if(e.key==="Enter"){var f=list.querySelector(".csel-opt");if(f)f.click();}
          if(e.key==="Escape") cselCloseAll();
        });
        list.appendChild(sb);
      }
      _renderOpts("");
    }

    function syncDisplay(){
      var opt=sel.options[sel.selectedIndex];
      var sp=trigger.querySelector(".csel-val");
      if(sp) sp.textContent=opt?opt.textContent:"";
      list.querySelectorAll(".csel-opt").forEach(function(o){
        o.classList.toggle("selected", o.dataset.val===sel.value);
      });
    }

    buildList(); syncDisplay();

    sel._cselSync    = syncDisplay;
    sel._cselRebuild = function(){ buildList(); syncDisplay(); };

    trigger.addEventListener("click",function(e){
      e.stopPropagation();
      if(_openCsel && _openCsel.trigger!==trigger) cselCloseAll();
      if(list.classList.contains("open")){ cselCloseAll(); return; }

      // Inherit theme
      var wrap2=document.querySelector(".nc-wrap");
      var isLight=wrap2&&wrap2.classList.contains("theme-light");
      list.classList.toggle("theme-light",!!isLight);

      _cselPosition(trigger, list);
      trigger.classList.add("open");
      list.classList.add("open");
      _openCsel={trigger:trigger, listId:listId};

      var sel2=list.querySelector(".csel-opt.selected");
      if(sel2) setTimeout(function(){sel2.scrollIntoView({block:"nearest"});},0);
    });
  });
}


// Upgrade static selects (WAN page) -- must run before loadConfig/applyConfig
// Show override hint when user types a value in the MTU field
function _updateMtuHint() {
  var el = document.getElementById("wan-mtu");
  if (!el) return;
  var hint = el.closest(".nf") && el.closest(".nf").querySelector(".mtu-override-hint");
  if (!hint) return;
  var val = el.value.trim();
  // Extract live negotiated value from placeholder (e.g. "1480 (negotiated)" -> "1480")
  var live = (el.placeholder || "").replace(/\s*\(negotiated\).*/, "").replace("Auto negotiated", "").trim();
  if (val) {
    hint.textContent = live
      ? "Overriding negotiated MTU of " + live + " bytes"
      : "Overriding negotiated MTU";
    hint.style.display = "";
  } else {
    hint.style.display = "none";
  }
}

upgradeSelects(document.getElementById("page-wan"));

// Bind packet steering change to wanMarkDirty -- saved via Save & Apply
(function() {
  var psSel = document.getElementById("pkt-steer-sel");
  if(psSel) psSel.addEventListener("change", wanMarkDirty);
})();

// Load available WAN devices
function loadWanDevices() {
  var sel = document.getElementById("device-select");
  if(!sel) {
    console.warn("device-select element not found");
    return;
  }
  
  ubusCall("get_wan_devices", {})
    .then(function(d){
      console.log("Got devices:", d);
      if(d.success && d.devices && d.devices.length > 0) {
        var curVal = sel.value;
        d.devices.forEach(function(dev) {
          if(dev && !sel.querySelector("option[value='"+dev+"']")) {
            var opt = document.createElement("option");
            opt.value = dev;
            opt.textContent = dev;
            sel.appendChild(opt);
          }
        });
        // Re-apply selected value: prefer configured device, then detected_wan
        var preferDev = (window._wanConfiguredDevice || window._wanDetectedPort || curVal || "");
        if(preferDev && sel.querySelector("option[value='"+preferDev+"']")) {
          sel.value = preferDev;
        } else if(curVal) {
          sel.value = curVal;
        }
        // Rebuild the custom csel widget so newly added options are visible
        if(sel._cselRebuild) sel._cselRebuild(); else if(sel._cselSync) sel._cselSync();
        console.log("Loaded " + d.devices.length + " devices");
      } else {
        console.warn("No devices returned or success=false", d);
      }
    })
    .catch(function(err){
      console.error("loadWanDevices fetch error:", err);
      // Fallback: common physical port names only
      var fallbacks = ["eth0", "eth1", "eth2", "eth3", "wan", "wwan0", "usb0"];
      fallbacks.forEach(function(dev) {
        if(!sel.querySelector("option[value='"+dev+"']")) {
          var opt = document.createElement("option");
          opt.value = dev;
          opt.textContent = dev;
          sel.appendChild(opt);
        }
      });
      // Rebuild the custom csel widget for fallback devices too
      if(sel._cselRebuild) sel._cselRebuild(); else if(sel._cselSync) sel._cselSync();
    });
}

// Call after a small delay to ensure DOM is ready
setTimeout(loadWanDevices, 100);

loadConfig();
setInfo("w-ip",  null,true);
setInfo("w-gw",  null,true);
setInfo("w-rx",  null,true);
setInfo("w-tx",  null,true);
setInfo("w-dns", null,true);
setInfo("w-uptime", null,true);

// Load WAN devices again after config is loaded to set proper values
setTimeout(loadWanDevices, 500);


pollWan(true);
_connectivityPoll.refresh();
