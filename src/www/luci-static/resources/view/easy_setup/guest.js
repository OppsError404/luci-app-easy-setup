var BASE = window.location.pathname.replace(/\/guest\/?$/, "");
var EYE_ON  = '<svg class="eye-on" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
var EYE_OFF = '<svg class="eye-off" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
var CHEVRON_DOWN = '<svg class="extra-opt-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
var CHEVRON = '<svg class="csel-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

// ── Theme ─────────────────────────────────────────────────────────────────────
(function(){var wrap=document.querySelector(".nc-wrap");function apply(l){if(wrap)wrap.classList.toggle("theme-light",l);}var mq=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");apply(mq?!mq.matches:false);if(mq&&mq.addEventListener)mq.addEventListener("change",function(e){apply(!e.matches);});})();

// ── Utilities ─────────────────────────────────────────────────────────────────
function setVal(id,v){var e=document.getElementById(id);if(e)e.value=(v||"");}
function setChk(id,v){var e=document.getElementById(id);if(e)e.checked=!!v;}
function selVal(id,v){var e=document.getElementById(id);if(!e)return;for(var i=0;i<e.options.length;i++)if(e.options[i].value===v){e.selectedIndex=i;break;}if(e._cselSync)e._cselSync();}
function dimCard(id,dim){var el=document.getElementById(id);if(el)el.classList.toggle("dim",dim);}
function toggleKey(wrapId,enc){var el=document.getElementById(wrapId);if(el)el.style.display=(enc==="none"?"none":"");}
function toggleEye(btn,id){var el=document.getElementById(id);var showing=el.type==="password";el.type=showing?"text":"password";btn.classList.toggle("shown",showing);btn.setAttribute("aria-label",showing?"Hide password":"Show password");}
function toggleExtraOptions(sfx){var d=document.getElementById("extra-opt-"+sfx),ch=document.getElementById("extra-opt-chevron-"+sfx);if(!d)return;var open=d.classList.toggle("open");if(ch)ch.style.transform=open?"rotate(180deg)":"";}
function _setFieldError(el,msg){
  if(!el)return;
  el.classList.add("field-error");
  var ex=el.parentNode.querySelector(".field-error-msg");
  if(ex)ex.remove();
  var e=document.createElement("span");
  e.className="field-error-msg";
  e.textContent=msg;
  e.style.display="block";
  el.insertAdjacentElement('afterend', e);
  el.oninput=function(){
    this.classList.remove("field-error");
    var m=this.parentNode.querySelector(".field-error-msg");
    if(m)m.remove();
  };
}
function _validateIfaceKey(enc,keyEl){keyEl.classList.remove("field-error");var errEl=keyEl.parentNode.querySelector(".field-error-msg");if(errEl)errEl.remove();if(enc!=="none"&&keyEl.value.length<8){keyEl.classList.add("field-error");var msg=document.createElement("span");msg.className="field-error-msg";msg.textContent="Password must be at least 8 characters.";msg.style.display="block";keyEl.insertAdjacentElement('afterend', msg);keyEl.focus();return false;}return true;}
function _getFieldVal(id){var el=document.getElementById(id);if(!el)return null;if(el.type==="checkbox")return el.checked;return el.value;}

// ── Band switch ───────────────────────────────────────────────────────────────
var _guestActiveBand="2g";
function switchGuestBand(band,btn){
  document.querySelectorAll(".guest-band-panel").forEach(function(p){p.classList.remove("active");});
  document.querySelectorAll("#guest-band-tabs .band-tab").forEach(function(b){b.classList.remove("active");});
  var panel=document.getElementById("gbp-"+band);if(panel)panel.classList.add("active");
  if(btn)btn.classList.add("active");
  _guestActiveBand=band;
}

// ── Guest state ───────────────────────────────────────────────────────────────
var _guestNetDirty=false,_guestNetSnap={},_guestDirty={},_guestSnap={};
var _guestPendingDelete={},_guestBandCfg={},_existingSubnets={};
var _wpa3Supported=false;

// Build the Security <option> list. WPA3 (sae) is only offered when the
// running wpad/hostapd supports SAE; an existing sae config is still rendered
// (selected) so a saved WPA3 SSID stays representable if support is removed.
function _encOpts(selected){
  var s=selected||"none";
  var o='<option value="none"'+(s==="none"?" selected":"")+'>Open</option>'+
        '<option value="psk"'+(s==="psk"?" selected":"")+'>WPA</option>'+
        '<option value="psk2"'+(s==="psk2"?" selected":"")+'>WPA2</option>'+
        '<option value="psk-mixed"'+(s==="psk-mixed"?" selected":"")+'>WPA/WPA2</option>';
  if(_wpa3Supported||s==="sae") o+='<option value="sae"'+(s==="sae"?" selected":"")+'>WPA3</option>';
  return o;
}

function _guestBandLabel(band){return band==="2g"?"2.4 GHz":band==="5gb"?"5 GHz (2)":band==="6g"?"6 GHz":"5 GHz";}
function _guestSfxBand(sfx){return sfx.replace(/^g-/,"").replace(/-\d+$/,"");}

function _guestSnapshotCard(sfx){_guestSnap[sfx]={ssid:_getFieldVal("guest-ssid-"+sfx)||"",enc:_getFieldVal("guest-enc-"+sfx)||"none",key:_getFieldVal("guest-key-"+sfx)||"",hidden:_getFieldVal("guest-hid-"+sfx)||"0",enabled:_getFieldVal("guest-en-"+sfx),isolate:_getFieldVal("guest-isolate-"+sfx),roam:_getFieldVal("guest-roam-"+sfx),wnm:_getFieldVal("guest-wnm-"+sfx)};}
function _guestCardMatchesSnap(sfx){var s=_guestSnap[sfx];if(!s)return false;return s.ssid===(_getFieldVal("guest-ssid-"+sfx)||"")&&s.enc===(_getFieldVal("guest-enc-"+sfx)||"none")&&s.key===(_getFieldVal("guest-key-"+sfx)||"")&&s.hidden===(_getFieldVal("guest-hid-"+sfx)||"0")&&s.enabled===_getFieldVal("guest-en-"+sfx)&&s.isolate===_getFieldVal("guest-isolate-"+sfx)&&s.roam===_getFieldVal("guest-roam-"+sfx)&&s.wnm===_getFieldVal("guest-wnm-"+sfx);}
function _guestBandAnyDirty(band){var cfg=_guestBandCfg[band];if(!cfg)return false;var n=cfg.ifaces?cfg.ifaces.length:0;for(var i=1;i<=n;i++){var sfx="g-"+band+"-"+i;if(_guestDirty[sfx]||_guestPendingDelete[sfx])return true;}return false;}

function guestMarkDirty(sfx){var band=_guestSfxBand(sfx);var cardEl=document.getElementById("guest-ssid-"+sfx);if(cardEl)cardEl=cardEl.closest(".nc-card");if(cardEl&&cardEl.hasAttribute("data-guest-new"))return;if(_guestCardMatchesSnap(sfx)&&!_guestNetDirty){guestMarkClean(sfx);return;}_guestDirty[sfx]=true;updateUniversalSave();}
function guestMarkClean(sfx){_guestDirty[sfx]=false;updateUniversalSave();}
function guestMarkNetDirty(){_guestNetDirty=true;updateUniversalSave();var ip=document.getElementById("guest-ipaddr");if(ip)_guestUpdateDhcpPreview(ip.value);}
function _guestUpdateDhcpPreview(ip){var el=document.getElementById("guest-dhcp-preview");if(!el)return;var m=(ip||"").trim().match(/^(\d+\.\d+\.\d+)\.\d+$/);el.textContent=m?m[1]+".100 \u2014 "+m[1]+".249":"\u2014";}

// ── Delete staging ────────────────────────────────────────────────────────────
function markDeleteGuestIface(band,ifaceIdx){
  var sfx="g-"+band+"-"+(ifaceIdx+1);
  var delBtn=document.getElementById("guest-delbtn-"+sfx);if(!delBtn)return;
  var card=delBtn.closest(".nc-card"),head=card&&card.querySelector(".nc-card-head");
  var pending=!_guestPendingDelete[sfx];_guestPendingDelete[sfx]=pending;
  if(pending){if(card)card.classList.add("pending-delete");if(head)head.classList.add("head-del-ssid");delBtn.textContent="Undo Remove";delBtn.className="btn-undo-delete";_guestDirty[sfx]=true;}
  else{if(card)card.classList.remove("pending-delete");if(head)head.classList.remove("head-del-ssid");delBtn.textContent="Remove";delBtn.className="btn-delete-iface";_guestDirty[sfx]=false;}
  updateUniversalSave();
}

// ── Build SSID card ───────────────────────────────────────────────────────────
function _buildGuestSsidCard(band,n,ifd,insertBefore){
  var sfx="g-"+band+"-"+n,isNew=!(ifd.iface_sec&&ifd.iface_sec!=="");
  var roamOn=(ifd.bss_transition==="1"||ifd.ieee80211k==="1"),isolateOn=(ifd.isolate!=="0");
  var isEnabled=!isNew&&ifd.disabled!=="1",label=ifd.ssid ? "Guest SSID: " + ifd.ssid : (_guestBandLabel(band)+" Guest"+(n>1?" "+n:""));
  var card=document.createElement("div");card.className="nc-card ssid-card wl-focus";if(isNew)card.setAttribute("data-guest-new","1");
  card.innerHTML=
    '<div class="nc-card-head'+(isNew?" head-new-ssid":"")+'">'+
      '<div class="nc-card-head-left"><h2>'+label+'</h2></div>'+
      '<div class="nc-card-head-right"><div class="tog-wrap"><span class="tog-lbl">Enable</span>'+
        '<label class="toggle"><input type="checkbox" id="guest-en-'+sfx+'"'+(isNew||isEnabled?" checked":"")+' onchange="dimCard(\'guest-body-'+sfx+'\',!this.checked);guestMarkDirty(\''+sfx+'\')">'+
        '<div class="tog-track"></div><div class="tog-thumb"></div></label></div></div>'+
    '</div>'+
    '<div class="nc-card-body" id="guest-body-'+sfx+'"'+(!isNew&&ifd.disabled==="1"?' style="opacity:.4;pointer-events:none"':'')+'>'+
      '<input type="hidden" id="h-guest-iface-'+sfx+'" value="">'+
      (!isNew&&!ifd.network?'<div class="card-error-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> No Interface Assigned</div>':'')+
      '<div class="fg" onchange="guestMarkDirty(\''+sfx+'\')" oninput="guestMarkDirty(\''+sfx+'\')">'+
        '<div class="nf"><label>SSID (Network Name) <span style="color:#e05a52">*</span></label>'+
          '<input type="text" id="guest-ssid-'+sfx+'" maxlength="32" placeholder="Guest WiFi"'+
            ' oninput="this.classList.remove(\'field-error\');var e=this.parentNode.querySelector(\'.field-error-msg\');if(e)e.remove();guestMarkDirty(\''+sfx+'\')"></div>'+
        '<div class="nf"><label>Broadcast SSID</label>'+
          '<select id="guest-hid-'+sfx+'" onchange="guestMarkDirty(\''+sfx+'\')"><option value="0">Yes (Visible)</option><option value="1">No (Hidden)</option></select></div>'+
        '<div class="nf"><label>Security</label>'+
          '<select id="guest-enc-'+sfx+'" onchange="toggleKey(\'guest-kw-'+sfx+'\',this.value);guestMarkDirty(\''+sfx+'\')">'+
            _encOpts(ifd.enc||"none")+'</select></div>'+
        '<div class="nf" id="guest-kw-'+sfx+'"><label>Password <span style="color:#e05a52">*</span></label>'+
          '<div class="pw-wrap">'+
            '<input type="password" id="guest-key-'+sfx+'" placeholder="Min 8 chars" autocomplete="new-password"'+
              ' oninput="this.classList.remove(\'field-error\');var e=this.parentNode.querySelector(\'.field-error-msg\');if(e)e.remove();guestMarkDirty(\''+sfx+'\')">'+
            '<button class="pw-eye" onclick="toggleEye(this,\'guest-key-'+sfx+'\')" type="button" aria-label="Show password">'+EYE_ON+EYE_OFF+'</button></div></div>'+
      '</div>'+
    '</div>'+
    '<div class="radio-card-divider"><div class="extra-opt-toggle" onclick="toggleExtraOptions(\''+sfx+'\')">Extra Options <span id="extra-opt-chevron-'+sfx+'" class="extra-opt-chevron">'+CHEVRON_DOWN+'</span></div></div>'+
    '<div id="extra-opt-'+sfx+'" class="extra-opt-content"><div class="extra-opt-inner">'+
      '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Client Isolation <span style="font-size:.68rem;font-weight:500;color:#43e895;opacity:.85">(Recommended)</span></div>'+
        '<div class="guest-opt-desc">Restricts connected clients from communicating with each other. Enhances security by isolating peer-to-peer traffic on the same wireless network.</div>'+
        '<div class="guest-opt-note">Note: Disables local network discovery and peer-to-peer resource sharing (e.g., AirDrop, Chromecast, Printer sharing).</div>'+
        '</div>'+
        '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="guest-isolate-'+sfx+'"'+(isolateOn?" checked":"")+' onchange="guestMarkDirty(\''+sfx+'\')">'+
        '<div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
      '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Roaming Assist</div>'+
        '<div class="guest-opt-desc">Optimizes client steering using 802.11k/v neighbor reports and BSS transitions. Facilitates faster, intelligent handoffs between APs.</div>'+
        '</div>'+
        '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="guest-roam-'+sfx+'"'+(roamOn?" checked":"")+' onchange="guestMarkDirty(\''+sfx+'\')">'+
        '<div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
      '<div class="guest-opt-row"><div class="guest-opt-left"><div class="guest-opt-title">Power Saving</div>'+
        '<div class="guest-opt-desc">Implements WNM Sleep Mode to reduce signaling overhead. Extends battery life for connected mobile and IoT devices.</div>'+
        '<div class="guest-opt-caution">Caution: May cause connectivity issues or increased latency on some legacy hardware.</div>'+
        '</div>'+
        '<label class="toggle" style="flex-shrink:0"><input type="checkbox" id="guest-wnm-'+sfx+'"'+(ifd.wnm_sleep_mode==="1"?" checked":"")+' onchange="guestMarkDirty(\''+sfx+'\')">'+
        '<div class="tog-track"></div><div class="tog-thumb"></div></label></div>'+
    '</div></div>'+
    '<div class="pending-delete-notice">This SSID will be removed on the next save.</div>'+
    '<div class="nc-actions">'+
      (isNew
        ?'<button class="nc-btn btn-sec" onclick="cancelNewGuestSsid(this)" type="button">Cancel</button>'+
          '<button class="nc-btn btn-add" id="guest-savebtn-'+sfx+'" onclick="saveNewGuestSsid(\''+band+'\','+(n-1)+')">'+
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>'
        :'<button class="btn-delete-iface" id="guest-delbtn-'+sfx+'" onclick="markDeleteGuestIface(\''+band+'\','+(n-1)+')" type="button" style="margin-right:auto">Remove</button>'
      )+
    '</div>';
  var container=document.getElementById("gbp-"+band);
  if(insertBefore)container.insertBefore(card,insertBefore);else container.appendChild(card);
  setVal("h-guest-iface-"+sfx,ifd.iface_sec||"");setVal("guest-ssid-"+sfx,ifd.ssid||"");
  setVal("guest-key-"+sfx,ifd.key||"");selVal("guest-enc-"+sfx,ifd.enc||"none");
  selVal("guest-hid-"+sfx,ifd.hidden||"0");toggleKey("guest-kw-"+sfx,ifd.enc||"none");
  if(!isNew&&ifd.disabled==="1")dimCard("guest-body-"+sfx,true);
  upgradeSelects(card);if(!isNew)_guestSnapshotCard(sfx);
  return card;
}

// ── buildGuestBandPanel ───────────────────────────────────────────────────────
function buildGuestBandPanel(band,wData){
  var container=document.getElementById("gbp-"+band);if(!container)return;
  container.innerHTML="";_guestBandCfg[band]=wData;
  var rh=document.createElement("input");rh.type="hidden";rh.id="h-guest-radio-"+band;rh.value=wData.radio_sec||"";container.appendChild(rh);
  var addRow=document.createElement("div");addRow.style.cssText="display:flex;justify-content:flex-start;margin-bottom:10px";addRow.setAttribute("data-guest-add-row","1");
  addRow.innerHTML='<button class="nc-btn btn-add" onclick="addGuestSsid(\''+band+'\')" type="button" style="gap:6px">'+
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Guest SSID</button>';
  container.appendChild(addRow);
  (wData.ifaces||[]).forEach(function(ifd,idx){_buildGuestSsidCard(band,idx+1,ifd,addRow);});
}
function addGuestSsid(band){
  var container=document.getElementById("gbp-"+band);if(!container)return;
  var addRow=container.querySelector("[data-guest-add-row]");if(!addRow)return;
  var n=container.querySelectorAll(".nc-card.ssid-card").length+1;
  if(!_guestBandCfg[band])_guestBandCfg[band]={radio_sec:"",ifaces:[]};
  while(_guestBandCfg[band].ifaces.length<n)_guestBandCfg[band].ifaces.push({});
  var card=_buildGuestSsidCard(band,n,{iface_sec:"",ssid:"",enc:"none",key:"",hidden:"0",disabled:"0",isolate:"1",bss_transition:"0",ieee80211k:"0"},addRow);
  if(card){var h=card.querySelector(".nc-card-head");if(h)h.classList.add("head-new-ssid");}
}
function cancelNewGuestSsid(btn){
  var card=btn.closest(".nc-card");if(!card)return;
  var band=null;["2g","5g","5gb","6g"].forEach(function(b){var c=document.getElementById("gbp-"+b);if(c&&c.contains(card))band=b;});
  card.remove();
  updateUniversalSave();
}

// ── Save functions ────────────────────────────────────────────────────────────
function saveNewGuestSsid(band,ifaceIdx){
  var n=ifaceIdx+1,sfx="g-"+band+"-"+n;
  var radio_sec=(_getFieldVal("h-guest-radio-"+band)||"").trim();
  if(!radio_sec){toast("err","Radio not found. Reload the page.");return;}
  var ssidEl=document.getElementById("guest-ssid-"+sfx),ssid=ssidEl?ssidEl.value.trim():"";
  if(!ssid){if(ssidEl){_setFieldError(ssidEl,"SSID name is required.");ssidEl.focus();}return;}
  var encEl=document.getElementById("guest-enc-"+sfx),keyEl=document.getElementById("guest-key-"+sfx);
  if(encEl&&keyEl&&!_validateIfaceKey(encEl.value,keyEl))return;
  var ipEl=document.getElementById("guest-ipaddr");
  if(ipEl&&_guestNetDirty){var val=ipEl.value.trim(),prefix=val.match(/^(\d+\.\d+\.\d+)\./);if(prefix&&_existingSubnets[prefix[1]]){toast("err","IP Conflict: subnet "+prefix[1]+".0/24 already used by '"+_existingSubnets[prefix[1]]+"'.");ipEl.focus();ipEl.classList.add("field-error");return;}}
  var enc=encEl?encEl.value:"none",key=keyEl?keyEl.value:"";
  var hidEl=document.getElementById("guest-hid-"+sfx),enEl=document.getElementById("guest-en-"+sfx);
  var isoEl=document.getElementById("guest-isolate-"+sfx),roamEl=document.getElementById("guest-roam-"+sfx),wnmEl=document.getElementById("guest-wnm-"+sfx);
  var d="band="+encodeURIComponent(band)+"&radio_sec="+encodeURIComponent(radio_sec)+"&iface_sec="+
    "&ssid="+encodeURIComponent(ssid)+"&enc="+encodeURIComponent(enc)+"&key="+encodeURIComponent(key)+
    "&hidden="+encodeURIComponent(hidEl?hidEl.value:"0")+"&disabled="+(enEl&&enEl.checked?"0":"1")+
    "&isolate="+(isoEl&&isoEl.checked?"1":"0")+"&roam="+(roamEl&&roamEl.checked?"1":"0")+
    "&ipaddr="+encodeURIComponent(ipEl?ipEl.value:"192.168.2.1");
  showSaving("Adding Guest SSID...","Creating guest interface on "+_guestBandLabel(band));
  ajax("POST",BASE+"/save_guest",d,function(r){
    hideSaving();
    if(r&&r.success&&r.iface_sec){
      var hf=document.getElementById("h-guest-iface-"+sfx);if(hf)hf.value=r.iface_sec;
      if(!_guestBandCfg[band])_guestBandCfg[band]={radio_sec:radio_sec,ifaces:[]};
      while(_guestBandCfg[band].ifaces.length<n)_guestBandCfg[band].ifaces.push({});
      _guestBandCfg[band].ifaces[n-1]={iface_sec:r.iface_sec,ssid:ssid};
      var card=hf?hf.closest(".nc-card"):null;
      if(card){card.removeAttribute("data-guest-new");var head=card.querySelector(".nc-card-head");if(head)head.classList.remove("head-new-ssid");
        var actions=card.querySelector(".nc-actions");
        if(actions)actions.innerHTML='<button class="btn-delete-iface" id="guest-delbtn-'+sfx+'" onclick="markDeleteGuestIface(\''+band+'\','+(n-1)+')" type="button" style="margin-right:auto">Remove</button>';}
      _guestSnapshotCard(sfx);
      var gfwEl=document.getElementById("gfw-status");if(gfwEl){gfwEl.textContent="Configured";gfwEl.className="guest-fw-val ok";}
      var newIp=ipEl?ipEl.value.trim():_guestNetSnap.ipaddr;_guestNetSnap.ipaddr=newIp;_guestNetDirty=false;
      var unb=document.getElementById("guest-net-undo-btn");if(unb)unb.classList.remove("visible");
      var ab=document.getElementById("guest-savebtn-all-"+band);if(ab)ab.disabled=true;
      updateUniversalSave();
      toast("ok","Guest SSID added",r.changes&&r.changes.length?r.changes:null);pollGuest();
    }else{toast("err",(r&&r.message)||"Failed to create guest SSID");}
  });
}
function saveGuestIface(band,ifaceIdx){
  var n=ifaceIdx+1,sfx="g-"+band+"-"+n,bandLabel=_guestBandLabel(band);
  var iface_sec=(_getFieldVal("h-guest-iface-"+sfx)||"").trim(),radio_sec=(_getFieldVal("h-guest-radio-"+band)||"").trim();
  if(_guestPendingDelete[sfx]){
    showSaving("Removing Guest SSID...","Deleting from "+bandLabel);
    ajax("POST",BASE+"/delete_guest_band","iface_sec="+encodeURIComponent(iface_sec)+"&radio_sec="+encodeURIComponent(radio_sec),function(r){
      hideSaving();
      if(r&&r.success){delete _guestPendingDelete[sfx];delete _guestDirty[sfx];delete _guestSnap[sfx];
        if(_guestBandCfg[band]&&_guestBandCfg[band].ifaces)_guestBandCfg[band].ifaces.splice(ifaceIdx,1);
        var db=document.getElementById("guest-delbtn-"+sfx);if(db){var c=db.closest(".nc-card");if(c)c.remove();}
        var ab=document.getElementById("guest-savebtn-all-"+band);if(ab)ab.disabled=!_guestBandAnyDirty(band)&&!_guestNetDirty;
        toast("ok","Guest SSID removed");pollGuest();}
      else toast("err",(r&&r.message)||"Delete failed");
    });return;
  }
  if(!_guestDirty[sfx]){toast("ok","No changes to save");return;}
  var encEl=document.getElementById("guest-enc-"+sfx),keyEl=document.getElementById("guest-key-"+sfx);
  if(encEl&&keyEl&&!_validateIfaceKey(encEl.value,keyEl))return;

  var overlay = document.getElementById('ssid-confirm-overlay');
  var yesBtn = document.getElementById('ssid-confirm-yes');
  var msgEl = document.getElementById('ssid-confirm-msg');
  if (msgEl) {
    var ssidEl = document.getElementById("guest-ssid-" + sfx);
    msgEl.textContent = "Clients on SSID: " + (ssidEl ? ssidEl.value.trim() : "Unknown") + " will briefly disconnect.";
  }
  overlay.classList.add('show');

  yesBtn.onclick = function() {
    overlay.classList.remove('show');
    var enc=encEl?encEl.value:"none",key=keyEl?keyEl.value:"";
    var ssidEl=document.getElementById("guest-ssid-"+sfx),hidEl=document.getElementById("guest-hid-"+sfx);
    var enEl=document.getElementById("guest-en-"+sfx),isoEl=document.getElementById("guest-isolate-"+sfx);
    var roamEl=document.getElementById("guest-roam-"+sfx),wnmEl=document.getElementById("guest-wnm-"+sfx);
    var ipEl=document.getElementById("guest-ipaddr");
    var d="band="+encodeURIComponent(band)+"&radio_sec="+encodeURIComponent(radio_sec)+
      "&iface_sec="+encodeURIComponent(iface_sec)+"&ssid="+encodeURIComponent(ssidEl?ssidEl.value.trim():"")+
      "&enc="+encodeURIComponent(enc)+"&key="+encodeURIComponent(key)+
      "&hidden="+encodeURIComponent(hidEl?hidEl.value:"0")+"&disabled="+(enEl&&enEl.checked?"0":"1")+
      "&isolate="+(isoEl&&isoEl.checked?"1":"0")+"&roam="+(roamEl&&roamEl.checked?"1":"0")+
      "&ipaddr="+encodeURIComponent(ipEl?ipEl.value:"192.168.2.1");
    showSaving("Saving Guest SSID...","Applying settings on "+bandLabel);
    ajax("POST",BASE+"/save_guest",d,function(r){
      hideSaving();
      if(r&&r.success){var newIp=ipEl?ipEl.value.trim():_guestNetSnap.ipaddr;_guestNetSnap.ipaddr=newIp;_guestNetDirty=false;var unb=document.getElementById("guest-net-undo-btn");if(unb)unb.classList.remove("visible");_guestSnapshotCard(sfx);guestMarkClean(sfx);toast("ok","Guest SSID saved",r.changes&&r.changes.length?r.changes:null);pollGuest();}
      else toast("err",(r&&r.message)||"Unknown error");
    });
  };
}
// ── Universal Save & Apply (all bands) ────────────────────────────────────────
function updateUniversalSave(){
  var bar=document.getElementById("universal-save-bar");
  var btn=document.getElementById("usb-apply");
  var status=document.getElementById("usb-status");
  var has=false;
  for(var k in _guestDirty) if(_guestDirty[k]){has=true;break;}
  if(!has) for(var k2 in _guestPendingDelete) if(_guestPendingDelete[k2]){has=true;break;}
  if(!has) has=!!_guestNetDirty;
  if(btn) btn.disabled=!has;
  if(status) status.textContent=has?"Unsaved changes":"No changes";
  if(bar) bar.classList.toggle("has-changes",has);
}
function saveAllUniversal(){
  var ipEl=document.getElementById("guest-ipaddr");
  if(ipEl&&_guestNetDirty){var val=ipEl.value.trim(),prefix=val.match(/^(\d+\.\d+\.\d+)\./);if(prefix&&_existingSubnets[prefix[1]]){toast("err","IP Conflict: subnet "+prefix[1]+".0/24 already used by '"+_existingSubnets[prefix[1]]+"'.");ipEl.focus();ipEl.classList.add("field-error");return;}}
  var bandsOrder=["2g","5g","5gb","6g"];
  var tasks=[];
  bandsOrder.forEach(function(band){
    var cfg=_guestBandCfg[band]||{ifaces:[]};
    var n=cfg.ifaces?cfg.ifaces.length:0;
    for(var i=0;i<n;i++){
      var sfx="g-"+band+"-"+(i+1);
      if(_guestPendingDelete[sfx]) tasks.push({type:"delete",band:band,idx:i});
      else if(_guestDirty[sfx]) tasks.push({type:"save",band:band,idx:i});
    }
  });
  if(!tasks.length&&!_guestNetDirty){toast("ok","No changes to save");return;}

  for(var v=0;v<tasks.length;v++){
    var t=tasks[v];
    if(t.type!=="save") continue;
    var sfx="g-"+t.band+"-"+(t.idx+1);
    var ssidEl=document.getElementById("guest-ssid-"+sfx);
    var encEl=document.getElementById("guest-enc-"+sfx),keyEl=document.getElementById("guest-key-"+sfx);
    if(ssidEl&&!ssidEl.value.trim()){if(ssidEl){_setFieldError(ssidEl,"SSID name is required.");ssidEl.focus();}toast("err","SSID name is required");return;}
    if(encEl&&keyEl&&!_validateIfaceKey(encEl.value,keyEl))return;
  }

  var overlay=document.getElementById('ssid-confirm-overlay');
  var yesBtn=document.getElementById('ssid-confirm-yes');
  var msgEl=document.getElementById('ssid-confirm-msg');
  if(msgEl){
    var names=[];
    tasks.forEach(function(t){ if(t.type!=="save")return; var tsfx="g-"+t.band+"-"+(t.idx+1); var val=_getFieldVal("guest-ssid-"+tsfx); if(val)names.push(val); });
    if(names.length>0) msgEl.textContent="Clients on SSID: "+names.join(" and ")+" will briefly disconnect.";
    else msgEl.textContent="Applying changes will briefly disconnect clients connected to this guest SSID.";
  }
  overlay.classList.add('show');
  yesBtn.onclick=function(){
    overlay.classList.remove('show');
    showSaving("Saving all Guest changes...","Applying settings");
    var allChanges=[],step=0;
    function next(ok,msg){
      if(!ok){hideSaving();toast("err",msg||"Save failed");return;}
      if(step>=tasks.length){hideSaving();toast("ok","Guest changes saved",allChanges.length?allChanges:null);loadGuestConfig();return;}
      var task=tasks[step++];
      if(task.type==="delete"){
        var dsfx="g-"+task.band+"-"+(task.idx+1);
        var is=(_getFieldVal("h-guest-iface-"+dsfx)||"").trim(),rs=(_getFieldVal("h-guest-radio-"+task.band)||"").trim();
        ajax("POST",BASE+"/delete_guest_band","iface_sec="+encodeURIComponent(is)+"&radio_sec="+encodeURIComponent(rs),function(r){
          if(r&&r.success){delete _guestPendingDelete[dsfx];delete _guestDirty[dsfx];var db=document.getElementById("guest-delbtn-"+dsfx);if(db){var c2=db.closest(".nc-card");if(c2)c2.remove();}allChanges.push("Guest SSID removed from "+_guestBandLabel(task.band));}
          next(r&&r.success,r&&r.message);
        });
      }else{
        var s2="g-"+task.band+"-"+(task.idx+1);
        var is2=(_getFieldVal("h-guest-iface-"+s2)||"").trim(),rs2=(_getFieldVal("h-guest-radio-"+task.band)||"").trim();
        var encEl2=document.getElementById("guest-enc-"+s2),keyEl2=document.getElementById("guest-key-"+s2);
        var ssidEl2=document.getElementById("guest-ssid-"+s2),hidEl2=document.getElementById("guest-hid-"+s2);
        var enEl2=document.getElementById("guest-en-"+s2),isoEl2=document.getElementById("guest-isolate-"+s2);
        var roamEl2=document.getElementById("guest-roam-"+s2),ipEl2=document.getElementById("guest-ipaddr");
        var d2="band="+encodeURIComponent(task.band)+"&radio_sec="+encodeURIComponent(rs2)+"&iface_sec="+encodeURIComponent(is2)+
          "&ssid="+encodeURIComponent(ssidEl2?ssidEl2.value.trim():"")+"&enc="+encodeURIComponent(encEl2?encEl2.value:"none")+
          "&key="+encodeURIComponent(keyEl2?keyEl2.value:"")+"&hidden="+encodeURIComponent(hidEl2?hidEl2.value:"0")+
          "&disabled="+(enEl2&&enEl2.checked?"0":"1")+"&isolate="+(isoEl2&&isoEl2.checked?"1":"0")+
          "&roam="+(roamEl2&&roamEl2.checked?"1":"0")+"&ipaddr="+encodeURIComponent(ipEl2?ipEl2.value:"192.168.2.1");
        ajax("POST",BASE+"/save_guest",d2,function(r){
          if(r&&r.success){var nip=ipEl2?ipEl2.value.trim():_guestNetSnap.ipaddr;_guestNetSnap.ipaddr=nip;_guestNetDirty=false;_guestSnapshotCard(s2);_guestDirty[s2]=false;if(r.changes)r.changes.forEach(function(c){allChanges.push(c);});}
          next(r&&r.success,r&&r.message);
        });
      }
    }
    next(true);
  };
}

function saveAllGuest(band){
  var bandLabel=_guestBandLabel(band),cfg=_guestBandCfg[band]||{ifaces:[]};
  var ipEl=document.getElementById("guest-ipaddr");
  if(ipEl&&_guestNetDirty){var val=ipEl.value.trim(),prefix=val.match(/^(\d+\.\d+\.\d+)\./);if(prefix&&_existingSubnets[prefix[1]]){toast("err","IP Conflict: subnet "+prefix[1]+".0/24 already used by '"+_existingSubnets[prefix[1]]+"'.");ipEl.focus();ipEl.classList.add("field-error");return;}}
  var tasks=[],n=cfg.ifaces?cfg.ifaces.length:0;
  for(var i=0;i<n;i++){var sfx="g-"+band+"-"+(i+1);if(_guestPendingDelete[sfx])tasks.push({type:"delete",idx:i});else if(_guestDirty[sfx])tasks.push({type:"save",idx:i});}
  if(!tasks.length&&!_guestNetDirty){toast("ok","No changes to save");return;}

  var overlay = document.getElementById('ssid-confirm-overlay');
  var yesBtn = document.getElementById('ssid-confirm-yes');
  var msgEl = document.getElementById('ssid-confirm-msg');
  if (msgEl) {
    var names = [];
    tasks.forEach(function(t) {
      if (t.type !== "save") return;
      var tsfx = "g-" + band + "-" + (t.idx + 1);
      var val = _getFieldVal("guest-ssid-" + tsfx);
      if (val) names.push(val);
    });
    if (names.length > 0) {
      msgEl.textContent = "Clients on SSID: " + names.join(" and ") + " will briefly disconnect.";
    } else {
      msgEl.textContent = "Applying changes will briefly disconnect clients connected to this guest SSID.";
    }
  }
  overlay.classList.add('show');

  yesBtn.onclick = function() {
    overlay.classList.remove('show');
    showSaving("Saving Guest "+bandLabel+"...","Applying all changes");
    var allChanges=[],step=0;
    function next(ok,msg){
      if(!ok){hideSaving();toast("err",msg||"Save failed");return;}
      if(step>=tasks.length){hideSaving();toast("ok",bandLabel+" Guest saved",allChanges.length?allChanges:null);pollGuest();return;}
      var task=tasks[step++];
      if(task.type==="delete"){
        var dsfx="g-"+band+"-"+(task.idx+1);
        var is=(_getFieldVal("h-guest-iface-"+dsfx)||"").trim(),rs=(_getFieldVal("h-guest-radio-"+band)||"").trim();
        ajax("POST",BASE+"/delete_guest_band","iface_sec="+encodeURIComponent(is)+"&radio_sec="+encodeURIComponent(rs),function(r){
          if(r&&r.success){delete _guestPendingDelete[dsfx];delete _guestDirty[dsfx];var db=document.getElementById("guest-delbtn-"+dsfx);if(db){var c2=db.closest(".nc-card");if(c2)c2.remove();}if(cfg.ifaces)cfg.ifaces.splice(task.idx,1);allChanges.push("Guest SSID removed from "+bandLabel);}
          next(r&&r.success,r&&r.message);
        });
      }else{
        var s2="g-"+band+"-"+(task.idx+1);
        var is2=(_getFieldVal("h-guest-iface-"+s2)||"").trim(),rs2=(_getFieldVal("h-guest-radio-"+band)||"").trim();
        var encEl2=document.getElementById("guest-enc-"+s2),keyEl2=document.getElementById("guest-key-"+s2);
        var ssidEl2=document.getElementById("guest-ssid-"+s2),hidEl2=document.getElementById("guest-hid-"+s2);
        var enEl2=document.getElementById("guest-en-"+s2),isoEl2=document.getElementById("guest-isolate-"+s2);
        var roamEl2=document.getElementById("guest-roam-"+s2),ipEl2=document.getElementById("guest-ipaddr");
        var d2="band="+encodeURIComponent(band)+"&radio_sec="+encodeURIComponent(rs2)+"&iface_sec="+encodeURIComponent(is2)+
          "&ssid="+encodeURIComponent(ssidEl2?ssidEl2.value.trim():"")+"&enc="+encodeURIComponent(encEl2?encEl2.value:"none")+
          "&key="+encodeURIComponent(keyEl2?keyEl2.value:"")+"&hidden="+encodeURIComponent(hidEl2?hidEl2.value:"0")+
          "&disabled="+(enEl2&&enEl2.checked?"0":"1")+"&isolate="+(isoEl2&&isoEl2.checked?"1":"0")+
          "&roam="+(roamEl2&&roamEl2.checked?"1":"0")+"&ipaddr="+encodeURIComponent(ipEl2?ipEl2.value:"192.168.2.1");
        ajax("POST",BASE+"/save_guest",d2,function(r){
          if(r&&r.success){var nip=ipEl2?ipEl2.value.trim():_guestNetSnap.ipaddr;_guestNetSnap.ipaddr=nip;_guestNetDirty=false;var ub=document.getElementById("guest-net-undo-btn");if(ub)ub.classList.remove("visible");_guestSnapshotCard(s2);guestMarkClean(s2);if(r.changes)r.changes.forEach(function(c){allChanges.push(c);});}
          next(r&&r.success,r&&r.message);
        });
      }
    }
    next(true);
  };
}

// ── pollGuest ─────────────────────────────────────────────────────────────────
function pollGuest(){
  return _guestPoll.refresh();
}
function _refreshGuest(){
  return ajax("GET",BASE+"/status_guest",null,function(s){
    if(!s || s.error || s.success === false)return;
    if(s.ipaddr){var ip=document.getElementById("guest-ipaddr");if(ip&&!_guestNetDirty){ip.value=s.ipaddr;_guestUpdateDhcpPreview(s.ipaddr);}}
    var gfwEl=document.getElementById("gfw-status");
    if(gfwEl&&s.firewall_ok!==undefined){gfwEl.textContent=s.firewall_ok?"Configured":"Will be created on first save";gfwEl.className="guest-fw-val "+(s.firewall_ok?"ok":"warn");}
  });
}
var _guestPoll=EasySetup.createPoll(_refreshGuest,8);

// ── fixGuestDeps ──────────────────────────────────────────────────────────────
function fixGuestDeps(){
  var btn=document.getElementById("btn-fix-guest-dep"),msg=document.getElementById("guest-dep-msg");
  if(btn)btn.disabled=true;if(msg)msg.textContent="Resolving dependencies... please wait.";
  ajax("POST",BASE+"/fix_guest_dependencies",null,function(r){
    if(r.success){if(r.changes&&r.changes.length>0)toast("ok","Dependencies resolved: "+r.changes.join(", "));else toast("ok","Guest dependencies are already up to date.");loadGuestConfig();}
    else{toast("err",r.message||"Failed to fix dependencies");if(btn)btn.disabled=false;if(msg)msg.textContent="An error occurred while trying to fix dependencies.";}
  });
}

// ── Custom select engine ──────────────────────────────────────────────────────
var _openCsel=null;
document.addEventListener("click",function(e){if(!_openCsel)return;var list=document.getElementById(_openCsel.listId);if(list&&list.contains(e.target))return;if(_openCsel.trigger.contains(e.target))return;cselCloseAll();});
document.addEventListener("touchend",function(e){if(!_openCsel)return;var list=document.getElementById(_openCsel.listId);if(list&&list.contains(e.target))return;if(_openCsel.trigger.contains(e.target))return;cselCloseAll();},true);
function cselCloseAll(){if(!_openCsel)return;_openCsel.trigger.classList.remove("open");var list=document.getElementById(_openCsel.listId);if(list)list.classList.remove("open","flip-up");_openCsel=null;}
function _cselPosition(trigger,list){var rect=trigger.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight;var nb=document.querySelector(".luci-navbar,#navbar,nav.navbar,header.navbar");var TC=Math.max(nb?nb.getBoundingClientRect().bottom+4:52,56);var lmw=list.dataset.minw?parseInt(list.dataset.minw):160,lw=Math.max(rect.width,lmw),left=rect.left;if(left+lw>vw-8)left=vw-lw-8;if(left<8)left=8;list.style.width=lw+"px";list.style.left=left+"px";list.style.top="";list.style.bottom="";list.classList.remove("flip-up");var sb=vh-rect.bottom-8,sa=rect.top-TC,mh=220;if(sb>=80||sb>=sa){list.style.top=(rect.bottom+4)+"px";list.style.maxHeight=Math.min(mh,sb)+"px";}else{list.classList.add("flip-up");var au=Math.min(mh,sa),lt=rect.top-4-au;if(lt<TC){list.classList.remove("flip-up");list.style.top=(rect.bottom+4)+"px";list.style.maxHeight=Math.min(mh,sb)+"px";}else{list.style.bottom=(vh-rect.top+4)+"px";list.style.maxHeight=au+"px";}}}
window.addEventListener("scroll",function(e){if(!_openCsel)return;var list=document.getElementById(_openCsel.listId);if(list&&list.contains(e.target))return;cselCloseAll();},true);
window.addEventListener("resize",function(){if(!_openCsel)return;var list=document.getElementById(_openCsel.listId);if(!list)return;_cselPosition(_openCsel.trigger,list);});
function upgradeSelects(root){
  var selects=(root||document).querySelectorAll(".nf select:not([data-csu])");
  selects.forEach(function(sel){
    sel.setAttribute("data-csu","1");var nf=sel.closest('.nf');if(nf)nf.classList.add('nf-has-select');sel.style.display="none";
    var wrap=document.createElement("div");wrap.className="csel-wrap";sel.parentNode.insertBefore(wrap,sel);wrap.appendChild(sel);
    var trigger=document.createElement("div");trigger.className="csel";trigger.innerHTML='<span class="csel-val"></span>'+CHEVRON;wrap.appendChild(trigger);
    var listId="csel-"+Math.random().toString(36).slice(2,9);var list=document.createElement("div");list.className="csel-list";
    if(sel.closest(".ssid-card"))list.classList.add("csel-blue");list.id=listId;list.style.position="fixed";list.style.zIndex="99";document.body.appendChild(list);
    function _renderOpts(){list.innerHTML="";Array.from(sel.options).forEach(function(opt){var d=document.createElement("div");d.className="csel-opt";d.dataset.val=opt.value;d.textContent=opt.textContent;if(opt.selected)d.classList.add("selected");d.addEventListener("click",function(e){e.stopPropagation();sel.value=opt.value;sel.dispatchEvent(new Event("change",{bubbles:true}));syncDisplay();cselCloseAll();});list.appendChild(d);});}
    function syncDisplay(){var opt=sel.options[sel.selectedIndex];var sp=trigger.querySelector(".csel-val");if(sp)sp.textContent=opt?opt.textContent:"";list.querySelectorAll(".csel-opt").forEach(function(o){o.classList.toggle("selected",o.dataset.val===sel.value);});}
    _renderOpts();syncDisplay();sel._cselSync=syncDisplay;sel._cselRebuild=function(){_renderOpts();syncDisplay();};
    trigger.addEventListener("click",function(e){e.stopPropagation();if(_openCsel&&_openCsel.trigger!==trigger)cselCloseAll();if(list.classList.contains("open")){cselCloseAll();return;}var w2=document.querySelector(".nc-wrap");var il=w2&&w2.classList.contains("theme-light");list.classList.toggle("theme-light",!!il);_cselPosition(trigger,list);trigger.classList.add("open");list.classList.add("open");_openCsel={trigger:trigger,listId:listId};var s2=list.querySelector(".csel-opt.selected");if(s2)setTimeout(function(){s2.scrollIntoView({block:"nearest"});},0);});
  });
}

// ── AJAX + Toast ──────────────────────────────────────────────────────────────

function ajax(method, url, body, cb) {
  return EasySetup.ajax(method, url, body, cb);
}

var _bannerTimer=null;
function toast(type,msg,lines){var overlay=document.getElementById("toast-overlay"),iconWrap=document.getElementById("toast-overlay-icon"),svg=document.getElementById("toast-overlay-svg"),textEl=document.getElementById("toast-overlay-text"),listEl=document.getElementById("toast-overlay-changes");if(!overlay)return;if(_bannerTimer){clearTimeout(_bannerTimer);_bannerTimer=null;}textEl.textContent=msg||(type==="ok"?"Done":"An error occurred");iconWrap.className="toast-overlay-icon "+type;svg.innerHTML=type==="ok"?'<circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>'  :'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';svg.style.stroke=type==="ok"?"#43e895":"#e05a52";listEl.innerHTML="";if(lines&&lines.length){lines.forEach(function(line){var li=document.createElement("li");li.textContent=line;if(type==="err")li.className="err-line";listEl.appendChild(li);});listEl.style.display="";}else{listEl.style.display="none";}overlay.classList.add("show");var delay=lines&&lines.length?Math.min(3000+lines.length*600,7000):3000;_bannerTimer=setTimeout(function(){dismissBanner();},delay);}
function dismissBanner(){var overlay=document.getElementById("toast-overlay");if(overlay)overlay.classList.remove("show");if(_bannerTimer){clearTimeout(_bannerTimer);_bannerTimer=null;}}
function showSaving(text,sub){document.getElementById("save-overlay-text").textContent=text||"Saving...";document.getElementById("save-overlay-sub").textContent=sub||"Please wait";document.getElementById("save-overlay").classList.add("show");}
function hideSaving(){document.getElementById("save-overlay").classList.remove("show");}

// ── loadGuestConfig ───────────────────────────────────────────────────────────
function loadGuestConfig(){
  ajax("GET",BASE+"/get_guest_config",null,function(cfg){
    if(!cfg||cfg.error){toast("err",(cfg&&cfg.error)||"Failed to load guest config");return;}
    _wpa3Supported = !!cfg.wpa3_supported;
    var ipEl=document.getElementById("guest-ipaddr");if(ipEl){ipEl.value=cfg.ipaddr||"192.168.2.1";_guestUpdateDhcpPreview(ipEl.value);}
    _guestNetSnap.ipaddr=cfg.ipaddr||"192.168.2.1";_guestNetDirty=false;
    var unb=document.getElementById("guest-net-undo-btn");if(unb)unb.classList.remove("visible");
    var totalIfaces=0;if(cfg.bands){for(var b in cfg.bands){if(cfg.bands[b].ifaces)totalIfaces+=cfg.bands[b].ifaces.length;}}
    var missing=[];
    if(!cfg.guest_zone_exists)missing.push("Network interface missing");
    else if(!cfg.interface_up&&totalIfaces>0)missing.push("Interface inactive (stopped)");
    if(!cfg.dhcp_ok)missing.push("DHCP pool");
    if(!cfg.firewall_ok)missing.push("Firewall rules");
    _existingSubnets=cfg.existing_subnets||{};
    var warnEl=document.getElementById("guest-dep-warning"),msgEl=document.getElementById("guest-dep-msg");
    if(missing.length>0){if(warnEl)warnEl.classList.add("show");if(msgEl)msgEl.textContent="Missing components: "+missing.join(", ")+". Guest network will not function correctly without them.";}
    else{if(warnEl)warnEl.classList.remove("show");}
    var gfwEl=document.getElementById("gfw-status");
    if(gfwEl){gfwEl.textContent=cfg.firewall_ok?"Configured":"Will be created on first save";gfwEl.className="guest-fw-val "+(cfg.firewall_ok?"ok":"warn");}
    var bandOrder=["2g","5g","5gb","6g"],firstBand=null;
    bandOrder.forEach(function(band){
      var bData=cfg.bands&&cfg.bands[band];
      var tab=document.getElementById("gtab-"+band),panel=document.getElementById("gbp-"+band);
      if(bData){if(tab)tab.style.display="";if(!firstBand)firstBand=band;buildGuestBandPanel(band,bData);}
      else{if(tab)tab.style.display="none";if(panel)panel.innerHTML="";}
    });
    if(firstBand)switchGuestBand(firstBand,document.getElementById("gtab-"+firstBand));
    updateUniversalSave();
    pollGuest();
  });
}

loadGuestConfig();
